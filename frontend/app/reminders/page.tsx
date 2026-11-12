"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Receipt, Reminder } from "@/lib/types";
import {
  useReminders,
  useReceipts,
  useSaveReminder,
  useUpdateReminder,
  useDeleteReminder,
  useMarkItemUsed,
} from "@/lib/hooks/useReceipts";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function generateId(): string {
  return crypto.randomUUID();
}

type Filter = "all" | "pending" | "done";
const SUMMARY_WINDOW_DAYS = 7;

type SoonFoodItem = {
  key: string;
  itemId?: string;
  name: string;
  merchant: string;
  category?: string | null;
  quantity?: number | null;
  unit?: string | null;
  daysLeft: number;
};

function relativeExpiryLabel(days: number): string {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}

function buildSoonFoodItems(receipts: Receipt[]): SoonFoodItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const items: SoonFoodItem[] = [];

  for (const receipt of receipts) {
    for (let index = 0; index < receipt.items.length; index += 1) {
      const item = receipt.items[index];
      if (!item.shelf_life_days) continue;
      if (item.status === "consumed" || item.status === "wasted") continue;

      const expiryDate = new Date(receipt.purchaseDate);
      expiryDate.setDate(expiryDate.getDate() + item.shelf_life_days);
      const daysLeft = Math.ceil(
        (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysLeft < 0 || daysLeft > SUMMARY_WINDOW_DAYS) continue;

      items.push({
        key: item.id ?? `${receipt.id}-${item.name}-${index}`,
        itemId: item.id,
        name: item.name,
        merchant: receipt.merchant,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        daysLeft,
      });
    }
  }

  return items.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
}

export default function RemindersPage() {
  const { data: reminders = [], isLoading: remindersLoading, error: remindersError } = useReminders();
  const { data: receipts = [], isLoading: receiptsLoading } = useReceipts();

  const saveReminder = useSaveReminder();
  const updateReminder = useUpdateReminder();
  const deleteReminder = useDeleteReminder();
  const markItemUsed = useMarkItemUsed();

  const [filter, setFilter] = useState<Filter>("all");
  const [item, setItem] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [location, setLocation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busyReminderId, setBusyReminderId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const isLoading = remindersLoading || receiptsLoading;
  const pageError = remindersError ? (remindersError as Error).message : null;

  function resetAddForm() {
    setItem("");
    setDueDate("");
    setLocation("");
  }

  function startEditing(reminder: Reminder) {
    setEditingId(reminder.id);
    setEditItem(reminder.item);
    setEditDueDate(reminder.dueDate);
    setEditLocation(reminder.location);
    setEditError(null);
  }

  function stopEditing() {
    setEditingId(null);
    setEditItem("");
    setEditDueDate("");
    setEditLocation("");
    setEditError(null);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!item.trim()) { setFormError("Item name is required."); return; }
    if (!dueDate) { setFormError("Please select a due date."); return; }
    if (dueDate < today) { setFormError("Due date cannot be in the past."); return; }
    setFormError(null);

    const reminder: Reminder = {
      id: generateId(),
      item: item.trim(),
      dueDate,
      location: location.trim(),
      done: false,
      createdAt: new Date().toISOString(),
    };
    try {
      await saveReminder.mutateAsync(reminder);
      resetAddForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add reminder.");
    }
  }

  async function toggleDone(id: string, current: boolean) {
    setBusyReminderId(id);
    try {
      await updateReminder.mutateAsync({ id, updates: { done: !current } });
    } finally {
      setBusyReminderId(null);
    }
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    if (!editItem.trim()) { setEditError("Item name is required."); return; }
    if (!editDueDate) { setEditError("Please select a due date."); return; }
    if (editDueDate < today) { setEditError("Due date cannot be in the past."); return; }

    setBusyReminderId(editingId);
    setEditError(null);
    try {
      await updateReminder.mutateAsync({
        id: editingId,
        updates: { item: editItem.trim(), dueDate: editDueDate, location: editLocation.trim() },
      });
      stopEditing();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not save reminder.");
    } finally {
      setBusyReminderId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyReminderId(id);
    try {
      await deleteReminder.mutateAsync(id);
      if (editingId === id) stopEditing();
    } finally {
      setBusyReminderId(null);
    }
  }

  async function handleFoodItemDone(foodItem: SoonFoodItem) {
    if (!foodItem.itemId) return;
    try {
      await markItemUsed.mutateAsync(foodItem.itemId);
    } catch {
      // error is handled by the mutation's onError rollback
    }
  }

  const filtered = (reminders as Reminder[])
    .filter((r) => {
      if (filter === "pending") return !r.done;
      if (filter === "done") return r.done;
      return true;
    })
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

  const pendingCount = (reminders as Reminder[]).filter((r) => !r.done).length;
  const soonFoodItems = useMemo(() => buildSoonFoodItems(receipts as Receipt[]), [receipts]);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
          Shopping List
        </p>
        <h2 className="mt-1 text-3xl font-bold text-[#1f2a24]">Reminders</h2>
        <p className="mt-2 text-sm text-[#526056]">
          Set reminders for items you need to buy, with a due date and store location.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="h-fit rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm"
        >
          <h3 className="mb-4 font-semibold text-[#1f2a24]">Add Reminder</h3>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
                Item name *
              </label>
              <input
                type="text"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder="e.g. Eggs, Milk, Bread"
                className="mt-1.5 w-full rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
                Due date *
              </label>
              <input
                type="date"
                value={dueDate}
                min={today}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
                Store / Location
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. AEON, Jaya Grocer"
                className="mt-1.5 w-full rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2.5 text-sm outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {formError && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={saveReminder.isPending}
            className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-[#aab4ad]"
          >
            {saveReminder.isPending ? "Adding..." : "Add reminder"}
          </button>
        </form>

        {/* List */}
        <div>
          {pageError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {pageError}
            </div>
          )}

          <div className="mb-3">
            <h3 className="font-semibold text-[#1f2a24]">Shopping Reminders</h3>
            <p className="text-xs text-[#6a756d]">
              Manual reminders for grocery items you still need to buy.
            </p>
          </div>
          <div className="mb-4 flex gap-2">
            {(
              [
                { key: "all" as Filter, label: "All" },
                {
                  key: "pending" as Filter,
                  label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}`,
                },
                { key: "done" as Filter, label: "Done" },
              ] as { key: Filter; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  filter === key
                    ? "bg-emerald-700 text-white"
                    : "border border-[#d7d0c3] text-[#526056] hover:border-emerald-600 hover:text-emerald-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="rounded-xl border border-dashed border-[#d7d0c3] bg-white py-16 text-center">
              <p className="text-sm text-[#6a756d]">Loading reminders...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#d7d0c3] bg-white py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 01-3.46 0" />
                </svg>
              </div>
              <p className="font-semibold text-[#1f2a24]">
                {filter === "done" ? "No completed reminders" : "No reminders yet"}
              </p>
              <p className="mt-1 text-sm text-[#6a756d]">
                {filter === "all" || filter === "pending"
                  ? "Add a reminder using the form."
                  : "Mark reminders as done to see them here."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((reminder) => {
                const isOverdue = !reminder.done && reminder.dueDate < today;
                const isDueToday = !reminder.done && reminder.dueDate === today;
                const isEditing = editingId === reminder.id;
                const isBusy = busyReminderId === reminder.id;

                return (
                  <li
                    key={reminder.id}
                    className={`flex items-start gap-4 rounded-xl border bg-white px-4 py-3.5 shadow-sm transition ${
                      reminder.done
                        ? "border-[#e7e1d7] opacity-60"
                        : isOverdue
                          ? "border-red-200"
                          : isDueToday
                            ? "border-orange-200"
                            : "border-[#d7d0c3]"
                    }`}
                  >
                    <button
                      onClick={() => toggleDone(reminder.id, reminder.done)}
                      disabled={isBusy}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                        reminder.done
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-[#d7d0c3] hover:border-emerald-600"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                      aria-label={reminder.done ? "Mark as pending" : "Mark as done"}
                    >
                      {reminder.done && (
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2 6 5 9 10 3" />
                        </svg>
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <form onSubmit={handleEdit} className="space-y-3">
                          <div className="grid gap-2 sm:grid-cols-[1.2fr_140px]">
                            <input
                              type="text"
                              value={editItem}
                              onChange={(e) => setEditItem(e.target.value)}
                              className="rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2 text-sm outline-none focus:border-emerald-600"
                            />
                            <input
                              type="date"
                              min={today}
                              value={editDueDate}
                              onChange={(e) => setEditDueDate(e.target.value)}
                              className="rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2 text-sm outline-none focus:border-emerald-600"
                            />
                          </div>
                          <input
                            type="text"
                            value={editLocation}
                            onChange={(e) => setEditLocation(e.target.value)}
                            placeholder="Store / Location"
                            className="w-full rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2 text-sm outline-none focus:border-emerald-600"
                          />
                          {editError && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                              {editError}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={isBusy}
                              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-[#aab4ad]"
                            >
                              {isBusy ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={stopEditing}
                              disabled={isBusy}
                              className="rounded-lg border border-[#d7d0c3] px-3 py-1.5 text-xs font-semibold text-[#526056] transition hover:bg-[#f7f4ee] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <p className={`text-sm font-medium ${reminder.done ? "text-[#6a756d] line-through" : "text-[#1f2a24]"}`}>
                            {reminder.item}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#6a756d]">
                            <span className={`font-medium ${isOverdue ? "text-red-600" : isDueToday ? "text-orange-600" : ""}`}>
                              {isOverdue ? "Overdue · " : isDueToday ? "Due today · " : ""}
                              {formatDate(reminder.dueDate)}
                            </span>
                            {reminder.location && <span>{reminder.location}</span>}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex shrink-0 gap-1">
                      {!isEditing && (
                        <button
                          onClick={() => startEditing(reminder)}
                          disabled={isBusy}
                          className="rounded-md p-1.5 text-[#6a756d] transition hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Edit reminder"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(reminder.id)}
                        disabled={isBusy}
                        className="rounded-md p-1.5 text-[#6a756d] transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Delete reminder"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Food Expiring Soon */}
      <section className="mt-6 rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[#1f2a24]">Food Expiring Soon</h3>
            <p className="text-xs text-[#6a756d]">
              Active receipt items expiring within {SUMMARY_WINDOW_DAYS} days.
            </p>
          </div>
          {!isLoading && soonFoodItems.length > 0 && (
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
              {soonFoodItems.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="rounded-lg border border-dashed border-[#d7d0c3] bg-[#fbfaf7] py-8 text-center">
            <p className="text-sm text-[#6a756d]">Loading expiry reminders...</p>
          </div>
        ) : soonFoodItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#d7d0c3] bg-[#fbfaf7] py-8 text-center">
            <p className="text-sm font-medium text-[#1f2a24]">No food expiry reminders</p>
            <p className="mt-1 text-xs text-[#6a756d]">
              Scan receipts with shelf-life data to populate this list.
            </p>
          </div>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {soonFoodItems.map((expiryItem) => {
              const isUrgent = expiryItem.daysLeft <= 3;
              const isBusy = markItemUsed.isPending && markItemUsed.variables === expiryItem.itemId && !!expiryItem.itemId;

              return (
                <li
                  key={expiryItem.key}
                  className={`flex items-start gap-4 rounded-lg border px-4 py-3 ${
                    isUrgent ? "border-orange-200 bg-orange-50" : "border-[#e7e1d7] bg-[#fbfaf7]"
                  }`}
                >
                  <button
                    onClick={() => handleFoodItemDone(expiryItem)}
                    disabled={isBusy || !expiryItem.itemId}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#d7d0c3] transition hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Mark ${expiryItem.name} as eaten`}
                  >
                    {isBusy && <span className="h-2 w-2 rounded-full bg-emerald-600" />}
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#1f2a24]">
                        {expiryItem.name}
                      </p>
                      <p className="mt-0.5 text-xs text-[#6a756d]">
                        From {expiryItem.merchant}
                        {expiryItem.category ? ` · ${expiryItem.category}` : ""}
                        {expiryItem.quantity != null
                          ? ` · ${expiryItem.quantity} ${expiryItem.unit ?? ""}`
                          : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-xs font-semibold text-[#1f2a24]">
                      {relativeExpiryLabel(expiryItem.daysLeft)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
