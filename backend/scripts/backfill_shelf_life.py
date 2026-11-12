from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.services.shelf_life import enrich_items


PAGE_SIZE = 500


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill receipt_items.category, normalized_name, and shelf_life_days."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write updates to Supabase. Without this flag the script only previews changes.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of receipt_items rows to scan.",
    )
    parser.add_argument(
        "--only-missing",
        action="store_true",
        help="Only update rows where category or shelf_life_days is missing.",
    )
    return parser.parse_args()


def get_supabase_client():
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the backend environment."
        )
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def should_scan_row(row: dict[str, Any], only_missing: bool) -> bool:
    if not only_missing:
        return True
    return (
        row.get("normalized_name") is None
        or row.get("category") is None
        or row.get("shelf_life_days") is None
    )


def build_patch(row: dict[str, Any]) -> dict[str, Any]:
    enriched = enrich_items([row])[0]
    patch: dict[str, Any] = {}

    for field in ("normalized_name", "category", "shelf_life_days"):
        if enriched.get(field) != row.get(field):
            patch[field] = enriched.get(field)

    return patch


def fetch_rows(supabase, offset: int, page_size: int) -> list[dict[str, Any]]:
    response = (
        supabase.table("receipt_items")
        .select("id, name, normalized_name, category, shelf_life_days")
        .order("id")
        .range(offset, offset + page_size - 1)
        .execute()
    )
    return response.data or []


def main() -> int:
    args = parse_args()
    supabase = get_supabase_client()

    scanned = 0
    changed = 0
    skipped = 0
    offset = 0
    preview: list[tuple[dict[str, Any], dict[str, Any]]] = []

    while True:
        if args.limit is not None and scanned >= args.limit:
            break

        page_size = PAGE_SIZE
        if args.limit is not None:
            page_size = min(page_size, args.limit - scanned)

        rows = fetch_rows(supabase, offset, page_size)
        if not rows:
            break

        for row in rows:
            scanned += 1

            if not should_scan_row(row, args.only_missing):
                skipped += 1
                continue

            patch = build_patch(row)
            if not patch:
                continue

            changed += 1
            if len(preview) < 10:
                preview.append((row, patch))

            if args.apply:
                supabase.table("receipt_items").update(patch).eq("id", row["id"]).execute()

        offset += len(rows)
        if len(rows) < page_size:
            break

    mode = "APPLIED" if args.apply else "DRY RUN"
    print(f"{mode}: scanned={scanned}, changed={changed}, skipped={skipped}")

    if preview:
        print("\nPreview of first changes:")
        for row, patch in preview:
            before = {
                "name": row.get("name"),
                "normalized_name": row.get("normalized_name"),
                "category": row.get("category"),
                "shelf_life_days": row.get("shelf_life_days"),
            }
            print({"before": before, "patch": patch})

    if not args.apply and changed:
        print("\nRun again with --apply to write these updates.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
