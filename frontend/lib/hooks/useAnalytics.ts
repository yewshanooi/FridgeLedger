import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "../api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MonthlySpendingItem {
  month: string;
  spending: number;
}

export interface CategorySpendingItem {
  name: string;
  value: number;
}

export interface LocationSpendingItem {
  location: string;
  spending: number;
}

export interface CategoryCountItem {
  category: string;
  count: number;
}

export interface ExpiryStatusItem {
  name: string;
  value: number;
  color: string;
}

export interface SummaryStats {
  total_receipts: number;
  total_items: number;
  total_spent: number;
  avg_per_receipt: number;
}

export interface InflationItem {
  item_name: string;
  merchant: string;
  first_purchase_date: string;
  first_price: number;
  latest_purchase_date: string;
  latest_price: number;
  price_change: number;
  price_change_percent: number;
  price_history: Array<{
    purchase_date: string;
    price: number;
  }>;
}

export interface AnalyticsData {
  monthly_spending: MonthlySpendingItem[];
  category_spending: CategorySpendingItem[];
  location_spending: LocationSpendingItem[];
  category_count: CategoryCountItem[];
  expiry_status: ExpiryStatusItem[];
  summary: SummaryStats;
  inflation_items: InflationItem[];
}

export interface WasteRatioItem {
  name: string;
  value: number;
  color: string;
}

export interface WasteData {
  waste_ratio: WasteRatioItem[];
  summary: {
    consumed_count: number;
    wasted_count: number;
    waste_ratio_percent: number;
    consumed_value: number;
    wasted_value: number;
  };
  wasted_items: Array<{
    name: string;
    category?: string | null;
    price?: number | null;
    merchant: string;
    purchase_date?: string | null;
  }>;
}

export type TimePeriod = "All" | "Last24Hours" | "Last7Days" | "Last30Days" | "YTD" | "Custom";

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const analyticsKeys = {
  all: ["analytics"] as const,
  analytics: (period: TimePeriod, customStart?: string, customEnd?: string) =>
    ["analytics", "data", period, customStart, customEnd] as const,
  waste: (period: TimePeriod, customStart?: string, customEnd?: string) =>
    ["analytics", "waste", period, customStart, customEnd] as const,
};

// ─── Fetch Functions ─────────────────────────────────────────────────────────

async function fetchAnalytics(
  period: TimePeriod,
  customStart?: string,
  customEnd?: string
): Promise<AnalyticsData> {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
  const params = new URLSearchParams({ period });

  if (period === "Custom" && customStart && customEnd) {
    params.append("custom_start", customStart);
    params.append("custom_end", customEnd);
  }

  const response = await fetch(`${apiUrl}/insights/analytics?${params.toString()}`, {
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch analytics data");
  }

  return response.json();
}

async function fetchWasteInsights(
  period: TimePeriod,
  customStart?: string,
  customEnd?: string
): Promise<WasteData> {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
  const params = new URLSearchParams({ period });

  if (period === "Custom" && customStart && customEnd) {
    params.append("custom_start", customStart);
    params.append("custom_end", customEnd);
  }

  const response = await fetch(`${apiUrl}/insights/waste?${params.toString()}`, {
    headers: await getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch waste insights");
  }

  return response.json();
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useAnalytics(
  period: TimePeriod,
  customStart?: string,
  customEnd?: string
) {
  return useQuery({
    queryKey: analyticsKeys.analytics(period, customStart, customEnd),
    queryFn: () => fetchAnalytics(period, customStart, customEnd),
    staleTime: 2 * 60 * 1000, // 2 minutes - analytics can be slightly stale
    enabled: period !== "Custom" || (!!customStart && !!customEnd), // Only fetch if custom dates are provided
  });
}

export function useWasteInsights(
  period: TimePeriod,
  customStart?: string,
  customEnd?: string
) {
  return useQuery({
    queryKey: analyticsKeys.waste(period, customStart, customEnd),
    queryFn: () => fetchWasteInsights(period, customStart, customEnd),
    staleTime: 2 * 60 * 1000, // 2 minutes - analytics can be slightly stale
    enabled: period !== "Custom" || (!!customStart && !!customEnd), // Only fetch if custom dates are provided
  });
}
