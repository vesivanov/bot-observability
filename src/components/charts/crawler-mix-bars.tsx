import Link from "next/link";
import { categoryLabel, categoryMeta } from "@/lib/categories";

interface CategoryCount {
  bot_category: string;
  count: number;
}

const OTHER_KEY = "other";
const TOP_N = 6;

// Horizontal bar list replacing the donut chart: one row per category
// (top 6 + "Other" for the rest), each linking to `?category=<cat>`.
export function CrawlerMixBars({
  data,
  total,
  categoryHref,
}: {
  data: CategoryCount[];
  total: number;
  categoryHref: (category: string) => string;
}) {
  if (data.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-neutral-500">No data</div>;
  }

  const sorted = [...data].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, TOP_N);
  const overflow = sorted.slice(TOP_N);
  const otherCount = overflow.reduce((sum, row) => sum + row.count, 0);
  const rows = otherCount > 0 ? [...top, { bot_category: OTHER_KEY, count: otherCount }] : top;
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  return (
    <div className="space-y-1.5">
      {rows.map((row) => {
        const isOther = row.bot_category === OTHER_KEY;
        const meta = isOther ? null : categoryMeta(row.bot_category);
        const label = isOther ? "Other" : categoryLabel(row.bot_category);
        const pctValue = total > 0 ? ((row.count / total) * 100).toFixed(1) : "0";
        const barWidth = row.count <= 0 ? 0 : Math.max(3, Math.min((row.count / maxCount) * 100, 100));
        const dotColor = isOther ? "bg-neutral-500" : meta!.dot;
        const barColor = isOther ? "bg-neutral-500" : meta!.bar;
        const rowContent = (
          <div className="grid grid-cols-[9rem_1fr_4.5rem_3rem] items-center gap-2 text-xs sm:grid-cols-[10rem_1fr_5rem_3rem]">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-neutral-300">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
              <span className="truncate">{label}</span>
            </span>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
            </div>
            <span className="text-right font-mono text-neutral-100">{row.count.toLocaleString()}</span>
            <span className="text-right font-mono text-neutral-500">{pctValue}%</span>
          </div>
        );
        return isOther ? (
          <div key={row.bot_category} className="rounded px-1.5 py-1">{rowContent}</div>
        ) : (
          <Link
            key={row.bot_category}
            href={categoryHref(row.bot_category)}
            className="block rounded px-1.5 py-1 transition-colors hover:bg-neutral-900/70"
          >
            {rowContent}
          </Link>
        );
      })}
    </div>
  );
}
