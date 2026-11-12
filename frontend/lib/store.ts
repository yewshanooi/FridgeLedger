import type { Receipt, ReceiptItem, Reminder } from "./types";
import { getAuthHeaders } from "./api";
import { supabase } from "./supabase";

type ReceiptItemRow = ReceiptItem & {
  receipt_id: string;
};

type ReminderRow = {
  id: string;
  item: string;
  due_date: string | null;
  location: string | null;
  done: boolean;
  created_at: string;
};

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

function normalizeImagePath(value?: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return null;
  return value.replace(/^\/+/, "");
}

// ─── Signed URL Cache ────────────────────────────────────────────────────────

type CachedUrl = {
  url: string;
  expiresAt: number;
};

const signedUrlCache = new Map<string, CachedUrl>();
const CACHE_DURATION = 8 * 60 * 1000; // Backend signed URLs expire after 10 minutes.

async function createReceiptImageSignedUrl(value?: string | null): Promise<string | null> {
  const path = normalizeImagePath(value);
  if (!path) return null;

  // Check cache first
  const cached = signedUrlCache.get(path);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }

  // Fetch new signed URL
  const params = new URLSearchParams({ path });
  const response = await fetch(`${apiBaseUrl}/receipts/image-url?${params.toString()}`, {
    headers: await getAuthHeaders(),
  });
  if (!response.ok) return null;

  const data = (await response.json()) as { signed_url?: string | null };
  const signedUrl = data.signed_url ?? null;

  // Cache the result
  if (signedUrl) {
    signedUrlCache.set(path, {
      url: signedUrl,
      expiresAt: Date.now() + CACHE_DURATION,
    });
  }

  return signedUrl;
}

// Batch fetch signed URLs to reduce sequential API calls
async function batchCreateSignedUrls(paths: (string | null)[]): Promise<(string | null)[]> {
  const uniquePaths = [...new Set(paths.filter((p): p is string => p !== null))];
  
  // Separate cached and uncached paths
  const uncachedPaths: string[] = [];
  const cachedResults = new Map<string, string>();
  
  for (const path of uniquePaths) {
    const cached = signedUrlCache.get(path);
    if (cached && Date.now() < cached.expiresAt) {
      cachedResults.set(path, cached.url);
    } else {
      uncachedPaths.push(path);
    }
  }

  // Fetch uncached URLs in parallel
  if (uncachedPaths.length > 0) {
    const fetchPromises = uncachedPaths.map(async (path) => {
      const params = new URLSearchParams({ path });
      try {
        const response = await fetch(`${apiBaseUrl}/receipts/image-url?${params.toString()}`, {
          headers: await getAuthHeaders(),
        });
        if (!response.ok) return { path, url: null };

        const data = (await response.json()) as { signed_url?: string | null };
        const signedUrl = data.signed_url ?? null;

        if (signedUrl) {
          signedUrlCache.set(path, {
            url: signedUrl,
            expiresAt: Date.now() + CACHE_DURATION,
          });
        }

        return { path, url: signedUrl };
      } catch {
        return { path, url: null };
      }
    });

    const results = await Promise.all(fetchPromises);
    for (const { path, url } of results) {
      if (url) cachedResults.set(path, url);
    }
  }

  // Map back to original order
  return paths.map((path) => (path ? cachedResults.get(path) ?? null : null));
}

// ─── Receipts ────────────────────────────────────────────────────────────────

export async function getReceipts(): Promise<Receipt[]> {
  const { data: receiptsData, error: receiptsError } = await supabase
    .from("receipts")
    .select("id, merchant, purchase_date, saved_at, image_url")
    .order("saved_at", { ascending: false });

  if (receiptsError) throw new Error(receiptsError.message);
  if (!receiptsData || receiptsData.length === 0) return [];

  const ids = receiptsData.map((r) => r.id);
  const { data: itemsData, error: itemsError } = await supabase
    .from("receipt_items")
    .select(
      "id, receipt_id, name, normalized_name, category, quantity, unit, price, shelf_life_days, status, used_at"
    )
    .in("receipt_id", ids);

  if (itemsError) throw new Error(itemsError.message);

  const byReceipt: Record<string, ReceiptItemRow[]> = {};
  for (const item of (itemsData ?? []) as ReceiptItemRow[]) {
    (byReceipt[item.receipt_id] ??= []).push(item);
  }

  // Batch fetch all signed URLs in parallel
  const imagePaths = receiptsData.map((r) => normalizeImagePath(r.image_url ?? null));
  const signedUrls = await batchCreateSignedUrls(imagePaths);

  return receiptsData.map((r, index) => ({
    id: r.id,
    merchant: r.merchant ?? "Unknown",
    purchaseDate: r.purchase_date ?? "",
    savedAt: r.saved_at ?? "",
    items: byReceipt[r.id] ?? [],
    imageUrl: signedUrls[index],
    imagePath: imagePaths[index],
  }));
}

export async function saveReceipt(receipt: Receipt): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error: receiptError } = await supabase.from("receipts").upsert({
    id: receipt.id,
    user_id: user.id,
    merchant: receipt.merchant,
    purchase_date: receipt.purchaseDate,
    saved_at: receipt.savedAt,
    image_url: receipt.imagePath ?? null,
  });
  if (receiptError) throw new Error(receiptError.message);

  await supabase.from("receipt_items").delete().eq("receipt_id", receipt.id);

  if (receipt.items.length > 0) {
    const { error: itemsError } = await supabase.from("receipt_items").insert(
      receipt.items.map((item) => ({
        receipt_id: receipt.id,
        name: item.name,
        normalized_name: item.normalized_name ?? null,
        category: item.category ?? null,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        price: item.price ?? null,
        shelf_life_days: item.shelf_life_days ?? null,
        status: item.status ?? "active",
        used_at: item.used_at ?? null,
      }))
    );
    if (itemsError) throw new Error(itemsError.message);
  }
}

export async function markReceiptItemUsed(itemId: string): Promise<void> {
  const { error } = await supabase
    .from("receipt_items")
    .update({
      status: "consumed",
      used_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) throw new Error(error.message);
}

export async function markReceiptItemWasted(itemId: string): Promise<void> {
  const { error } = await supabase
    .from("receipt_items")
    .update({
      status: "wasted",
      used_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) throw new Error(error.message);
}

export async function restoreReceiptItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from("receipt_items")
    .update({
      status: "active",
      used_at: null,
    })
    .eq("id", itemId);

  if (error) throw new Error(error.message);
}

// ─── Duplicate detection ─────────────────────────────────────────────────────

export type DuplicateMatch = {
  id: string;
  merchant: string;
  purchaseDate: string;
  itemCount: number;
};

/**
 * Check if a receipt with the same merchant AND purchase_date already exists.
 * Returns the matching receipt(s) if found, or an empty array if none.
 */
export async function checkDuplicateReceipt(
  merchant: string,
  purchaseDate: string
): Promise<DuplicateMatch[]> {
  const merchantNorm = merchant.trim().toLowerCase();
  const dateNorm = purchaseDate.split("T")[0]; // YYYY-MM-DD

  const { data, error } = await supabase
    .from("receipts")
    .select("id, merchant, purchase_date")
    .eq("purchase_date", dateNorm);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  // Filter by merchant name (case-insensitive match)
  const matches = data.filter(
    (r) => (r.merchant ?? "").trim().toLowerCase() === merchantNorm
  );

  if (matches.length === 0) return [];

  // Get item counts for matched receipts
  const matchIds = matches.map((r) => r.id);
  const { data: itemsData } = await supabase
    .from("receipt_items")
    .select("receipt_id")
    .in("receipt_id", matchIds);

  const countByReceipt: Record<string, number> = {};
  for (const item of itemsData ?? []) {
    countByReceipt[item.receipt_id] = (countByReceipt[item.receipt_id] ?? 0) + 1;
  }

  return matches.map((r) => ({
    id: r.id,
    merchant: r.merchant ?? "Unknown",
    purchaseDate: r.purchase_date ?? "",
    itemCount: countByReceipt[r.id] ?? 0,
  }));
}

// ─── Receipt image upload ────────────────────────────────────────────────────

/**
 * Upload a receipt image to private Supabase Storage and return the object path.
 */
export async function uploadReceiptImage(
  receiptId: string,
  file: File
): Promise<string> {
  const formData = new FormData();
  formData.append("receipt_id", receiptId);
  formData.append("file", file);

  const response = await fetch(`${apiBaseUrl}/receipts/image`, {
    method: "POST",
    headers: await getAuthHeaders(),
    body: formData,
  });

  const data = (await response.json()) as { path?: string; detail?: string };
  if (!response.ok || !data.path) {
    throw new Error(data.detail ?? "Image upload failed");
  }

  return data.path;
}

// ─── Reminders ───────────────────────────────────────────────────────────────

export async function getReminders(): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as ReminderRow[]).map((r) => ({
    id: r.id,
    item: r.item,
    dueDate: r.due_date ?? "",
    location: r.location ?? "",
    done: r.done,
    createdAt: r.created_at,
  }));
}

export async function saveReminder(reminder: Reminder): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("reminders").insert({
    id: reminder.id,
    user_id: user.id,
    item: reminder.item,
    due_date: reminder.dueDate,
    location: reminder.location,
    done: reminder.done,
    created_at: reminder.createdAt,
  });
  if (error) throw new Error(error.message);
}

export async function updateReminder(
  id: string,
  updates: Partial<Reminder>
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (updates.item !== undefined) patch.item = updates.item;
  if (updates.dueDate !== undefined) patch.due_date = updates.dueDate;
  if (updates.location !== undefined) patch.location = updates.location;
  if (updates.done !== undefined) patch.done = updates.done;

  const { error } = await supabase.from("reminders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Dismissed expiry (UI-only, stays in localStorage) ───────────────────────

export function getDismissedExpiry(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(
      JSON.parse(localStorage.getItem("fl_dismissed_expiry") ?? "[]")
    );
  } catch {
    return new Set();
  }
}

export function dismissExpiryItem(key: string): void {
  const dismissed = getDismissedExpiry();
  dismissed.add(key);
  localStorage.setItem(
    "fl_dismissed_expiry",
    JSON.stringify([...dismissed])
  );
}
