import { OverviewSkeleton } from "@/app/dashboard/skeletons";

// Full-page fallback for first navigation into /dashboard (no shell yet —
// the shell itself renders synchronously once page.tsx's own render starts).
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-5 text-sm sm:px-6">
      <div className="mb-5 h-24 animate-pulse rounded border border-neutral-800/90 bg-neutral-950" />
      <OverviewSkeleton />
    </div>
  );
}
