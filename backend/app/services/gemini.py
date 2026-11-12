import asyncio
import base64
import io

from google import genai
from google.genai import types
from PIL import Image

from app.core.config import settings
from app.schemas.receipt import CorrectedReceipt, ExtractedReceipt

_MAX_IMAGE_BYTES = 4 * 1024 * 1024   # 4 MB — safe margin for Gemini inline images
_MAX_DIMENSION = 1568                 # Recommended max side length for vision models

_EXTRACT_SYSTEM = """You extract grocery receipt data for a pantry management app.

Rules:
- Convert prices to numbers.
- Infer category and shelf_life_days when the product type is clear.
- If a field is unknown, use null.
- Keep item names concise but preserve distinctive product words visible on the receipt.
- Include only actual purchased products. Ignore tax lines, payment lines, totals, cashier info, and loyalty messages.
- Do not invent items unless they are visibly printed on the receipt.
- Dates on receipts follow DD/MM/YYYY format (Malaysian). Convert to ISO YYYY-MM-DD when populating purchase_date."""

_CHAT_SYSTEM = """You are helping a user correct previously extracted grocery receipt data.

The current extracted data is the source of truth. Apply only the correction the user explicitly requests.

Rules:
- Only modify the field(s) the user explicitly mentions.
- Keep all other fields exactly as they are in the current extracted data.
- Do not re-read or re-interpret the original receipt image.
- Keep the reply concise."""


def _detect_mime_type(image_bytes: bytes) -> str:
    if image_bytes[:2] == b"\xff\xd8":
        return "image/jpeg"
    if image_bytes[:4] == b"\x89PNG":
        return "image/png"
    if image_bytes[:4] == b"RIFF":
        return "image/webp"
    return "image/jpeg"


def _prepare_image(image_bytes: bytes) -> tuple[bytes, str]:
    """Resize and compress image so it fits within Gemini's inline size limit.

    Returns (processed_bytes, mime_type_string).
    If the image is already small enough, it is returned as-is with its
    detected MIME type.  Otherwise it is re-encoded as JPEG at progressively
    lower quality until it falls below _MAX_IMAGE_BYTES.
    """
    if len(image_bytes) <= _MAX_IMAGE_BYTES:
        return image_bytes, _detect_mime_type(image_bytes)

    img = Image.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    w, h = img.size
    if max(w, h) > _MAX_DIMENSION:
        ratio = _MAX_DIMENSION / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    for quality in (85, 75, 65, 50, 40):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        data = buf.getvalue()
        if len(data) <= _MAX_IMAGE_BYTES:
            return data, "image/jpeg"

    return data, "image/jpeg"


class GeminiReceiptExtractor:
    def __init__(self, model_id: str | None = None) -> None:
        self.model_id = model_id or settings.gemini_model_id or "gemini-3.5-flash-lite"
        self.client = genai.Client(api_key=settings.gemini_api_key)

    async def extract_from_image(self, image_base64: str) -> dict:
        image_bytes = base64.b64decode(image_base64)
        return await asyncio.to_thread(
            self._invoke_extract,
            "Read this receipt image and extract all grocery line items.",
            image_bytes,
        )

    async def extract_from_text(self, receipt_text: str) -> dict:
        return await asyncio.to_thread(
            self._invoke_extract,
            f"Receipt text:\n{receipt_text}",
        )

    async def chat_about_receipt(
        self, user_message: str, current_result: str | None = None
    ) -> dict:
        context = f"Current extracted data:\n{current_result or 'None'}\n\nUser message:\n{user_message}"
        return await asyncio.to_thread(
            self._invoke_chat,
            context,
        )

    def _invoke_extract(
        self,
        user_text: str,
        image_bytes: bytes | None = None,
    ) -> dict:
        contents: list = []
        if image_bytes is not None:
            image_bytes, mime_type = _prepare_image(image_bytes)
            contents.append(
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
            )
        contents.append(user_text)

        response = self.client.models.generate_content(
            model=self.model_id,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=_EXTRACT_SYSTEM,
                response_mime_type="application/json",
                response_schema=ExtractedReceipt,
                temperature=0,
                max_output_tokens=1024,
            ),
        )

        parsed = response.parsed
        if parsed is None:
            raise ValueError("Model did not return structured receipt data.")

        return parsed.model_dump()

    def _invoke_chat(
        self,
        user_text: str,
    ) -> dict:
        response = self.client.models.generate_content(
            model=self.model_id,
            contents=[user_text],
            config=types.GenerateContentConfig(
                system_instruction=_CHAT_SYSTEM,
                response_mime_type="application/json",
                response_schema=CorrectedReceipt,
                temperature=0,
                max_output_tokens=1024,
            ),
        )

        parsed = response.parsed
        if parsed is None:
            raise ValueError("Model did not return structured correction data.")

        return parsed.model_dump()
