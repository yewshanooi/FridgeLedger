from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class PantryStatus(str, Enum):
    active = "active"
    consumed = "consumed"
    wasted = "wasted"
    expired = "expired"


class PantryItem(BaseModel):
    id: str
    name: str
    normalized_name: str | None = None
    category: str | None = None
    quantity: float | None = None
    unit: str | None = None
    price: float | None = Field(default=None, ge=0)
    unit_price: float | None = Field(default=None, ge=0)
    estimated_expiry: date | None = None
    status: PantryStatus = PantryStatus.active
    created_at: datetime | None = None
