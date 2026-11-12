export type ReceiptItem = {
  id?: string;
  name: string;
  normalized_name?: string | null;
  category?: string | null;
  quantity?: number | null;
  unit?: string | null;
  price?: number | null;
  shelf_life_days?: number | null;
  status?: "active" | "consumed" | "wasted" | "expired";
  used_at?: string | null;
};

export type Receipt = {
  id: string;
  merchant: string;
  purchaseDate: string; // YYYY-MM-DD
  items: ReceiptItem[];
  savedAt: string; // ISO timestamp
  imageUrl?: string | null; // Short-lived signed URL for display
  imagePath?: string | null; // Private Supabase Storage path
};

export type Reminder = {
  id: string;
  item: string;
  dueDate: string; // YYYY-MM-DD
  location: string;
  done: boolean;
  createdAt: string;
};
