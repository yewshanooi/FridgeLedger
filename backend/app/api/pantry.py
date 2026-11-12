from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import create_client

from app.core.auth import require_user_id
from app.core.config import settings
from app.schemas.pantry import PantryItem, PantryStatus

router = APIRouter(prefix="/pantry", tags=["pantry"])


def get_supabase_client():
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(status_code=500, detail="Supabase configuration is missing")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


@router.get("", response_model=list[PantryItem])
async def list_pantry_items(
    status: PantryStatus | None = Query(None, description="Filter by item status (active, consumed, wasted, expired)"),
    user_id: str = Depends(require_user_id),
) -> list[PantryItem]:
    """Return pantry items for the authenticated user, derived from saved receipt items."""
    supabase = get_supabase_client()

    receipts_response = (
        supabase.table("receipts")
        .select(
            "id, purchase_date, saved_at, "
            "receipt_items(id, name, normalized_name, category, quantity, unit, price, shelf_life_days, status, used_at)"
        )
        .eq("user_id", user_id)
        .order("purchase_date", desc=True)
        .execute()
    )

    items: list[PantryItem] = []

    for receipt in receipts_response.data or []:
        purchase_date_str = receipt.get("purchase_date")
        saved_at = receipt.get("saved_at")

        purchase_date: date | None = None
        if purchase_date_str:
            try:
                purchase_date = date.fromisoformat(purchase_date_str[:10])
            except ValueError:
                purchase_date = None

        created_at: datetime | None = None
        if saved_at:
            try:
                created_at = datetime.fromisoformat(saved_at.replace("Z", "+00:00"))
            except ValueError:
                created_at = None

        for row in receipt.get("receipt_items") or []:
            raw_status = row.get("status", "active")
            try:
                item_status = PantryStatus(raw_status)
            except ValueError:
                item_status = PantryStatus.active

            if status is not None and item_status != status:
                continue

            shelf_life = row.get("shelf_life_days")
            estimated_expiry: date | None = None
            if purchase_date is not None and shelf_life is not None:
                try:
                    estimated_expiry = purchase_date + timedelta(days=int(shelf_life))
                except (TypeError, ValueError):
                    estimated_expiry = None

            price = row.get("price")
            quantity = row.get("quantity")
            unit_price: float | None = None
            if price is not None and quantity is not None:
                try:
                    q = float(quantity)
                    if q > 0:
                        unit_price = round(float(price) / q, 4)
                except (TypeError, ValueError):
                    unit_price = None

            items.append(
                PantryItem(
                    id=str(row["id"]),
                    name=row["name"],
                    normalized_name=row.get("normalized_name"),
                    category=row.get("category"),
                    quantity=quantity,
                    unit=row.get("unit"),
                    price=price,
                    unit_price=unit_price,
                    estimated_expiry=estimated_expiry,
                    status=item_status,
                    created_at=created_at,
                )
            )

    return items
