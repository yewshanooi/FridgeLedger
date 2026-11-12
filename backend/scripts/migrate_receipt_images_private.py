from __future__ import annotations

import argparse
import mimetypes
import sys
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings


BUCKET = "receipt-images"
PUBLIC_PREFIX = f"/storage/v1/object/public/{BUCKET}/"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Move legacy public receipt images into user_id/receipt_id private paths."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write Storage and receipts.image_url updates. Without this flag only previews changes.",
    )
    parser.add_argument("--limit", type=int, default=None)
    return parser.parse_args()


def get_supabase_client():
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the backend environment."
        )
    from supabase import create_client

    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def normalize_storage_path(value: str | None) -> str | None:
    if not value:
        return None

    if value.startswith("http://") or value.startswith("https://"):
        parsed = urlparse(value)
        marker_index = parsed.path.find(PUBLIC_PREFIX)
        if marker_index == -1:
            return None
        return unquote(parsed.path[marker_index + len(PUBLIC_PREFIX):]).lstrip("/")

    return value.lstrip("/")


def target_path(row: dict[str, Any], source_path: str) -> str:
    suffix = Path(source_path).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        suffix = ".jpg"
    return f"{row['user_id']}/{row['id']}/original{suffix}"


def content_type_for(path: str) -> str:
    return mimetypes.guess_type(path)[0] or "image/jpeg"


def main() -> int:
    args = parse_args()
    supabase = get_supabase_client()
    storage = supabase.storage.from_(BUCKET)

    query = (
        supabase.table("receipts")
        .select("id,user_id,image_url")
        .not_.is_("image_url", "null")
        .order("saved_at", desc=True)
    )
    if args.limit is not None:
        query = query.limit(args.limit)
    rows = query.execute().data or []

    scanned = 0
    changed = 0
    skipped = 0
    preview: list[dict[str, str]] = []

    for row in rows:
        scanned += 1
        source_path = normalize_storage_path(row.get("image_url"))
        if not source_path:
            skipped += 1
            continue

        new_path = target_path(row, source_path)
        if source_path == new_path and row.get("image_url") == new_path:
            continue

        changed += 1
        if len(preview) < 10:
            preview.append({"from": source_path, "to": new_path})

        if not args.apply:
            continue

        if source_path != new_path:
            image_bytes = storage.download(source_path)
            storage.upload(
                new_path,
                image_bytes,
                {"content-type": content_type_for(new_path), "upsert": "true"},
            )
            storage.remove([source_path])

        (
            supabase.table("receipts")
            .update({"image_url": new_path})
            .eq("id", row["id"])
            .execute()
        )

    mode = "APPLIED" if args.apply else "DRY RUN"
    print(f"{mode}: scanned={scanned}, changed={changed}, skipped={skipped}")
    if preview:
        print("Preview:")
        for item in preview:
            print(item)
    if changed and not args.apply:
        print("Run again with --apply to migrate these images.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
