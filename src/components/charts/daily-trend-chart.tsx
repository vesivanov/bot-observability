"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { ChartTooltip, axisCursor, tooltipWrapperStyle } from "@/components/charts/chart-tooltip";
import { categoryMeta, categoryShortLabel, sortCategories } from "@/lib/categories";

interface DailyCount {
  date: string;
  count: number;
}

interface DailyCategoryCount {
  date: string;
  bot_category: string;
  count: number;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fillDailyTrend(data: DailyCount[], periodDays: number, referenceTime: Date): DailyCount[] {
  const byDate = new Map(data.map((row) => [row.date, row.count]));
  const end = new Date(referenceTime);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(periodDays - 1, 0));

  return Array.from({ length: periodDays }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = dateKey(date);
    return { date: key, count: byDate.get(key) ?? 0 };
  });
}

const OTHER_CATEGORY_KEY = "other";
const CATEGORY_SERIES_CAP = 6;
const OTHER_CATEGORY_COLOR = "#525252";

function seriesLabel(category: string) {
  return category === OTHER_CATEGORY_KEY ? "Other" : categoryShortLabel(category);
}

function seriesColor(category: string) {
  return category === OTHER_CATEGORY_KEY ? OTHER_CATEGORY_COLOR : categoryMeta(category).color;
}

function buildDailyCategorySeries(data: DailyCategoryCount[], bucketKeys: string[]) {
  const totals = new Map<string, number>();
  for (const row of data) {
    totals.set(row.bot_category, (totals.get(row.bot_category) ?? 0) + row.count);
  }

  const orderedCategories = sortCategories(Array.from(totals.keys()), totals);
  const hasOverflow = orderedCategories.length > CATEGORY_SERIES_CAP + 1;
  const categories = hasOverflow ? orderedCategories.slice(0, CATEGORY_SERIES_CAP) : orderedCategories;
  const overflowCategories = hasOverflow ? orderedCategories.slice(CATEGORY_SERIES_CAP) : [];
  if (hasOverflow) {
    categories.push(OTHER_CATEGORY_KEY);
    totals.set(OTHER_CATEGORY_KEY, overflowCategories.reduce((sum, cat) => sum + (totals.get(cat) ?? 0), 0));
  }

  const overflowSet = new Set(overflowCategories);
  const byBucketCategory = new Map<string, number>();
  for (const row of data) {
    const key = overflowSet.has(row.bot_category) ? `${row.date}:${OTHER_CATEGORY_KEY}` : `${row.date}:${row.bot_category}`;
    byBucketCategory.set(key, (byBucketCategory.get(key) ?? 0) + row.count);
  }
  const series = bucketKeys.map((bucketKey) => {
    const entry: Record<string, string | number> = { date: bucketKey };
    for (const category of categories) {
      entry[category] = byBucketCategory.get(`${bucketKey}:${category}`) ?? 0;
    }
    return entry;
  });

  return { categories, series, totals };
}

export type Granularity = "day" | "week" | "month";

function bucketStart(dateStr: string, gran: Granularity): string {
  const d = new Date(dateStr + "T00:00:00");
  if (gran === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }
  if (gran === "week") {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday-based ISO week
    d.setDate(d.getDate() + diff);
  }
  return dateKey(d);
}

function aggregateDaily(data: DailyCount[], gran: Granularity): DailyCount[] {
  if (gran === "day") return data;
  const map = new Map<string, number>();
  for (const row of data) {
    const key = bucketStart(row.date, gran);
    map.set(key, (map.get(key) ?? 0) + row.count);
  }
  return Array.from(map.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateDailyCategory(data: DailyCategoryCount[], gran: Granularity): DailyCategoryCount[] {
  if (gran === "day") return data;
  const map = new Map<string, DailyCategoryCount>();
  for (const row of data) {
    const date = bucketStart(row.date, gran);
    const key = `${date}:${row.bot_category}`;
    const existing = map.get(key);
    if (existing) existing.count += row.count;
    else map.set(key, { date, bot_category: row.bot_category, count: row.count });
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function formatBucketLabel(dateStr: string, granularity: Granularity) {
  const date = new Date(dateStr + "T00:00:00");
  if (granularity === "month") return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatBucketTooltipLabel(dateStr: string, granularity: Granularity) {
  const date = new Date(dateStr + "T00:00:00");
  if (granularity === "month") return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  if (granularity === "week") return `Week of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function DailyTrendChart({ data, granularity = "day" }: { data: DailyCount[]; granularity?: Granularity }) {
  if (data.length === 0) {
    return <div className="h-48 flex items-center justify-center text-neutral-500 text-sm">No data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.22} />
            <stop offset="48%" stopColor="#a16207" stopOpacity={0.10} />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#737373", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(d) => formatBucketLabel(d, granularity)}
        />
        <YAxis
          tick={{ fill: "#737373", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          content={<ChartTooltip valueLabel="Hits" formatLabel={(label) => formatBucketTooltipLabel(String(label), granularity)} />}
          cursor={axisCursor}
          isAnimationActive={false}
          wrapperStyle={tooltipWrapperStyle}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#fbbf24"
          strokeWidth={2}
          fill="url(#trendFill)"
          dot={false}
          activeDot={{ r: 4, fill: "#fcd34d", stroke: "#120f08", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DailyTrendDashboard({
  dailyTrend,
  categoryTrend,
  periodDays,
  referenceTime,
}: {
  dailyTrend: DailyCount[];
  categoryTrend: DailyCategoryCount[];
  periodDays: number;
  referenceTime: Date;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const mode = searchParams.get("trend") === "category" ? "category" : "total";
  const allowedGranularities: Granularity[] = [
    "day",
    ...(periodDays >= 30 ? (["week"] as const) : []),
    ...(periodDays >= 90 ? (["month"] as const) : []),
  ];
  const requestedGran = (searchParams.get("gran") as Granularity | null) ?? "day";
  const granularity = allowedGranularities.includes(requestedGran) ? requestedGran : "day";
  const filledDailyTrend = useMemo(
    () => fillDailyTrend(dailyTrend, periodDays, referenceTime),
    [dailyTrend, periodDays, referenceTime],
  );
  const displayDailyTrend = useMemo(
    () => aggregateDaily(filledDailyTrend, granularity),
    [filledDailyTrend, granularity],
  );

  function setMode(nextMode: "total" | "category") {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "category") {
      params.set("trend", "category");
    } else {
      params.delete("trend");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function setGranularity(nextGran: Granularity) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextGran === "day") {
      params.delete("gran");
    } else {
      params.set("gran", nextGran);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded border border-neutral-800 bg-neutral-950 p-0.5">
          {(["total", "category"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`min-h-7 rounded-sm px-3 text-xs font-medium transition-colors ${
                mode === option
                  ? "bg-neutral-800 text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
              aria-pressed={mode === option}
            >
              {option === "total" ? "Total" : "By category"}
            </button>
          ))}
        </div>
        {allowedGranularities.length > 1 && (
          <div className="inline-flex rounded border border-neutral-800 bg-neutral-950 p-0.5">
            {allowedGranularities.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setGranularity(option)}
                className={`min-h-7 rounded-sm px-2.5 text-xs font-medium capitalize transition-colors ${
                  granularity === option
                    ? "bg-neutral-800 text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
                aria-pressed={granularity === option}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={mode === "total" ? "h-[200px]" : undefined}>
        {mode === "total" ? (
          <DailyTrendChart data={displayDailyTrend} granularity={granularity} />
        ) : (
          <DailyCategoryTrendChart data={categoryTrend} periodDays={periodDays} referenceTime={referenceTime} granularity={granularity} />
        )}
      </div>
    </div>
  );
}

export function DailyCategoryTrendChart({
  data,
  periodDays,
  referenceTime,
  granularity = "day",
}: {
  data: DailyCategoryCount[];
  periodDays: number;
  referenceTime: Date;
  granularity?: Granularity;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { categories, series, totals } = useMemo(() => {
    if (granularity !== "day") {
      const aggregated = aggregateDailyCategory(data, granularity);
      const bucketKeys = Array.from(new Set(aggregated.map((row) => row.date))).sort();
      return buildDailyCategorySeries(aggregated, bucketKeys);
    }
    const bucketKeys = fillDailyTrend([], periodDays, referenceTime).map((row) => row.date);
    return buildDailyCategorySeries(data, bucketKeys);
  }, [data, periodDays, referenceTime, granularity]);
  const catsParam = searchParams.get("cats");
  const selectedFromUrl = catsParam === "none" ? [] : catsParam?.split(",").filter(Boolean) ?? [];
  const selectedSet = new Set(selectedFromUrl);
  const enabledCategories = !catsParam
    ? categories
    : categories.filter((category) => selectedSet.has(category));

  if (categories.length === 0) {
    return <div className="h-64 flex items-center justify-center text-neutral-500 text-sm">No category data</div>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {categories.map((category) => {
          const active = enabledCategories.includes(category);
          return (
            <button
              key={category}
              type="button"
              onClick={() => {
                const next = new Set(enabledCategories);
                if (next.has(category)) next.delete(category);
                else next.add(category);
                const params = new URLSearchParams(searchParams.toString());
                const selected = categories.filter((item) => next.has(item));
                if (selected.length === categories.length) params.delete("cats");
                else if (selected.length === 0) params.set("cats", "none");
                else params.set("cats", selected.join(","));
                const query = params.toString();
                router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
              }}
              className={`inline-flex min-h-8 items-center gap-2 rounded border px-2.5 text-xs transition-colors ${
                active
                  ? "border-neutral-600 bg-neutral-900 text-neutral-100"
                  : "border-neutral-800 bg-neutral-950 text-neutral-500 hover:text-neutral-300"
              }`}
              aria-pressed={active}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: active ? seriesColor(category) : "#404040" }} />
              <span>{seriesLabel(category)}</span>
              <span className="font-mono text-[11px] tabular-nums text-neutral-500">{(totals.get(category) ?? 0).toLocaleString()}</span>
            </button>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={series} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.07)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#737373", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(d) => formatBucketLabel(d, granularity)}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fill: "#737373", fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            content={<ChartTooltip formatLabel={(label) => formatBucketTooltipLabel(String(label), granularity)} />}
            cursor={axisCursor}
            isAnimationActive={false}
            wrapperStyle={tooltipWrapperStyle}
          />
          {enabledCategories.map((category) => (
            <Area
              key={category}
              type="monotone"
              dataKey={category}
              name={seriesLabel(category)}
              stackId="categories"
              stroke={seriesColor(category)}
              strokeWidth={1.5}
              fill={seriesColor(category)}
              fillOpacity={0.32}
              dot={false}
              activeDot={{ r: 3, stroke: "#120f08", strokeWidth: 1 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
      {enabledCategories.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-500">Select at least one category to show the trend.</p>
      ) : null}
    </div>
  );
}

export function TrendSparkline({ data, color = "#fbbf24" }: { data: DailyCount[]; color?: string }) {
  if (data.length === 0) return null;
  const recent = data.slice(-14);

  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={recent} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Area
          type="monotone"
          dataKey="count"
          stroke={color}
          strokeWidth={1.5}
          fill="none"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
