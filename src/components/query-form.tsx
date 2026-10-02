"use client";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { dashboardHref, readDashboardQuery, type DashboardQuery } from "@/lib/query-context";

export function QueryForm({ context, children, className }: { context: DashboardQuery; children: ReactNode; className?: string }) {
  const router = useRouter();
  return <form method="GET" action="/dashboard" className={className} onSubmit={(event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    const changes = readDashboardQuery(fields);
    delete changes.offset;
    const query = new URLSearchParams(dashboardHref(context, changes).split("?")[1]);
    // An explicit All-projects choice also clears the remembered project.
    if ("project" in fields) query.set("project", fields.project);
    for (const key of ["trend", "cats", "gran"]) {
      if (key in fields) query.set(key, fields[key]);
    }
    router.push(`/dashboard?${query.toString()}`);
  }}>{children}</form>;
}
