"use client";

import { useState, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import Link from "next/link";
import {
  useAnalytics,
  useWasteInsights,
  type TimePeriod,
  type InflationItem,
} from "@/lib/hooks/useAnalytics";

// ─── colour palette ───────────────────────────────────────────────────────────
const COLORS = [
  "#059669", // emerald
  "#2563eb", // blue
  "#ea580c", // orange
  "#7c3aed", // purple
  "#e11d48", // rose
  "#d97706", // amber
  "#0891b2", // cyan
  "#65a30d", // lime
];

// Types are now imported from useAnalytics hook

// ─── custom tooltip ───────────────────────────────────────────────────────────
interface TooltipPayloadItem {
  value: number;
  name?: string;
  dataKey?: string;
  color?: string;
  fill?: string;
  payload?: {
    [key: string]: string | number | boolean | null | undefined;
  };
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CurrencyTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  
  return (
    <div className="rounded-lg border border-[#d7d0c3] bg-white px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-semibold text-[#1f2a24]">{label}</p>}
      <p className="text-emerald-700 font-medium">RM {payload[0].value.toFixed(2)}</p>
    </div>
  );
}

function CountTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  
  return (
    <div className="rounded-lg border border-[#d7d0c3] bg-white px-3 py-2 text-xs shadow-md">
      {label && <p className="mb-1 font-semibold text-[#1f2a24]">{label}</p>}
      <p className="text-[#1f2a24] font-medium">{payload[0].value} items</p>
    </div>
  );
}

// ─── custom Y-axis tick for location chart ───────────────────────────────────
interface CustomYAxisTickProps {
  x?: number;
  y?: number;
  payload?: {
    value: string;
  };
}

function CustomLocationTick({ x = 0, y = 0, payload }: CustomYAxisTickProps) {
  if (!payload) return null;
  
  const maxLength = 10;
  const text = payload.value;
  const truncated = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{text}</title>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        fill="#526056"
        fontSize={10}
        className="cursor-help"
      >
        {truncated}
      </text>
    </g>
  );
}

// ─── empty state ──────────────────────────────────────────────────────────────
function EmptyChart({ 
  message, 
  linkText = "Upload receipts to populate charts",
  linkHref = "/chatbot"
}: { 
  message: string;
  linkText?: string;
  linkHref?: string;
}) {
  return (
    <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[#d7d0c3] bg-[#fbfaf7]">
      <div className="text-center">
        <p className="text-sm font-medium text-[#1f2a24]">{message}</p>
        <Link
          href={linkHref}
          className="mt-1 block text-xs text-emerald-700 hover:underline"
        >
          {linkText}
        </Link>
      </div>
    </div>
  );
}

// ─── time filter types ────────────────────────────────────────────────────────
const PERIOD_LABELS: Record<TimePeriod, string> = {
  All: "All",
  Last24Hours: "Last 24 Hours",
  Last7Days: "Last 7 Days",
  Last30Days: "Last 30 Days",
  YTD: "Year-to-Date (YTD)",
  Custom: "Custom Range",
};

// ─── page ─────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("All");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Use React Query hooks for data fetching
  const {
    data: analyticsData,
    isLoading: isLoadingAnalytics,
    error: analyticsError,
  } = useAnalytics(timePeriod, customStartDate, customEndDate);

  const {
    data: wasteData,
    isLoading: isLoadingWaste,
    error: wasteError,
  } = useWasteInsights(timePeriod, customStartDate, customEndDate);

  const isRefreshing = isLoadingAnalytics || isLoadingWaste;
  const error = analyticsError || wasteError;

  // Use empty data structure if no data yet (for initial render)
  const {
    monthly_spending = [],
    category_spending = [],
    location_spending = [],
    category_count = [],
    expiry_status = [],
    summary = {
      total_receipts: 0,
      total_items: 0,
      total_spent: 0,
      avg_per_receipt: 0,
    },
    inflation_items = [],
  } = analyticsData || {};

  const topCategory = category_spending[0]?.name ?? "—";
  const wasteSummary = wasteData?.summary ?? {
    consumed_count: 0,
    wasted_count: 0,
    waste_ratio_percent: 0,
    consumed_value: 0,
    wasted_value: 0,
  };
  const wasteRatio = wasteData?.waste_ratio ?? [];
  const wastedItems = wasteData?.wasted_items ?? [];

  // Memoized date formatter
  const formatDate = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-GB', { month: 'long' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }, []);

  // Validate chart data to prevent crashes
  const isValidChartData = useCallback((data: unknown[]): boolean => {
    if (!Array.isArray(data) || data.length === 0) return false;
    return data.every(item => 
      item && 
      typeof item === 'object' && 
      !Object.values(item).some(v => 
        v === null || 
        v === undefined || 
        (typeof v === 'number' && (Number.isNaN(v) || !Number.isFinite(v)))
      )
    );
  }, []);

  // Memoize grouped inflation items to prevent unnecessary re-renders
  const groupedInflationItems = useMemo(() => {
    return Object.entries(
      inflation_items.reduce((acc, item) => {
        if (!acc[item.merchant]) {
          acc[item.merchant] = [];
        }
        acc[item.merchant].push(item);
        return acc;
      }, {} as Record<string, InflationItem[]>)
    );
  }, [inflation_items]);

  // Show error state with retry (only if we have an error and no data)
  if (error && !analyticsData) {
    return (
      <div className="p-4 sm:p-6">
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <p className="text-sm font-medium text-red-600">
              {error instanceof Error ? error.message : "Failed to load analytics"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-800"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header with subtle loading indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
              Insights
            </p>
            <h2 className="mt-1 text-3xl font-bold text-[#1f2a24]">Analytics</h2>
            <p className="mt-2 text-sm text-[#526056]">
              Visual breakdown of your grocery spending and pantry habits.
            </p>
          </div>
          {/* Subtle loading indicator */}
          {isRefreshing && (
            <div className="flex items-center gap-2 rounded-full bg-[#e7e1d7] px-3 py-1.5">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#6a756d] border-t-transparent"></div>
              <span className="text-xs font-medium text-[#6a756d]">Updating...</span>
            </div>
          )}
        </div>
      </div>

      {/* Time Filter */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          {(["All", "Last24Hours", "Last7Days", "Last30Days", "YTD", "Custom"] as TimePeriod[]).map((period) => (
            <button
              key={period}
              onClick={() => setTimePeriod(period)}
              disabled={isRefreshing}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                timePeriod === period
                  ? "bg-emerald-700 text-white"
                  : "border border-[#d7d0c3] text-[#526056] hover:border-emerald-600 hover:text-emerald-700"
              } ${isRefreshing ? 'cursor-wait' : 'cursor-pointer'}`}
            >
              {PERIOD_LABELS[period]}
            </button>
          ))}
        </div>

        {/* Custom Date Range Inputs */}
        {timePeriod === "Custom" && (
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-[#d7d0c3] bg-white p-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-[#526056] w-10 sm:w-auto">From:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="flex-1 sm:flex-none rounded-md border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-[#526056] w-10 sm:w-auto">To:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="flex-1 sm:flex-none rounded-md border border-[#d7d0c3] bg-[#fbfaf7] px-3 py-1.5 text-xs outline-none focus:border-emerald-600"
              />
              <button
                onClick={() => {
                  setCustomStartDate("");
                  setCustomEndDate("");
                }}
                className="rounded-md bg-[#1f2a24] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3d4840] transition-colors"
              >
                Reset
              </button>
            </div>
            {customStartDate && customEndDate && (
              <span className="text-xs text-[#526056] mt-1 sm:mt-0">
                ({Math.ceil((new Date(customEndDate).getTime() - new Date(customStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1} days)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Summary strip with smooth transition */}
      <div className={`mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 transition-opacity duration-300 ${isRefreshing ? 'opacity-60' : 'opacity-100'}`}>
        {[
          { label: "Total Receipts", value: summary.total_receipts },
          { label: "Total Items", value: summary.total_items },
          { label: "Total Spent", value: summary.total_spent, prefix: "RM " },
          { label: "Avg per Receipt", value: summary.avg_per_receipt, prefix: "RM " },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[#d7d0c3] bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[#526056]">
              {s.label}
            </p>
            <p className="mt-1.5 text-2xl font-bold text-[#1f2a24]">
              {s.prefix || ""}{typeof s.value === "number" && s.prefix ? s.value.toFixed(2) : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Chart grid with smooth transition */}
      <div className={`space-y-5 transition-opacity duration-300 ${isRefreshing ? 'opacity-60' : 'opacity-100'}`}>
        {/* 1 — Monthly spending (full width) */}
        <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="font-semibold text-[#1f2a24]">Spending Over Time</h3>
            <p className="text-xs text-[#6a756d]">
              {timePeriod === "All"
                ? "Total grocery spend per month"
                : timePeriod === "Last24Hours"
                ? "Total grocery spend for last 24 hours"
                : timePeriod === "Last7Days"
                ? "Total grocery spend for last 7 days"
                : timePeriod === "Last30Days"
                ? "Total grocery spend for last 30 days"
                : timePeriod === "YTD"
                ? "Total grocery spend for this year"
                : timePeriod === "Custom" && customStartDate && customEndDate
                ? `Total grocery spend from ${new Date(customStartDate).toLocaleDateString("en-GB")} to ${new Date(customEndDate).toLocaleDateString("en-GB")}`
                : "Total grocery spend"}
            </p>
          </div>
          {monthly_spending.length === 0 ? (
            <EmptyChart message="No data yet" />
          ) : !isValidChartData(monthly_spending) ? (
            <div className="flex h-48 items-center justify-center text-sm text-red-600">
              Invalid chart data. Please try refreshing.
            </div>
          ) : (
            <div className="overflow-x-auto md:overflow-x-visible">
              <div className="min-w-[300px] md:min-w-0">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={monthly_spending}
                    margin={{ top: 4, right: 8, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e7e1d7"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10, fill: "#526056" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#526056" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `RM${v}`}
                      width={50}
                    />
                    <Tooltip content={<CurrencyTooltip />} />
                    <Bar
                      dataKey="spending"
                      fill="#059669"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* 2 — Category spend + Location spend side by side */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Spending by category — donut */}
          <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="font-semibold text-[#1f2a24]">
                Spending by Category
              </h3>
              <p className="text-xs text-[#6a756d]">
                Top category:{" "}
                <span className="font-medium text-[#1f2a24]">
                  {topCategory}
                </span>
              </p>
            </div>
            {category_spending.length === 0 ? (
              <EmptyChart message="No data yet" />
            ) : !isValidChartData(category_spending) ? (
              <div className="flex h-48 items-center justify-center text-sm text-red-600">
                Invalid chart data. Please try refreshing.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart margin={{ bottom: 50 }}>
                  <Pie
                    data={category_spending}
                    cx="50%"
                    cy="45%"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {category_spending.map((_, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [`RM ${Number(v).toFixed(2)}`, "Spent"]}
                    contentStyle={{
                      fontSize: 11,
                      borderColor: "#d7d0c3",
                      borderRadius: 8,
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={6}
                    wrapperStyle={{ fontSize: '10px' }}
                    formatter={(value) => (
                      <span style={{ fontSize: 10, color: "#526056" }}>
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Spending by location — horizontal bar */}
          <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="font-semibold text-[#1f2a24]">
                Spending by Location
              </h3>
              <p className="text-xs text-[#6a756d]">
                Which stores you spend most at
              </p>
            </div>
            {location_spending.length === 0 ? (
              <EmptyChart message="No data yet" />
            ) : !isValidChartData(location_spending) ? (
              <div className="flex h-48 items-center justify-center text-sm text-red-600">
                Invalid chart data. Please try refreshing.
              </div>
            ) : (
              <div className="overflow-x-auto md:overflow-x-visible">
                <div className="min-w-[280px] md:min-w-0">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      layout="vertical"
                      data={location_spending}
                      margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e7e1d7"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: "#526056" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `RM${v}`}
                      />
                      <YAxis
                        type="category"
                        dataKey="location"
                        tick={<CustomLocationTick />}
                        axisLine={false}
                        tickLine={false}
                        width={85}
                      />
                      <Tooltip content={<CurrencyTooltip />} />
                      <Bar
                        dataKey="spending"
                        radius={[0, 4, 4, 0]}
                        maxBarSize={32}
                      >
                        {location_spending.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3 — Items per category + Expiry status side by side */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Items purchased per category */}
          <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="font-semibold text-[#1f2a24]">
                Items by Category
              </h3>
              <p className="text-xs text-[#6a756d]">
                How many items purchased per food category
              </p>
            </div>
            {category_count.length === 0 ? (
              <EmptyChart message="No data yet" />
            ) : !isValidChartData(category_count) ? (
              <div className="flex h-48 items-center justify-center text-sm text-red-600">
                Invalid chart data. Please try refreshing.
              </div>
            ) : (
              <div className="overflow-x-auto md:overflow-x-visible">
                <div className="min-w-[300px] md:min-w-0">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={category_count}
                      margin={{ top: 4, right: 8, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e7e1d7"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="category"
                        tick={{ fontSize: 10, fill: "#526056" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: "#526056" }}
                        axisLine={false}
                        tickLine={false}
                        width={28}
                      />
                      <Tooltip content={<CountTooltip />} />
                      <Bar
                        dataKey="count"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={48}
                      >
                        {category_count.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Expiry status — donut */}
          <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="font-semibold text-[#1f2a24]">
                Pantry Expiry Status
              </h3>
              <p className="text-xs text-[#6a756d]">
                Current freshness breakdown of tracked items
              </p>
            </div>
            {expiry_status.length === 0 ? (
              <EmptyChart message="No data yet" />
            ) : !isValidChartData(expiry_status) ? (
              <div className="flex h-48 items-center justify-center text-sm text-red-600">
                Invalid chart data. Please try refreshing.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart margin={{ bottom: 50 }}>
                  <Pie
                    data={expiry_status}
                    cx="50%"
                    cy="45%"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {expiry_status.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => `${Number(v)} items`}
                    contentStyle={{
                      fontSize: 11,
                      borderColor: "#d7d0c3",
                      borderRadius: 8,
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={6}
                    wrapperStyle={{ fontSize: '10px' }}
                    formatter={(value) => (
                      <span style={{ fontSize: 10, color: "#526056" }}>
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 4 — Waste ratio */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
          <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="font-semibold text-[#1f2a24]">Waste Ratio</h3>
              <p className="text-xs text-[#6a756d]">
                Used versus wasted pantry items
              </p>
            </div>
            {wasteRatio.length === 0 ? (
              <EmptyChart 
                message="No data yet" 
                linkText="Mark items as used or wasted"
                linkHref="/expiry"
              />
            ) : !isValidChartData(wasteRatio) ? (
              <div className="flex h-48 items-center justify-center text-sm text-red-600">
                Invalid chart data. Please try refreshing.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart margin={{ bottom: 50 }}>
                  <Pie
                    data={wasteRatio}
                    cx="50%"
                    cy="45%"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {wasteRatio.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => `${Number(v)} items`}
                    contentStyle={{
                      fontSize: 11,
                      borderColor: "#d7d0c3",
                      borderRadius: 8,
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={6}
                    wrapperStyle={{ fontSize: '10px' }}
                    formatter={(value) => (
                      <span style={{ fontSize: 10, color: "#526056" }}>
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="font-semibold text-[#1f2a24]">Waste Summary</h3>
              <p className="text-xs text-[#6a756d]">
                Items marked as wasted in Expiry
              </p>
            </div>
            {wasteSummary.wasted_count === 0 && wasteSummary.waste_ratio_percent === 0 ? (
              <EmptyChart 
                message="No data yet" 
                linkText="Mark items as wasted"
                linkHref="/expiry"
              />
            ) : (
              <>
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    { label: "Total Items", value: wasteSummary.wasted_count },
                    { label: "Waste Rate", value: `${wasteSummary.waste_ratio_percent.toFixed(1)}%` },
                    { label: "Wasted Value", value: `RM ${wasteSummary.wasted_value.toFixed(2)}` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg bg-[#f7f4ee] p-3">
                      <p className="text-xs text-[#6a756d]">{item.label}</p>
                      <p className="mt-1 text-lg font-bold text-[#1f2a24]">{item.value}</p>
                    </div>
                  ))}
                </div>
                {wastedItems.length === 0 ? (
                  <EmptyChart 
                    message="No data yet" 
                    linkText="Mark items as used or wasted"
                    linkHref="/expiry"
                  />
                ) : (
                  <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                    {wastedItems.slice(0, 8).map((item, index) => (
                      <li
                        key={`${item.name}-${index}`}
                        className="flex items-center justify-between rounded-lg border border-[#e7e1d7] bg-[#fbfaf7] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#1f2a24]">
                            {item.name}
                          </p>
                          <p className="truncate text-xs text-[#6a756d]">
                            {item.merchant}
                            {item.category ? ` · ${item.category}` : ""}
                          </p>
                        </div>
                        <p className="ml-3 shrink-0 text-xs font-semibold text-red-600">
                          RM {(item.price ?? 0).toFixed(2)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        {/* 5 — Inflation Tracker (full width) */}
        <div className="rounded-xl border border-[#d7d0c3] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="font-semibold text-[#1f2a24]">
              Inflation Tracker
            </h3>
            <p className="text-xs text-[#6a756d]">
              Price changes for items from the same store
            </p>
          </div>
          {inflation_items.length === 0 ? (
            <EmptyChart message="Upload multiple receipts from the same store to track price changes" />
          ) : (
            <div className="space-y-4">
              {/* Group items by merchant */}
              {groupedInflationItems.map(([merchant, items]) => (
                <div key={merchant} className="rounded-lg border border-[#e7e1d7] bg-[#fbfaf7] p-4">
                  {/* Merchant Header */}
                  <div className="mb-3 flex items-center gap-2 border-b border-[#e7e1d7] pb-2">
                    <div className="rounded-full bg-emerald-700 px-3 py-1">
                      <span className="text-sm font-semibold text-white">{merchant}</span>
                    </div>
                    <span className="text-xs text-[#526056]">
                      {items.length} {items.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {/* Items for this merchant */}
                  <div className="space-y-3">
                    {items.map((item, idx) => {
                      const itemKey = `${merchant}-${idx}`;
                      const isExpanded = expandedItems.has(itemKey);
                      
                      // Use complete price history from backend
                      const lineData = item.price_history.map(point => ({
                        date: formatDate(point.purchase_date),
                        price: point.price,
                      }));

                      // Validate line chart data
                      const isValidLineData = isValidChartData(lineData);

                      return (
                        <div
                          key={itemKey}
                          className="overflow-hidden rounded-lg border border-[#d7d0c3] bg-white transition-all hover:border-emerald-600 hover:shadow-sm"
                        >
                          {/* Item Header - Always Visible */}
                          <div
                            className="flex cursor-pointer flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0"
                            onClick={() => {
                              setExpandedItems((prev) => {
                                const newSet = new Set(prev);
                                if (newSet.has(itemKey)) {
                                  newSet.delete(itemKey);
                                } else {
                                  newSet.add(itemKey);
                                }
                                return newSet;
                              });
                            }}
                          >
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-semibold text-[#1f2a24]">{item.item_name}</h4>
                                <span className="whitespace-nowrap rounded-full bg-[#e7e1d7] px-2 py-0.5 text-xs text-[#6a756d]">
                                  {item.price_history.length} purchases
                                </span>
                              </div>
                              <div className="mt-2 flex flex-col gap-1 text-xs text-[#526056] sm:flex-row sm:items-center sm:gap-6">
                                <div>
                                  <span className="font-medium">First:</span>{" "}
                                  <span className="text-[#1f2a24]">
                                    RM {item.first_price.toFixed(2)}
                                  </span>{" "}
                                  <span className="text-[#6a756d]">
                                    ({formatDate(item.first_purchase_date)})
                                  </span>
                                </div>
                                <div>
                                  <span className="font-medium">Latest:</span>{" "}
                                  <span className="text-[#1f2a24]">
                                    RM {item.latest_price.toFixed(2)}
                                  </span>{" "}
                                  <span className="text-[#6a756d]">
                                    ({formatDate(item.latest_purchase_date)})
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between border-t border-[#e7e1d7] pt-3 sm:ml-4 sm:mt-0 sm:justify-end sm:border-0 sm:pt-0">
                              <div className="flex items-center gap-2">
                                <div className="text-left sm:text-right">
                                  <p className="text-lg font-bold text-red-600">
                                    +{item.price_change_percent.toFixed(1)}%
                                  </p>
                                  <p className="text-xs text-[#526056]">
                                    +RM {item.price_change.toFixed(2)}
                                  </p>
                                </div>
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                                  <svg
                                    className="h-5 w-5 text-red-600"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                                    />
                                  </svg>
                                </div>
                              </div>
                              {/* Expand/Collapse Icon */}
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#526056"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`ml-3 shrink-0 transition-transform ${
                                  isExpanded ? "rotate-180" : ""
                                }`}
                              >
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </div>
                          </div>

                          {/* Expandable Chart Section */}
                          <div
                            className={`grid transition-all duration-300 ease-in-out ${
                              isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                            }`}
                          >
                            <div className="overflow-hidden">
                              <div className="border-t border-[#e7e1d7] bg-white p-4">
                              {!isValidLineData ? (
                                <div className="flex h-48 items-center justify-center text-sm text-red-600">
                                  Invalid chart data. Please try refreshing.
                                </div>
                              ) : (
                                <div className="overflow-x-auto md:overflow-x-visible">
                                  <div className="min-w-[280px] md:min-w-0">
                                    <ResponsiveContainer width="100%" height={200}>
                                      <LineChart
                                        data={lineData}
                                        margin={{ top: 8, right: 8, left: 4, bottom: 8 }}
                                      >
                                        <CartesianGrid
                                          strokeDasharray="3 3"
                                          stroke="#e7e1d7"
                                          vertical={false}
                                        />
                                        <XAxis
                                          dataKey="date"
                                          tick={{ fontSize: 9, fill: "#526056" }}
                                          axisLine={false}
                                          tickLine={false}
                                        />
                                        <YAxis
                                          tick={{ fontSize: 10, fill: "#526056" }}
                                          axisLine={false}
                                          tickLine={false}
                                          tickFormatter={(v) => `RM${v}`}
                                          domain={['dataMin - 0.5', 'dataMax + 0.5']}
                                          width={50}
                                        />
                                        <Tooltip
                                          formatter={(v) => [`RM ${Number(v).toFixed(2)}`, "Price"]}
                                          contentStyle={{
                                            fontSize: 11,
                                            borderColor: "#d7d0c3",
                                            borderRadius: 8,
                                          }}
                                        />
                                        <Line
                                          type="monotone"
                                          dataKey="price"
                                          stroke="#e11d48"
                                          strokeWidth={2}
                                          dot={{ fill: "#e11d48", r: 3 }}
                                          activeDot={{ r: 5 }}
                                        />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                </div>
                              )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
