"use client";

import { type ReactNode, useMemo, useState } from "react";

export interface SortableColumn<Row> {
  key: string;
  label: string;
  align?: "left" | "right";
  sortable?: boolean;
  sortAccessor?: (row: Row) => number | string;
  render: (row: Row) => ReactNode;
}

export function SortableTable<Row>({
  columns,
  rows,
  rowKey,
  defaultSortKey,
  defaultSortDir = "desc",
}: {
  columns: SortableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
}) {
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  const sortedRows = useMemo(() => {
    const column = columns.find((c) => c.key === sortKey);
    if (!column?.sortAccessor) return rows;
    const accessor = column.sortAccessor;
    const sorted = [...rows].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    if (sortDir === "desc") sorted.reverse();
    return sorted;
  }, [rows, columns, sortKey, sortDir]);

  function toggleSort(column: SortableColumn<Row>) {
    if (!column.sortable) return;
    if (sortKey === column.key) {
      setSortDir((dir) => (dir === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(column.key);
      setSortDir("desc");
    }
  }

  return (
    <div className="overflow-x-auto rounded border border-neutral-800/90">
      <table className="w-full text-sm">
        <thead className="text-xs text-neutral-500">
          <tr className="border-b border-neutral-800">
            {columns.map((column) => (
              <th key={column.key} className={`px-3 py-2 font-medium ${column.align === "right" ? "text-right" : "text-left"}`}>
                {column.sortable ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(column)}
                    className={`inline-flex items-center gap-1 hover:text-neutral-300 ${column.align === "right" ? "flex-row-reverse" : ""}`}
                  >
                    {column.label}
                    {sortKey === column.key && (
                      <span className="text-neutral-400">{sortDir === "desc" ? "↓" : "↑"}</span>
                    )}
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-neutral-800 hover:bg-neutral-900">
              {columns.map((column) => (
                <td key={column.key} className={`px-3 py-2 ${column.align === "right" ? "text-right" : ""}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
