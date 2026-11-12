from datetime import datetime, timedelta
from typing import Literal
from collections import defaultdict
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from supabase import create_client

from app.core.auth import require_user_id
from app.core.config import settings

router = APIRouter(prefix="/insights", tags=["insights"])


# ─── Response Models ──────────────────────────────────────────────────────────


class MonthlySpendingItem(BaseModel):
    month: str
    spending: float


class CategorySpendingItem(BaseModel):
    name: str
    value: float


class LocationSpendingItem(BaseModel):
    location: str
    spending: float


class CategoryCountItem(BaseModel):
    category: str
    count: int


class ExpiryStatusItem(BaseModel):
    name: str
    value: int
    color: str


class SummaryStats(BaseModel):
    total_receipts: int
    total_items: int
    total_spent: float
    avg_per_receipt: float


class PricePoint(BaseModel):
    purchase_date: str
    price: float


class InflationItem(BaseModel):
    item_name: str
    merchant: str
    first_purchase_date: str
    first_price: float
    latest_purchase_date: str
    latest_price: float
    price_change: float
    price_change_percent: float
    price_history: list[PricePoint]  # All price points for the line graph


class AnalyticsResponse(BaseModel):
    monthly_spending: list[MonthlySpendingItem]
    category_spending: list[CategorySpendingItem]
    location_spending: list[LocationSpendingItem]
    category_count: list[CategoryCountItem]
    expiry_status: list[ExpiryStatusItem]
    summary: SummaryStats
    inflation_items: list[InflationItem]


class WasteRatioItem(BaseModel):
    name: str
    value: int
    color: str


class WasteSummary(BaseModel):
    consumed_count: int
    wasted_count: int
    tracked_count: int
    waste_ratio_percent: float
    consumed_value: float
    wasted_value: float


class WasteItem(BaseModel):
    name: str
    category: str | None = None
    price: float | None = None
    merchant: str
    purchase_date: str | None = None


class WasteResponse(BaseModel):
    waste_ratio: list[WasteRatioItem]
    summary: WasteSummary
    wasted_items: list[WasteItem]


# ─── Helper Functions ─────────────────────────────────────────────────────────


def get_supabase_client():
    """Create and return a Supabase client."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise HTTPException(
            status_code=500, detail="Supabase configuration is missing"
        )
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def normalize_item_name(name: str) -> str:
    """
    Normalize item name for fuzzy matching.
    Removes size indicators, extra whitespace, and standardizes format.
    """
    # Convert to lowercase
    name = name.lower().strip()
    
    # Remove common size/quantity indicators (e.g., "1L", "500ml", "2kg")
    name = re.sub(r'\b\d+\.?\d*\s*(ml|l|g|kg|oz|lb|pcs|pc|pieces?)\b', '', name, flags=re.IGNORECASE)
    
    # Remove special characters and extra whitespace
    name = re.sub(r'[^\w\s]', ' ', name)
    name = ' '.join(name.split())
    
    return name.strip()


def calculate_similarity(str1: str, str2: str) -> float:
    """
    Calculate simple similarity score between two strings.
    Returns a value between 0 and 1, where 1 is identical.
    Uses a simple word-based approach.
    """
    words1 = set(str1.lower().split())
    words2 = set(str2.lower().split())
    
    if not words1 or not words2:
        return 0.0
    
    intersection = words1.intersection(words2)
    union = words1.union(words2)
    
    return len(intersection) / len(union) if union else 0.0


def items_match(name1: str, name2: str, threshold: float = 0.6) -> bool:
    """
    Determine if two item names refer to the same product.
    Uses fuzzy matching with a similarity threshold.
    """
    normalized1 = normalize_item_name(name1)
    normalized2 = normalize_item_name(name2)
    
    # Exact match after normalization
    if normalized1 == normalized2:
        return True
    
    # Fuzzy match using similarity score
    similarity = calculate_similarity(normalized1, normalized2)
    return similarity >= threshold


def filter_receipts_by_period(
    receipts: list[dict],
    period: str,
    custom_start: str | None = None,
    custom_end: str | None = None,
) -> list[dict]:
    """Filter receipts based on time period."""
    if period == "All":
        return receipts

    now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    filtered = []
    for receipt in receipts:
        purchase_date_str = receipt.get("purchase_date")
        if not purchase_date_str:
            continue

        purchase_date = datetime.fromisoformat(purchase_date_str.replace("Z", "+00:00"))
        purchase_date = purchase_date.replace(hour=0, minute=0, second=0, microsecond=0)

        if period == "Last24Hours":
            if purchase_date.date() == now.date():
                filtered.append(receipt)

        elif period == "Last7Days":
            days_diff = (now - purchase_date).days
            if 0 <= days_diff < 7:
                filtered.append(receipt)

        elif period == "Last30Days":
            days_diff = (now - purchase_date).days
            if 0 <= days_diff < 30:
                filtered.append(receipt)

        elif period == "YTD":
            if purchase_date.year == now.year:
                filtered.append(receipt)

        elif period == "Custom":
            if custom_start and custom_end:
                start_date = datetime.fromisoformat(custom_start).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
                end_date = datetime.fromisoformat(custom_end).replace(
                    hour=23, minute=59, second=59, microsecond=999999
                )
                if start_date <= purchase_date <= end_date:
                    filtered.append(receipt)

    return filtered


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/analytics", response_model=AnalyticsResponse)
async def get_analytics(
    user_id: str | None = Query(None, description="Deprecated. User is taken from the auth token."),
    period: Literal["All", "Last24Hours", "Last7Days", "Last30Days", "YTD", "Custom"] = Query(
        "All", description="Time period filter"
    ),
    custom_start: str | None = Query(None, description="Custom start date (ISO format)"),
    custom_end: str | None = Query(None, description="Custom end date (ISO format)"),
    current_user_id: str = Depends(require_user_id),
) -> AnalyticsResponse:
    """
    Return comprehensive analytics data including:
    - Monthly spending trends
    - Category spending breakdown
    - Location spending breakdown
    - Category item counts
    - Expiry status distribution
    - Summary statistics
    """
    supabase = get_supabase_client()
    if user_id and user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot access another user's analytics")

    # Fetch receipts with items in a single query using join
    receipts_response = (
        supabase.table("receipts")
        .select("id, merchant, purchase_date, receipt_items(name, category, price, shelf_life_days, status)")
        .eq("user_id", current_user_id)
        .order("purchase_date", desc=True)
        .execute()
    )

    if not receipts_response.data:
        # Return empty analytics
        return AnalyticsResponse(
            monthly_spending=[],
            category_spending=[],
            location_spending=[],
            category_count=[],
            expiry_status=[],
            summary=SummaryStats(
                total_receipts=0, total_items=0, total_spent=0.0, avg_per_receipt=0.0
            ),
            inflation_items=[],
        )

    # Normalize the data structure (Supabase returns items as 'receipt_items')
    receipts = receipts_response.data
    for receipt in receipts:
        receipt["items"] = receipt.pop("receipt_items", [])

    # Filter receipts by period
    filtered_receipts = filter_receipts_by_period(
        receipts, period, custom_start, custom_end
    )

    # ─── Build All Aggregations in Single Pass ────────────────────────────────
    monthly_map: dict[str, float] = {}
    category_map: dict[str, float] = {}
    location_map: dict[str, float] = {}
    category_count_map: dict[str, int] = {}
    
    for receipt in filtered_receipts:
        purchase_date = receipt.get("purchase_date")
        merchant = receipt.get("merchant") or "Unknown"
        items = receipt.get("items", [])
        
        # Calculate receipt total once
        receipt_total = sum(item.get("price", 0) or 0 for item in items)
        
        # Monthly spending
        if purchase_date:
            dt = datetime.fromisoformat(purchase_date.replace("Z", "+00:00"))
            month_key = f"{dt.year}-{str(dt.month).zfill(2)}"
            monthly_map[month_key] = monthly_map.get(month_key, 0) + receipt_total
        
        # Location spending
        location_map[merchant] = location_map.get(merchant, 0) + receipt_total
        
        # Category spending and count
        for item in items:
            category = item.get("category") or "Uncategorised"
            price = item.get("price", 0) or 0
            category_map[category] = category_map.get(category, 0) + price
            category_count_map[category] = category_count_map.get(category, 0) + 1

    monthly_spending = [
        MonthlySpendingItem(
            month=datetime.strptime(key, "%Y-%m").strftime("%b %Y"),
            spending=round(value, 2),
        )
        for key, value in sorted(monthly_map.items())
    ]

    category_spending = sorted(
        [
            CategorySpendingItem(name=name, value=round(value, 2))
            for name, value in category_map.items()
        ],
        key=lambda x: x.value,
        reverse=True,
    )

    location_spending = sorted(
        [
            LocationSpendingItem(location=loc, spending=round(spend, 2))
            for loc, spend in location_map.items()
        ],
        key=lambda x: x.spending,
        reverse=True,
    )

    category_count = sorted(
        [
            CategoryCountItem(category=cat, count=cnt)
            for cat, cnt in category_count_map.items()
        ],
        key=lambda x: x.count,
        reverse=True,
    )

    # ─── Build Expiry Status ──────────────────────────────────────────────────
    now = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    fresh = 0
    soon = 0
    urgent = 0
    expired = 0

    for receipt in filtered_receipts:
        purchase_date_str = receipt.get("purchase_date")
        if not purchase_date_str:
            continue
        purchase_date = datetime.fromisoformat(purchase_date_str.replace("Z", "+00:00"))

        for item in receipt.get("items", []):
            if item.get("status") in ("consumed", "wasted"):
                continue

            shelf_life = item.get("shelf_life_days")
            if not shelf_life:
                continue

            expiry_date = purchase_date.replace(
                hour=0, minute=0, second=0, microsecond=0
            ) + timedelta(days=shelf_life)
            days_until_expiry = (expiry_date - now).days

            if days_until_expiry < 0:
                expired += 1
            elif days_until_expiry <= 3:
                urgent += 1
            elif days_until_expiry <= 7:
                soon += 1
            else:
                fresh += 1

    expiry_status = [
        ExpiryStatusItem(name="Fresh (>7d)", value=fresh, color="#059669"),
        ExpiryStatusItem(name="Expiring soon (≤7d)", value=soon, color="#d97706"),
        ExpiryStatusItem(name="Urgent (≤3d)", value=urgent, color="#ea580c"),
        ExpiryStatusItem(name="Expired", value=expired, color="#e11d48"),
    ]
    expiry_status = [item for item in expiry_status if item.value > 0]

    # ─── Build Summary Stats ──────────────────────────────────────────────────
    total_receipts = len(filtered_receipts)
    total_items = sum(len(r.get("items", [])) for r in filtered_receipts)
    total_spent = sum(
        sum(item.get("price", 0) or 0 for item in r.get("items", []))
        for r in filtered_receipts
    )
    avg_per_receipt = total_spent / total_receipts if total_receipts > 0 else 0.0

    summary = SummaryStats(
        total_receipts=total_receipts,
        total_items=total_items,
        total_spent=round(total_spent, 2),
        avg_per_receipt=round(avg_per_receipt, 2),
    )

    # ─── Build Inflation Data ─────────────────────────────────────────────────
    # Group items by (merchant, normalized_item_name) across filtered receipts only
    item_groups: dict[tuple[str, str], list[dict]] = {}
    
    # Use filtered_receipts for period-aware inflation tracking
    receipts_to_analyze = filtered_receipts if period != "All" else receipts
    
    for receipt in receipts_to_analyze:
        merchant = receipt.get("merchant") or "Unknown"
        purchase_date = receipt["purchase_date"]
        
        for item in receipt.get("items", []):
            if not item.get("name") or item.get("price") is None:
                continue
            
            item_name = item["name"]
            
            # Find matching group using fuzzy matching
            matched_key = None
            for existing_key in item_groups.keys():
                existing_merchant, existing_normalized = existing_key
                if existing_merchant == merchant and items_match(item_name, existing_normalized):
                    matched_key = existing_key
                    break
            
            # If no match found, create new group with normalized name
            if matched_key is None:
                normalized_name = normalize_item_name(item_name)
                matched_key = (merchant, normalized_name)
                item_groups[matched_key] = []
            
            item_groups[matched_key].append({
                "name": item["name"],
                "price": item["price"],
                "purchase_date": purchase_date,
                "merchant": merchant
            })

    # Find inflation: items with price increases
    inflation_items = []
    
    for (merchant, normalized_name), purchases in item_groups.items():
        if len(purchases) < 2:
            continue
        
        # Sort by purchase date
        purchases.sort(key=lambda x: x["purchase_date"])
        
        # Aggregate duplicate purchases on same date (take average price)
        date_prices: dict[str, list[float]] = defaultdict(list)
        date_names: dict[str, str] = {}  # Keep track of original name for each date
        
        for p in purchases:
            date_prices[p["purchase_date"]].append(p["price"])
            if p["purchase_date"] not in date_names:
                date_names[p["purchase_date"]] = p["name"]
        
        # Create aggregated purchase list with average prices per date
        aggregated_purchases = [
            {
                "name": date_names[date],
                "price": sum(prices) / len(prices),  # Average price
                "purchase_date": date,
                "merchant": merchant
            }
            for date, prices in sorted(date_prices.items())
        ]
        
        if len(aggregated_purchases) < 2:
            continue
        
        # Get first and latest purchase within the filtered period
        first_purchase = aggregated_purchases[0]
        latest_purchase = aggregated_purchases[-1]
        
        # Only include price increases
        if latest_purchase["price"] > first_purchase["price"]:
            price_change = latest_purchase["price"] - first_purchase["price"]
            price_change_percent = (price_change / first_purchase["price"]) * 100
            
            # Build complete price history for the line graph (using aggregated data)
            price_history = [
                PricePoint(
                    purchase_date=p["purchase_date"],
                    price=round(p["price"], 2)
                )
                for p in aggregated_purchases
            ]
            
            inflation_items.append(
                InflationItem(
                    item_name=first_purchase["name"],
                    merchant=merchant,
                    first_purchase_date=first_purchase["purchase_date"],
                    first_price=round(first_purchase["price"], 2),
                    latest_purchase_date=latest_purchase["purchase_date"],
                    latest_price=round(latest_purchase["price"], 2),
                    price_change=round(price_change, 2),
                    price_change_percent=round(price_change_percent, 2),
                    price_history=price_history
                )
            )
    
    # Sort by price change percentage (highest first)
    inflation_items.sort(key=lambda x: x.price_change_percent, reverse=True)

    return AnalyticsResponse(
        monthly_spending=monthly_spending,
        category_spending=category_spending,
        location_spending=location_spending,
        category_count=category_count,
        expiry_status=expiry_status,
        summary=summary,
        inflation_items=inflation_items,
    )



@router.get("/waste", response_model=WasteResponse)
async def waste_insights(
    user_id: str | None = Query(None, description="Deprecated. User is taken from the auth token."),
    period: Literal["All", "Last24Hours", "Last7Days", "Last30Days", "YTD", "Custom"] = Query(
        "All", description="Time period filter"
    ),
    custom_start: str | None = Query(None, description="Custom start date (ISO format)"),
    custom_end: str | None = Query(None, description="Custom end date (ISO format)"),
    current_user_id: str = Depends(require_user_id),
) -> WasteResponse:
    """Return the user's pantry waste ratio based on consumed versus wasted item records."""
    supabase = get_supabase_client()
    if user_id and user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot access another user's waste data")

    receipts_response = (
        supabase.table("receipts")
        .select("id, merchant, purchase_date, receipt_items(name, category, price, status)")
        .eq("user_id", current_user_id)
        .order("purchase_date", desc=True)
        .execute()
    )

    # Normalize the data structure (Supabase returns items as 'receipt_items')
    receipts = receipts_response.data or []
    for receipt in receipts:
        receipt["items"] = receipt.pop("receipt_items", [])

    # Filter receipts by period
    filtered_receipts = filter_receipts_by_period(
        receipts, period, custom_start, custom_end
    )

    consumed_count = 0
    wasted_count = 0
    consumed_value = 0.0
    wasted_value = 0.0
    wasted_items: list[WasteItem] = []

    for receipt in filtered_receipts:
        merchant = receipt.get("merchant") or "Unknown"
        purchase_date = receipt.get("purchase_date")

        for item in receipt.get("items", []):
            status = item.get("status")
            price = item.get("price") or 0

            if status == "consumed":
                consumed_count += 1
                consumed_value += price
            elif status == "wasted":
                wasted_count += 1
                wasted_value += price
                wasted_items.append(
                    WasteItem(
                        name=item.get("name") or "Unknown item",
                        category=item.get("category"),
                        price=item.get("price"),
                        merchant=merchant,
                        purchase_date=purchase_date,
                    )
                )

    tracked_count = consumed_count + wasted_count
    waste_ratio_percent = (
        (wasted_count / tracked_count) * 100 if tracked_count > 0 else 0.0
    )

    waste_ratio = []
    if consumed_count > 0:
        waste_ratio.append(
            WasteRatioItem(name="Consumed", value=consumed_count, color="#059669")
        )
    if wasted_count > 0:
        waste_ratio.append(
            WasteRatioItem(name="Wasted", value=wasted_count, color="#e11d48")
        )

    return WasteResponse(
        waste_ratio=waste_ratio,
        summary=WasteSummary(
            consumed_count=consumed_count,
            wasted_count=wasted_count,
            tracked_count=tracked_count,
            waste_ratio_percent=round(waste_ratio_percent, 2),
            consumed_value=round(consumed_value, 2),
            wasted_value=round(wasted_value, 2),
        ),
        wasted_items=wasted_items,
    )
