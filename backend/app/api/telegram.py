import base64
import json

from fastapi import APIRouter, Request

from app.services.gemini import GeminiReceiptExtractor
from app.services.shelf_life import enrich_receipt
from app.services.telegram import get_file_bytes, send_message

router = APIRouter(prefix="/telegram", tags=["telegram"])

# Maps chat_id -> {image_base64, last_receipt_json}
# Note: in-memory only — resets if the server restarts.
_sessions: dict[int, dict] = {}


def _format_receipt(data: dict) -> str:
    lines = ["Receipt Extracted!\n"]

    if data.get("merchant"):
        lines.append(f"Merchant: {data['merchant']}")
    if data.get("purchase_date"):
        lines.append(f"Date: {data['purchase_date']}")

    items = data.get("items", [])
    if items:
        lines.append(f"\n{len(items)} item(s):")
        for item in items:
            name = item.get("name", "Unknown")
            price = item.get("price")
            category = item.get("category", "")
            shelf = item.get("shelf_life_days")

            price_str = f"RM {price:.2f}" if price is not None else ""
            shelf_str = f"{shelf} days" if shelf else ""
            detail = " | ".join(filter(None, [price_str, category, shelf_str]))
            lines.append(f"  - {name}" + (f" ({detail})" if detail else ""))
    else:
        lines.append("\nNo items found.")

    return "\n".join(lines)


@router.post("/webhook")
async def telegram_webhook(request: Request):
    """Receive Telegram updates and process receipt images sent to the bot."""
    update = await request.json()

    message = update.get("message", {})
    chat_id = message.get("chat", {}).get("id")

    if not chat_id:
        return {"ok": True}

    photos = message.get("photo")
    text = message.get("text", "").strip()

    # ── Photo received: scan the receipt ──────────────────────────────────────
    if photos:
        await send_message(chat_id, "Scanning your receipt, please wait...")
        try:
            image_bytes = await get_file_bytes(photos[-1]["file_id"])
            image_base64 = base64.b64encode(image_bytes).decode("utf-8")

            extractor = GeminiReceiptExtractor()
            extracted = await extractor.extract_from_image(image_base64)
            extracted = enrich_receipt(extracted)

            _sessions[chat_id] = {
                "image_base64": image_base64,
                "last_receipt": json.dumps(extracted),
            }

            await send_message(chat_id, _format_receipt(extracted))
            await send_message(chat_id, "You can now ask me questions about this receipt.")
        except Exception:
            await send_message(chat_id, "Sorry, I could not process your receipt. Please try again.")

        return {"ok": True}

    # ── Text received: follow-up question about the last receipt ──────────────
    if text:
        session = _sessions.get(chat_id)

        if not session:
            await send_message(chat_id, "Please send a receipt photo first.")
            return {"ok": True}

        try:
            extractor = GeminiReceiptExtractor()
            response = await extractor.chat_about_receipt(
                user_message=text,
                current_result=session["last_receipt"],
            )

            reply = response.get("reply") or "I reviewed the receipt."

            # Update session with corrected receipt if the model returned one
            if response.get("receipt"):
                response["receipt"] = enrich_receipt(response["receipt"])
                session["last_receipt"] = json.dumps(response["receipt"])

            await send_message(chat_id, reply)
        except Exception:
            await send_message(chat_id, "Sorry, I could not answer that. Please try again.")

        return {"ok": True}

    await send_message(chat_id, "Send me a receipt photo and I will extract the items for you.")
    return {"ok": True}
