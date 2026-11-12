from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.expiry_email import send_soon_food_emails


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send FridgeLedger emails for active food items expiring soon."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually send emails and record sent notifications. Omit for dry run.",
    )
    parser.add_argument(
        "--window-days",
        type=int,
        default=7,
        help="Number of days ahead to treat as expiring soon.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = send_soon_food_emails(
        window_days=args.window_days,
        dry_run=not args.apply,
    )
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
