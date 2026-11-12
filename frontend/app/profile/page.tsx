"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSession, logout, updateProfile, type AuthUser } from "@/lib/auth";
import { useReceipts, useReminders } from "@/lib/hooks/useReceipts";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [editName, setEditName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { data: receipts = [] } = useReceipts();
  const { data: reminders = [] } = useReminders();

  const totalReceipts = receipts.length;
  const totalSpent = receipts.reduce(
    (sum, r) => sum + r.items.reduce((s, i) => s + (i.price ?? 0), 0),
    0
  );
  const pendingReminders = reminders.filter((r) => !r.done).length;

  useEffect(() => {
    async function load() {
      const session = await getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      setUser(session);
      setEditName(session.name);
    }
    load();
  }, [router]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    await updateProfile({ name: editName.trim() });
    setUser((prev) => (prev ? { ...prev, name: editName.trim() } : prev));
    setIsEditing(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  if (!user) return null;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
          Account
        </p>
        <h2 className="mt-1 text-3xl font-bold text-[#1f2a24]">Profile</h2>
        <p className="mt-2 text-sm text-[#526056]">
          Manage your account details.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Avatar card */}
        <div className="h-fit rounded-xl border border-[#d7d0c3] bg-white p-6 shadow-sm text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-600 text-2xl font-bold text-white">
            {initials(user.name)}
          </div>
          <h3 className="mt-4 text-lg font-bold text-[#1f2a24]">{user.name}</h3>
          <p className="text-sm text-[#6a756d]">{user.email}</p>
          <p className="mt-1 text-xs text-[#6a756d]">
            Member since {formatDate(user.createdAt)}
          </p>

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#e7e1d7] pt-5">
            <div className="text-center">
              <p className="text-xl font-bold text-emerald-700">
                {totalReceipts}
              </p>
              <p className="text-xs text-[#6a756d]">Receipts</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-blue-700">
                {totalSpent.toFixed(0)}
              </p>
              <p className="text-xs text-[#6a756d]">RM Spent</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-purple-700">
                {pendingReminders}
              </p>
              <p className="text-xs text-[#6a756d]">Reminders</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-600 hover:text-white"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>

        {/* Edit details */}
        <div className="space-y-5">
          <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-[#1f2a24]">
                Personal Information
              </h3>
              {!isEditing && (
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setSaveSuccess(false);
                  }}
                  className="rounded-lg border border-[#d7d0c3] px-3 py-1.5 text-xs font-semibold text-[#526056] transition hover:border-emerald-600 hover:text-emerald-700"
                >
                  Edit
                </button>
              )}
            </div>

            {saveSuccess && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                ✓ Profile updated successfully.
              </div>
            )}

            {isEditing ? (
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-2.5 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
                    Email
                  </label>
                  <input
                    type="email"
                    value={user.email}
                    disabled
                    className="mt-1.5 w-full rounded-lg border border-[#e7e1d7] bg-[#f7f4ee] px-3 py-2.5 text-sm text-[#6a756d] cursor-not-allowed"
                  />
                  <p className="mt-1 text-xs text-[#6a756d]">
                    Email cannot be changed.
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditName(user.name);
                    }}
                    className="rounded-lg border border-[#d7d0c3] px-4 py-2 text-sm font-medium text-[#526056] transition hover:bg-[#f7f4ee]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-[#f7f4ee] px-4 py-3">
                  <p className="text-xs text-[#6a756d]">Full name</p>
                  <p className="mt-0.5 text-sm font-medium text-[#1f2a24]">
                    {user.name}
                  </p>
                </div>
                <div className="rounded-lg bg-[#f7f4ee] px-4 py-3">
                  <p className="text-xs text-[#6a756d]">Email address</p>
                  <p className="mt-0.5 text-sm font-medium text-[#1f2a24]">
                    {user.email}
                  </p>
                </div>
                <div className="rounded-lg bg-[#f7f4ee] px-4 py-3">
                  <p className="text-xs text-[#6a756d]">Account ID</p>
                  <p className="mt-0.5 font-mono text-xs text-[#6a756d]">
                    {user.id}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Quick links */}
          <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-[#1f2a24]">Quick Links</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { href: "/dashboard", label: "Dashboard", desc: "View spending overview" },
                { href: "/history", label: "Receipt History", desc: "Browse past receipts" },
                { href: "/reminders", label: "Reminders", desc: "Manage shopping list" },
                { href: "/expiry", label: "Expiry", desc: "Track expiry dates" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex flex-col rounded-lg border border-[#e7e1d7] bg-[#fbfaf7] px-4 py-3 transition hover:border-emerald-400"
                >
                  <span className="text-sm font-semibold text-[#1f2a24]">
                    {link.label}
                  </span>
                  <span className="text-xs text-[#6a756d]">{link.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
