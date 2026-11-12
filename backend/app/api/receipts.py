import base64
import json
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.auth import get_supabase_client, require_user_id
from app.schemas.receipt import (
    ReceiptChatResponse,
    ReceiptScanResponse,
    ReceiptTextScanRequest,
)
from app.services.gemini import GeminiReceiptExtractor
from app.services.expiry_email import notify_expiry_on_upload
from app.services.shelf_life import enrich_receipt

router = APIRouter(prefix="/receipts", tags=["receipts"])
_MAX_RECEIPT_UPLOAD_BYTES = 8 * 1024 * 1024
_RECEIPT_IMAGE_BUCKET = "receipt-images"
_SIGNED_URL_TTL_SECONDS = 60 * 60


def _safe_image_ext(filename: str | None) -> str:
    ext = (filename or "").rsplit(".", 1)[-1].lower()
    return ext if ext in {"jpg", "jpeg", "png", "webp"} else "jpg"


def _validate_receipt_id(receipt_id: str) -> str:
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", receipt_id):
        raise HTTPException(status_code=400, detail="Invalid receipt id.")
    return receipt_id


def _assert_user_image_path(user_id: str, path: str) -> str:
    normalized = path.lstrip("/")
    if not normalized.startswith(f"{user_id}/"):
        raise HTTPException(status_code=403, detail="Cannot access this receipt image.")
    return normalized


@router.post("/scan", response_model=ReceiptScanResponse)
async def scan_receipt(
    file: UploadFile = File(...),
    _user_id: str = Depends(require_user_id),
) -> ReceiptScanResponse:
    """Upload a receipt image and extract grocery line items using Google Gemini."""
    if file.content_type is None or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a receipt image.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    if len(image_bytes) > _MAX_RECEIPT_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Receipt image is too large.")

    extractor = GeminiReceiptExtractor()

    try:
        extracted = await extractor.extract_from_image(
            base64.b64encode(image_bytes).decode("utf-8")
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API error: {exc}",
        ) from exc

    extracted = enrich_receipt(extracted)

    return ReceiptScanResponse(
        merchant=extracted.get("merchant"),
        purchase_date=extracted.get("purchase_date"),
        items=extracted.get("items", []),
        message="Receipt image parsed successfully.",
    )


@router.post("/chat", response_model=ReceiptChatResponse)
async def chat_about_receipt(
    message: str = Form(...),
    file: UploadFile = File(...),
    current_result: str | None = Form(default=None),
    _user_id: str = Depends(require_user_id),
) -> ReceiptChatResponse:
    """Send a correction or question about a previously extracted receipt and receive an updated extraction."""
    if file.content_type is None or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a receipt image.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    if len(image_bytes) > _MAX_RECEIPT_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Receipt image is too large.")

    parsed_current_result = current_result
    if current_result:
        try:
            parsed_current_result = json.dumps(json.loads(current_result), ensure_ascii=False)
        except json.JSONDecodeError:
            parsed_current_result = current_result

    extractor = GeminiReceiptExtractor()

    try:
        response = await extractor.chat_about_receipt(
            user_message=message,
            current_result=parsed_current_result,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API error: {exc}",
        ) from exc

    receipt = response.get("receipt")
    corrected_receipt = None
    if isinstance(receipt, dict):
        receipt = enrich_receipt(receipt)
        corrected_receipt = ReceiptScanResponse(
            merchant=receipt.get("merchant"),
            purchase_date=receipt.get("purchase_date"),
            items=receipt.get("items", []),
            message="Receipt updated from assistant feedback.",
        )

    return ReceiptChatResponse(
        reply=response.get("reply") or "I reviewed the receipt.",
        corrected_receipt=corrected_receipt,
    )


@router.post("/image")
async def upload_receipt_image(
    receipt_id: str = Form(...),
    file: UploadFile = File(...),
    user_id: str = Depends(require_user_id),
) -> dict[str, str]:
    if file.content_type is None or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a receipt image.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    if len(image_bytes) > _MAX_RECEIPT_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Receipt image is too large.")

    receipt_id = _validate_receipt_id(receipt_id)
    path = f"{user_id}/{receipt_id}/original.{_safe_image_ext(file.filename)}"

    try:
        get_supabase_client().storage.from_(_RECEIPT_IMAGE_BUCKET).upload(
            path,
            image_bytes,
            {
                "content-type": file.content_type,
                "cache-control": "31536000",
                "upsert": "true",
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Receipt image upload failed.") from exc

    return {"path": path}


@router.get("/image-url")
async def get_receipt_image_url(
    path: str,
    user_id: str = Depends(require_user_id),
) -> dict[str, str | None]:
    path = _assert_user_image_path(user_id, path)

    try:
        response = (
            get_supabase_client()
            .storage.from_(_RECEIPT_IMAGE_BUCKET)
            .create_signed_url(path, _SIGNED_URL_TTL_SECONDS)
        )
    except Exception as exc:
        raise HTTPException(status_code=404, detail="Receipt image not found.") from exc

    return {"signed_url": response.get("signedURL") or response.get("signed_url")}


@router.post("/scan-text", response_model=ReceiptScanResponse)
async def scan_receipt_text(
    payload: ReceiptTextScanRequest,
    _user_id: str = Depends(require_user_id),
) -> ReceiptScanResponse:
    """Extract grocery line items from pasted receipt text using Google Gemini."""
    extractor = GeminiReceiptExtractor()

    try:
        extracted = await extractor.extract_from_text(payload.receipt_text)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API error: {exc}",
        ) from exc

    extracted = enrich_receipt(extracted)

    return ReceiptScanResponse(
        merchant=extracted.get("merchant"),
        purchase_date=extracted.get("purchase_date"),
        items=extracted.get("items", []),
        message="Receipt text parsed with Gemini.",
    )


@router.post("/{receipt_id}/notify-expiry")
async def notify_receipt_expiry(
    receipt_id: str,
    user_id: str = Depends(require_user_id),
) -> dict[str, object]:
    """Check a newly saved receipt for items expiring within 7 days and send an immediate email."""
    receipt_id = _validate_receipt_id(receipt_id)
    try:
        result = notify_expiry_on_upload(receipt_id, user_id)
    except Exception:
        return {"notified": False}
    return result
