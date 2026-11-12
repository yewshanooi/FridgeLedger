"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Receipt } from "@/lib/types";
import {
  useReceipts,
  useMarkItemUsed,
  useMarkItemWasted,
  useRestoreItem,
} from "@/lib/hooks/useReceipts";

type ExpiryItem = {
  key: string;
  itemId?: string;
  status?: "active" | "consumed" | "wasted" | "expired";
  name: string;
  merchant: string;
  purchaseDate: string;
  expiryDate: Date;
  daysLeft: number;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  usedAt?: string | null;
};

function buildExpiryItems(receipts: Receipt[]): { active: ExpiryItem[]; used: ExpiryItem[] } {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const active: ExpiryItem[] = [];
  const used: ExpiryItem[] = [];

  for (const receipt of receipts) {
    for (let i = 0; i < receipt.items.length; i++) {
      const item = receipt.items[i];
      if (!item.shelf_life_days) continue;
      
      // Add index to ensure uniqueness if receipt has multiple items with same name
      const key = item.id ?? `${receipt.id}-${item.name}-${i}`;
      
      const expiryDate = new Date(receipt.purchaseDate);
      expiryDate.setDate(expiryDate.getDate() + item.shelf_life_days);

      const daysLeft = Math.ceil(
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      const expiryItem: ExpiryItem = {
        key,
        itemId: item.id,
        status: item.status ?? "active",
        name: item.name,
        merchant: receipt.merchant,
        purchaseDate: receipt.purchaseDate,
        expiryDate,
        daysLeft,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        usedAt: item.used_at,
      };

      if (item.status === "consumed" || item.status === "wasted") {
        used.push(expiryItem);
      } else {
        active.push(expiryItem);
      }
    }
  }

  return {
    active: active.sort((a, b) => a.daysLeft - b.daysLeft),
    used: used.sort((a, b) => b.daysLeft - a.daysLeft),
  };
}

function daysLabel(days: number): string {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `${days} days left`;
}

function cardStyle(days: number): string {
  if (days <= 0) return "border-red-300 bg-red-50";
  if (days <= 3) return "border-red-200 bg-red-50";
  if (days <= 7) return "border-orange-200 bg-orange-50";
  return "border-[#d7d0c3] bg-white";
}

function badgeStyle(days: number): string {
  if (days <= 0) return "bg-red-100 text-red-700";
  if (days <= 3) return "bg-red-100 text-red-700";
  if (days <= 7) return "bg-orange-100 text-orange-700";
  return "bg-emerald-100 text-emerald-700";
}

type Filter = "all" | "urgent" | "soon" | "fresh";
type ItemAction = "used" | "wasted" | "restore";

export default function ExpiryPage() {
  const { data: receipts = [], isLoading } = useReceipts();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  const markUsedMutation = useMarkItemUsed();
  const markWastedMutation = useMarkItemWasted();
  const restoreMutation = useRestoreItem();

  const { active: allItems, used: usedItems } = useMemo(
    () => buildExpiryItems(receipts),
    [receipts]
  );

  const filtered = useMemo(() => {
    return allItems.filter((item) => {
      if (filter === "urgent") return item.daysLeft <= 3;
      if (filter === "soon") return item.daysLeft > 3 && item.daysLeft <= 7;
      if (filter === "fresh") return item.daysLeft > 7;
      return true;
    });
  }, [allItems, filter]);

  const counts = useMemo(() => ({
    urgent: allItems.filter((i) => i.daysLeft <= 3).length,
    soon: allItems.filter((i) => i.daysLeft > 3 && i.daysLeft <= 7).length,
    fresh: allItems.filter((i) => i.daysLeft > 7).length,
  }), [allItems]);

  async function handleItemAction(item: ExpiryItem, action: ItemAction) {
    if (!item.itemId) {
      setError("This item is missing a database ID. Run the receipt_items status migration, then refresh.");
      return;
    }

    setError(null);

    try {
      if (action === "used") {
        await markUsedMutation.mutateAsync(item.itemId);
      } else if (action === "wasted") {
        await markWastedMutation.mutateAsync(item.itemId);
      } else {
        await restoreMutation.mutateAsync(item.itemId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update item status.");
    }
  }

  const isUpdating = (itemId?: string) => {
    return (
      markUsedMutation.isPending && markUsedMutation.variables === itemId ||
      markWastedMutation.isPending && markWastedMutation.variables === itemId ||
      restoreMutation.isPending && restoreMutation.variables === itemId
    );
  };

  const getActionLabel = (itemId?: string, action?: ItemAction) => {
    if (!itemId) return action === "used" ? "Mark used" : action === "wasted" ? "Mark wasted" : "Restore";
    
    if (markUsedMutation.isPending && markUsedMutation.variables === itemId) return "Saving...";
    if (markWastedMutation.isPending && markWastedMutation.variables === itemId) return "Saving...";
    if (restoreMutation.isPending && restoreMutation.variables === itemId) return "Restoring...";
    
    return action === "used" ? "Mark used" : action === "wasted" ? "Mark wasted" : "Restore";
  };

  const filterOptions: { key: Filter; label: string; count?: number }[] = [
    { key: "all", label: "All", count: allItems.length },
    { key: "urgent", label: "Urgent (≤ 3 days)", count: counts.urgent },
    { key: "soon", label: "Soon (≤ 7 days)", count: counts.soon },
    { key: "fresh", label: "Fresh", count: counts.fresh },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
              Pantry Tracker
            </p>
            <h2 className="mt-1 text-3xl font-bold text-[#1f2a24]">Expiry</h2>
            <p className="mt-2 text-sm text-[#526056]">
              Items close to their expiry date based on shelf-life estimates. Mark
              as used to remove them from this list.
            </p>
          </div>
          {isLoading && (
            <div className="flex items-center gap-2 rounded-full bg-[#e7e1d7] px-3 py-1.5">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#6a756d] border-t-transparent"></div>
              <span className="text-xs font-medium text-[#6a756d]">Updating...</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {filterOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              filter === opt.key
                ? "bg-emerald-700 text-white"
                : "border border-[#d7d0c3] text-[#526056] hover:border-emerald-600 hover:text-emerald-700"
            }`}
          >
            {opt.label}
            {opt.count != null && (
              <span
                className={`ml-1.5 ${filter === opt.key ? "opacity-75" : "text-[#aab4ad]"}`}
              >
                ({opt.count})
              </span>
            )}
          </button>
        ))}
      </div>

      {allItems.length === 0 && usedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d7d0c3] bg-white py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#059669"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p className="font-semibold text-[#1f2a24]">No expiry data yet</p>
          <p className="mt-1 max-w-xs text-sm text-[#6a756d]">
            Scan receipts with grocery items. Expiry tracking activates once
            shelf-life data is available.
          </p>
          <Link
            href="/chatbot"
            className="mt-4 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Upload receipt
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#d7d0c3] bg-white py-12 text-center">
          <p className="text-sm text-[#6a756d]">
            {allItems.length === 0
              ? filter === "all"
                ? "No active items. Used items are listed below."
                : "No active items. Switch to All to view used items."
              : "No active items in this category."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((item) => (
            <li
              key={item.key}
              className={`flex flex-col gap-3 rounded-xl border px-4 py-3 shadow-sm transition sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4 ${cardStyle(item.daysLeft)}`}
            >
              <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:gap-4">
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeStyle(item.daysLeft)}`}
                >
                  {daysLabel(item.daysLeft)}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-[#1f2a24]">{item.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-[#6a756d]">
                    <span>From {item.merchant}</span>
                    {item.quantity != null && (
                      <span>
                        {item.quantity} {item.unit ?? ""}
                      </span>
                    )}
                    {item.category && <span>{item.category}</span>}
                    <span>
                      Expires on {" "}
                      {item.expiryDate.toLocaleDateString("en-MY", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid w-full shrink-0 grid-cols-2 gap-2 sm:ml-4 sm:w-auto">
                <button
                  onClick={() => handleItemAction(item, "used")}
                  disabled={isUpdating(item.itemId)}
                  className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-700 hover:bg-emerald-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {getActionLabel(item.itemId, "used")}
                </button>
                <button
                  onClick={() => handleItemAction(item, "wasted")}
                  disabled={isUpdating(item.itemId)}
                  className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:border-red-600 hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {getActionLabel(item.itemId, "wasted")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {usedItems.length > 0 && filter === "all" && (
        <div className="mt-12">
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-[#d7d0c3]"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#f7f4ee] px-3 text-xs font-semibold uppercase tracking-widest text-[#6a756d]">
                Used / Wasted Items ({usedItems.length})
              </span>
            </div>
          </div>

          <ul className="space-y-2.5 opacity-80">
            {usedItems.map((item) => (
              <li
                key={item.key}
                className="flex flex-col gap-3 rounded-xl border border-[#e7e1d7] bg-[#F0EEE9] px-4 py-3 shadow-sm transition sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4"
              >
                <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:gap-4">
                  <span className="mt-0.5 shrink-0 rounded-full bg-[#e7e1d7] px-2.5 py-0.5 text-xs font-bold text-[#526056]">
                    {item.status === "wasted" ? "Wasted" : "Used"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-[#6a756d] line-through decoration-[#A1ADA4]">
                      {item.name}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-[#A1ADA4]">
                      <span>From {item.merchant}</span>
                      {item.quantity != null && (
                        <span>
                          {item.quantity} {item.unit ?? ""}
                        </span>
                      )}
                      {item.category && <span>{item.category}</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleItemAction(item, "restore")}
                  disabled={isUpdating(item.itemId)}
                  className="w-full shrink-0 rounded-lg border border-[#d7d0c3] bg-white px-3 py-1.5 text-xs font-semibold text-[#526056] transition hover:border-emerald-700 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-4 sm:w-auto"
                >
                  {getActionLabel(item.itemId, "restore")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
