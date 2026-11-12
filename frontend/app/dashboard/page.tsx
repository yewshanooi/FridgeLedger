"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Receipt } from "@/lib/types";
import { useReceipts, useReminders } from "@/lib/hooks/useReceipts";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function countExpiringSoon(receipts: Receipt[]): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const cutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  let count = 0;
  for (const receipt of receipts) {
    for (const item of receipt.items) {
      if (!item.shelf_life_days) continue;
      if (item.status === "consumed" || item.status === "wasted") continue;
      const expiry = new Date(receipt.purchaseDate);
      expiry.setDate(expiry.getDate() + item.shelf_life_days);
      if (expiry <= cutoff) count++;
    }
  }
  return count;
}

function buildLocationSpending(
  receipts: Receipt[]
): { name: string; total: number }[] {
  const map: Record<string, number> = {};
  for (const receipt of receipts) {
    const loc = receipt.merchant || "Unknown";
    const total = receipt.items.reduce((s, i) => s + (i.price ?? 0), 0);
    map[loc] = (map[loc] ?? 0) + total;
  }
  return Object.entries(map)
    .map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

export default function DashboardPage() {
  const { data: receipts = [], isLoading: receiptsLoading } = useReceipts();
  const { data: reminders = [], isLoading: remindersLoading } = useReminders();

  const stats = useMemo(() => {
    const totalSpent = receipts.reduce(
      (sum, r) => sum + r.items.reduce((s, i) => s + (i.price ?? 0), 0),
      0
    );
    const pendingReminders = reminders.filter((r) => !r.done).length;
    const expiringCount = countExpiringSoon(receipts);
    const locationSpending = buildLocationSpending(receipts);
    const maxSpending = Math.max(...locationSpending.map((l) => l.total), 1);
    const recentReceipts = receipts.slice(0, 5);

    return {
      totalSpent,
      pendingReminders,
      expiringCount,
      locationSpending,
      maxSpending,
      recentReceipts,
    };
  }, [receipts, reminders]);

  const isLoading = receiptsLoading || remindersLoading;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
              Overview
            </p>
            <h2 className="mt-1 text-3xl font-bold text-[#1f2a24]">Dashboard</h2>
            <p className="mt-2 text-sm text-[#526056]">
              Your grocery spending and pantry at a glance.
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

      {/* Stat cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
            Total Receipts
          </p>
          <p className="mt-2 text-3xl font-bold text-emerald-800">
            {receipts.length}
          </p>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
            Total Spent
          </p>
          <p className="mt-2 text-3xl font-bold text-blue-800">
            RM {stats.totalSpent.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
            Expiring (7 days)
          </p>
          <p className="mt-2 text-3xl font-bold text-orange-700">
            {stats.expiringCount}
          </p>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
            Pending Reminders
          </p>
          <p className="mt-2 text-3xl font-bold text-purple-800">
            {stats.pendingReminders}
          </p>
        </div>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        {/* Spending by location */}
        <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-[#1f2a24]">
              Spending by Location
            </h3>
            <Link
              href="/history"
              className="text-xs text-emerald-700 hover:underline"
            >
              View history →
            </Link>
          </div>
          {stats.locationSpending.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[#d7d0c3] bg-[#fbfaf7]">
              <div className="text-center">
                <p className="text-sm font-medium text-[#1f2a24]">
                  No data yet
                </p>
                <Link
                  href="/chatbot"
                  className="text-xs text-emerald-700 hover:underline"
                >
                  Upload a receipt to get started
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.locationSpending.map((loc) => (
                <div key={loc.name} className="flex items-center gap-3">
                  <div
                    className="min-w-0 max-w-[7rem] truncate text-xs text-[#526056]"
                    title={loc.name}
                  >
                    {loc.name}
                  </div>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#e7e1d7]">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{
                        width: `${(loc.total / stats.maxSpending) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="w-20 shrink-0 text-xs font-semibold text-[#1f2a24]">
                    RM {loc.total.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent receipts */}
        <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-[#1f2a24]">Recent Receipts</h3>
            <Link
              href="/history"
              className="text-xs text-emerald-700 hover:underline"
            >
              View history →
            </Link>
          </div>
          {stats.recentReceipts.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[#d7d0c3] bg-[#fbfaf7]">
              <div className="text-center">
                <p className="text-sm font-medium text-[#1f2a24]">
                  No data yet
                </p>
                <Link
                  href="/chatbot"
                  className="text-xs text-emerald-700 hover:underline"
                >
                  Upload a receipt to get started
                </Link>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {stats.recentReceipts.map((receipt) => {
                const total = receipt.items.reduce(
                  (s, i) => s + (i.price ?? 0),
                  0
                );
                return (
                  <li
                    key={receipt.id}
                    className="flex items-center justify-between rounded-lg border border-[#e7e1d7] bg-[#fbfaf7] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#1f2a24]">
                        {receipt.merchant}
                      </p>
                      <p className="text-xs text-[#6a756d]">
                        {formatDate(receipt.purchaseDate)} ·{" "}
                        {receipt.items.length} items
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[#1f2a24]">
                      RM {total.toFixed(2)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/chatbot"
          className="flex items-center gap-3 rounded-xl border border-[#d7d0c3] bg-white p-4 shadow-sm transition hover:border-emerald-400"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#059669"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1f2a24]">
              Upload Receipt
            </p>
            <p className="text-xs text-[#6a756d]">Scan a new receipt</p>
          </div>
        </Link>

        <Link
          href="/reminders"
          className="flex items-center gap-3 rounded-xl border border-[#d7d0c3] bg-white p-4 shadow-sm transition hover:border-purple-400"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-purple-100">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#7c3aed"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1f2a24]">
              Add Reminder
            </p>
            <p className="text-xs text-[#6a756d]">Set a shopping reminder</p>
          </div>
        </Link>

        <Link
          href="/expiry"
          className="flex items-center gap-3 rounded-xl border border-[#d7d0c3] bg-white p-4 shadow-sm transition hover:border-orange-400"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ea580c"
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
          <div>
            <p className="text-sm font-semibold text-[#1f2a24]">
              Check Expiry
            </p>
            <p className="text-xs text-[#6a756d]">
              {stats.expiringCount > 0
                ? `${stats.expiringCount} items expiring soon`
                : "Track expiry dates"}
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
