"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Receipt } from "@/lib/types";
import { useReceipts } from "@/lib/hooks/useReceipts";

function formatDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type DateGroup = {
  dateKey: string; // YYYY-MM-DD
  label: string;
  receipts: Receipt[];
};

function groupByDate(receipts: Receipt[]): DateGroup[] {
  const map: Record<string, Receipt[]> = {};
  for (const r of receipts) {
    const key = r.purchaseDate.split("T")[0];
    if (!map[key]) map[key] = [];
    map[key].push(r);
  }
  return Object.entries(map)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, recs]) => ({
      dateKey,
      label: formatDateLabel(dateKey),
      receipts: recs,
    }));
}

export default function HistoryPage() {
  const { data: receipts = [], isLoading } = useReceipts();
  const [expandedDateKey, setExpandedDateKey] = useState<string | null>(null);
  const [activeReceiptId, setActiveReceiptId] = useState<
    Record<string, string>
  >({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const groups = useMemo(() => groupByDate(receipts), [receipts]);

  function toggleGroup(dateKey: string, groupReceipts: Receipt[]) {
    setExpandedDateKey((prev) => (prev === dateKey ? null : dateKey));
    if (!activeReceiptId[dateKey]) {
      setActiveReceiptId((prev) => ({
        ...prev,
        [dateKey]: groupReceipts[0].id,
      }));
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
              Shopping Timeline
            </p>
            <h2 className="mt-1 text-3xl font-bold text-[#1f2a24]">
              Receipt History
            </h2>
            <p className="mt-2 text-sm text-[#526056]">
              All your scanned receipts organised by date.
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

      {groups.length === 0 ? (
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
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <p className="font-semibold text-[#1f2a24]">No receipts yet</p>
          <p className="mt-1 text-sm text-[#6a756d]">
            Scan receipts to see your history here.
          </p>
          <Link
            href="/chatbot"
            className="mt-4 inline-block rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Upload receipt
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isOpen = expandedDateKey === group.dateKey;
            const activeId =
              activeReceiptId[group.dateKey] ?? group.receipts[0].id;
            const activeReceipt =
              group.receipts.find((r) => r.id === activeId) ??
              group.receipts[0];
            const totalItems = group.receipts.reduce(
              (s, r) => s + r.items.length,
              0
            );
            const totalSpent = group.receipts.reduce(
              (s, r) =>
                s + r.items.reduce((si, i) => si + (i.price ?? 0), 0),
              0
            );

            return (
              <div
                key={group.dateKey}
                className="overflow-hidden rounded-xl border border-[#d7d0c3] bg-white shadow-sm"
              >
                {/* Accordion header */}
                <button
                  onClick={() => toggleGroup(group.dateKey, group.receipts)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-[#fbfaf7]"
                >
                  <div>
                    <p className="font-semibold text-[#1f2a24]">
                      {group.label}
                    </p>
                    <p className="text-xs text-[#6a756d]">
                      {group.receipts.length} receipt
                      {group.receipts.length > 1 ? "s" : ""} · {totalItems}{" "}
                      items · RM {totalSpent.toFixed(2)}
                    </p>
                  </div>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#526056"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`shrink-0 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                <div
                  className={`grid transition-all duration-300 ease-in-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="border-t border-[#e7e1d7] px-5 pb-5 pt-4">
                    {/* Location tabs — shown when multiple receipts on same day */}
                    {group.receipts.length > 1 && (
                      <div className="mb-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#526056]">
                          Select location
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {group.receipts.map((r) => (
                            <button
                              key={r.id}
                              onClick={() =>
                                setActiveReceiptId((prev) => ({
                                  ...prev,
                                  [group.dateKey]: r.id,
                                }))
                              }
                              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                activeId === r.id
                                  ? "border-emerald-700 bg-emerald-700 text-white"
                                  : "border-[#d7d0c3] text-[#526056] hover:border-emerald-600 hover:text-emerald-700"
                              }`}
                            >
                              {r.merchant}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Receipt image + Summary */}
                    <div className="mb-3 grid gap-3 sm:grid-cols-[auto_1fr]">
                      {/* Receipt image thumbnail */}
                      {activeReceipt.imageUrl && (
                        <button
                          onClick={() =>
                            setLightboxUrl(activeReceipt.imageUrl!)
                          }
                          className="group relative h-48 w-full shrink-0 overflow-hidden rounded-lg border border-[#e7e1d7] bg-[#f7f4ee] transition hover:border-emerald-400 sm:h-36 sm:w-28"
                        >
                          <Image
                            src={activeReceipt.imageUrl}
                            alt={`Receipt from ${activeReceipt.merchant}`}
                            fill
                            unoptimized
                            className="object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/30">
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="opacity-0 transition group-hover:opacity-100"
                            >
                              <circle cx="11" cy="11" r="8" />
                              <line
                                x1="21"
                                y1="21"
                                x2="16.65"
                                y2="16.65"
                              />
                              <line x1="11" y1="8" x2="11" y2="14" />
                              <line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                          </div>
                        </button>
                      )}

                      {/* Summary cards */}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div className="rounded-md bg-[#f7f4ee] p-3">
                          <p className="text-xs text-[#6a756d]">Merchant</p>
                          <p className="mt-0.5 text-sm font-semibold text-[#1f2a24]">
                            {activeReceipt.merchant}
                          </p>
                        </div>
                        <div className="rounded-md bg-[#f7f4ee] p-3">
                          <p className="text-xs text-[#6a756d]">Items</p>
                          <p className="mt-0.5 text-sm font-semibold text-[#1f2a24]">
                            {activeReceipt.items.length}
                          </p>
                        </div>
                        <div className="rounded-md bg-[#f7f4ee] p-3">
                          <p className="text-xs text-[#6a756d]">Total</p>
                          <p className="mt-0.5 text-sm font-semibold text-[#1f2a24]">
                            RM{" "}
                            {activeReceipt.items
                              .reduce((s, i) => s + (i.price ?? 0), 0)
                              .toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Item list */}
                    {activeReceipt.items.length > 0 ? (
                      <ul className="space-y-1.5">
                        {activeReceipt.items.map((item, idx) => (
                          <li
                            key={idx}
                            className="flex flex-col gap-1 rounded-md border border-[#e7e1d7] bg-[#fbfaf7] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[#1f2a24]">
                                {item.name}
                              </span>
                              {item.category && (
                                <span className="rounded-full bg-[#e7e1d7] px-2 py-0.5 text-xs text-[#6a756d]">
                                  {item.category}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-[#526056]">
                              {item.quantity != null && (
                                <span>
                                  {item.quantity} {item.unit ?? ""}
                                </span>
                              )}
                              {item.price != null && (
                                <span className="font-semibold text-[#1f2a24]">
                                  RM {item.price}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-[#6a756d]">
                        No items recorded.
                      </p>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Image lightbox modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <Image
              src={lightboxUrl}
              alt="Receipt image"
              width={800}
              height={1200}
              unoptimized
              className="max-h-[85vh] w-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
