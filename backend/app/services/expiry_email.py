from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from html import escape
from typing import Any

from app.core.auth import get_supabase_client
from app.services.email import send_email


NOTIFICATION_STAGE = "soon"


@dataclass(frozen=True)
class SoonFoodNotification:
    user_id: str
    receipt_item_id: str
    name: str
    merchant: str
    expiry_date: date
    days_left: int
    category: str | None = None
    quantity: float | None = None
    unit: str | None = None


def _parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except ValueError:
            try:
                return date.fromisoformat(value[:10])
            except ValueError:
                return None
    return None


def collect_soon_food_notifications(window_days: int = 7) -> dict[str, list[SoonFoodNotification]]:
    today = date.today()
    supabase = get_supabase_client()

    response = (
        supabase.table("receipts")
        .select(
            "id,user_id,merchant,purchase_date,"
            "receipt_items(id,name,category,quantity,unit,shelf_life_days,status)"
        )
        .order("purchase_date", desc=True)
        .execute()
    )

    notifications_by_user: dict[str, list[SoonFoodNotification]] = {}
    for receipt in response.data or []:
        user_id = receipt.get("user_id")
        purchase_date = _parse_date(receipt.get("purchase_date"))
        if not user_id or purchase_date is None:
            continue

        for item in receipt.get("receipt_items", []) or []:
            if item.get("status") in {"consumed", "wasted"}:
                continue
            if not item.get("id") or item.get("shelf_life_days") is None:
                continue

            try:
                expiry_date = purchase_date + timedelta(days=int(item["shelf_life_days"]))
            except (TypeError, ValueError):
                continue

            days_left = (expiry_date - today).days
            if days_left < 0 or days_left > window_days:
                continue

            notifications_by_user.setdefault(str(user_id), []).append(
                SoonFoodNotification(
                    user_id=str(user_id),
                    receipt_item_id=str(item["id"]),
                    name=item.get("name") or "Unknown item",
                    merchant=receipt.get("merchant") or "Unknown",
                    expiry_date=expiry_date,
                    days_left=days_left,
                    category=item.get("category"),
                    quantity=item.get("quantity"),
                    unit=item.get("unit"),
                )
            )

    for user_items in notifications_by_user.values():
        user_items.sort(key=lambda item: (item.days_left, item.name))

    return notifications_by_user


def _filter_unsent(
    user_id: str,
    notifications: list[SoonFoodNotification],
) -> list[SoonFoodNotification]:
    if not notifications:
        return []

    supabase = get_supabase_client()
    item_ids = [item.receipt_item_id for item in notifications]
    response = (
        supabase.table("expiry_email_notifications")
        .select("receipt_item_id")
        .eq("user_id", user_id)
        .eq("stage", NOTIFICATION_STAGE)
        .in_("receipt_item_id", item_ids)
        .execute()
    )
    sent_ids = {str(row["receipt_item_id"]) for row in response.data or []}
    return [item for item in notifications if item.receipt_item_id not in sent_ids]


def _get_user_email(user_id: str) -> str | None:
    supabase = get_supabase_client()
    try:
        response = supabase.auth.admin.get_user_by_id(user_id)
    except Exception:
        return None

    user = getattr(response, "user", None)
    if user is None and isinstance(response, dict):
        user = response.get("user")

    if isinstance(user, dict):
        return user.get("email")
    return getattr(user, "email", None)


def _relative_label(days_left: int) -> str:
    if days_left == 0:
        return "expires today"
    if days_left == 1:
        return "expires tomorrow"
    return f"expires in {days_left} days"


def _render_email(items: list[SoonFoodNotification]) -> tuple[str, str]:
    text_lines = [
        "FridgeLedger food expiry reminder",
        "",
        "These food items are expiring soon:",
    ]
    for item in items:
        text_lines.append(
            f"- {item.name} from {item.merchant}: {_relative_label(item.days_left)}"
        )

    html_items = "".join(
        "<li>"
        f"<strong>{escape(item.name)}</strong> from {escape(item.merchant)} "
        f"- {escape(_relative_label(item.days_left))}"
        "</li>"
        for item in items
    )
    html_body = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #1f2a24;">
        <h2>FridgeLedger food expiry reminder</h2>
        <p>These food items are expiring soon:</p>
        <ul>{html_items}</ul>
      </body>
    </html>
    """
    return "\n".join(text_lines), html_body


def _record_sent(items: list[SoonFoodNotification]) -> None:
    if not items:
        return

    supabase = get_supabase_client()
    supabase.table("expiry_email_notifications").insert(
        [
            {
                "user_id": item.user_id,
                "receipt_item_id": item.receipt_item_id,
                "stage": NOTIFICATION_STAGE,
                "sent_at": datetime.utcnow().isoformat() + "Z",
            }
            for item in items
        ]
    ).execute()


def notify_expiry_on_upload(
    receipt_id: str,
    user_id: str,
    window_days: int = 7,
) -> dict[str, Any]:
    """Send an immediate expiry email for a newly uploaded receipt."""
    supabase = get_supabase_client()

    response = (
        supabase.table("receipts")
        .select(
            "id, merchant, purchase_date, "
            "receipt_items(id, name, category, quantity, unit, shelf_life_days, status)"
        )
        .eq("id", receipt_id)
        .eq("user_id", user_id)
        .execute()
    )

    receipts = response.data or []
    if not receipts:
        return {"notified": False, "reason": "receipt_not_found"}

    receipt = receipts[0]
    purchase_date = _parse_date(receipt.get("purchase_date"))
    if not purchase_date:
        return {"notified": False, "reason": "invalid_purchase_date"}

    today = date.today()
    notifications: list[SoonFoodNotification] = []

    for item in receipt.get("receipt_items") or []:
        if item.get("status") in {"consumed", "wasted"}:
            continue
        shelf_life = item.get("shelf_life_days")
        if not shelf_life or not item.get("id"):
            continue
        try:
            expiry_date = purchase_date + timedelta(days=int(shelf_life))
        except (TypeError, ValueError):
            continue

        days_left = (expiry_date - today).days
        if days_left < 0 or days_left > window_days:
            continue

        notifications.append(
            SoonFoodNotification(
                user_id=user_id,
                receipt_item_id=str(item["id"]),
                name=item.get("name") or "Unknown item",
                merchant=receipt.get("merchant") or "Unknown",
                expiry_date=expiry_date,
                days_left=days_left,
                category=item.get("category"),
                quantity=item.get("quantity"),
                unit=item.get("unit"),
            )
        )

    if not notifications:
        return {"notified": False, "reason": "no_items_expiring_soon"}

    unsent = _filter_unsent(user_id, notifications)
    if not unsent:
        return {"notified": False, "reason": "already_notified"}

    email = _get_user_email(user_id)
    if not email:
        return {"notified": False, "reason": "missing_email"}

    text_body, html_body = _render_email(unsent)
    send_email(
        to_email=email,
        subject="FridgeLedger: food expiring soon",
        text_body=text_body,
        html_body=html_body,
    )
    _record_sent(unsent)

    return {
        "notified": True,
        "items_count": len(unsent),
        "items": [n.name for n in unsent],
    }


def send_soon_food_emails(window_days: int = 7, dry_run: bool = True) -> dict[str, Any]:
    notifications_by_user = collect_soon_food_notifications(window_days)
    result: dict[str, Any] = {
        "dry_run": dry_run,
        "users_scanned": len(notifications_by_user),
        "emails_ready": 0,
        "items_ready": 0,
        "emails_sent": 0,
        "items_notified": 0,
        "skipped_users": [],
        "users": [],
    }

    for user_id, notifications in notifications_by_user.items():
        unsent = _filter_unsent(user_id, notifications)
        if not unsent:
            continue

        email = _get_user_email(user_id)
        if not email:
            result["skipped_users"].append({"user_id": user_id, "reason": "missing_email"})
            continue

        text_body, html_body = _render_email(unsent)
        result["emails_ready"] += 1
        result["items_ready"] += len(unsent)
        if not dry_run:
            send_email(
                to_email=email,
                subject="FridgeLedger: food expiring soon",
                text_body=text_body,
                html_body=html_body,
            )
            _record_sent(unsent)
            result["emails_sent"] += 1
            result["items_notified"] += len(unsent)

        result["users"].append(
            {
                "user_id": user_id,
                "email": email,
                "item_count": len(unsent),
                "items": [
                    {
                        "receipt_item_id": item.receipt_item_id,
                        "name": item.name,
                        "days_left": item.days_left,
                    }
                    for item in unsent
                ],
            }
        )

    return result
