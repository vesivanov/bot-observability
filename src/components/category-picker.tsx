"use client";

import { FilterSelect } from "./filter-select";
import { CATEGORY_ORDER, categoryMeta } from "@/lib/categories";
import type { DashboardQuery } from "@/lib/query-context";

export function CategoryPicker({ context }: { context: DashboardQuery }) {
  return <FilterSelect label="Category" name="category" defaultValue={context.category ?? ""} className="mobile-category" options={[
    { value: "", label: "All categories" }, { value: "ai", label: "All AI" },
    ...CATEGORY_ORDER.filter((category) => category !== "ai_crawler" || context.category === category).map((category) => ({ value: category, label: categoryMeta(category).label })),
  ]} />;
}
