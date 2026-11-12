from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class ExtractedReceiptItem(BaseModel):
    name: str
    normalized_name: str | None = None
    category: Literal["fresh", "dairy", "pantry", "frozen", "beverage", "household", "snack", "other"] | None = None
    quantity: float | None = None
    unit: Literal["kg", "g", "l", "ml", "pcs", "pack"] | None = None
    price: float | None = Field(default=None, ge=0)
    shelf_life_days: int | None = Field(default=None, ge=0)


class ExtractedReceipt(BaseModel):
    merchant: str | None = None
    purchase_date: str | None = Field(default=None, description="ISO date string YYYY-MM-DD")
    items: list[ExtractedReceiptItem]


class CorrectedReceipt(BaseModel):
    reply: str
    receipt: ExtractedReceipt


class ReceiptTextScanRequest(BaseModel):
    receipt_text: str = Field(min_length=5)


class ReceiptScanResponse(BaseModel):
    merchant: str | None = None
    purchase_date: date | None = None
    items: list[ExtractedReceiptItem]
    message: str


class ReceiptChatResponse(BaseModel):
    reply: str
    corrected_receipt: ReceiptScanResponse | None = None
