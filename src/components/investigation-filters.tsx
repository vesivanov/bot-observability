import Link from "next/link";
import { QueryForm } from "./query-form";
import { FilterSelect } from "./filter-select";
import { dashboardHref, type DashboardQuery } from "@/lib/query-context";
import { requestStatusLabel } from "@/lib/request-status";

export function InvestigationFilters({ context, codes = [], bots, showBot = true }: {
  context: DashboardQuery;
  codes?: { status_code: number; count: number }[];
  showBot?: boolean;
  bots?: string[];
}) {
  const exact = Array.from(new Set(["200", "301", "302", "307", "308", "403", "404", "429", "500", "503", ...codes.filter(c => c.status_code).map(c => String(c.status_code)), ...(context.status && /^\d+$/.test(context.status) ? [context.status] : [])])).sort();
  return <div className="investigation-filters">
    <nav className="outcome-presets" aria-label="Response filters">
      {[["", "All responses"], ["3xx", "Redirects"], ["errors", "Errors"], ["unknown", "Missing status"]].map(([status, label]) => <Link key={label} href={dashboardHref(context, { status: status || undefined })} aria-current={(context.status ?? "") === status ? "true" : undefined}>{label}</Link>)}
    </nav>
    <QueryForm key={JSON.stringify(context)} context={context} className={`page-search-form${context.path ? " page-search-detail" : ""}`}>
      {Object.entries(context).filter(([key, value]) => value != null && !["offset", "prefix", "status", ...(showBot ? ["bot"] : [])].includes(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={String(value)} />)}
      {!context.path && <label className="filter-field"><span className="field-label">Path starts with</span><input name="prefix" defaultValue={context.prefix ?? ""} placeholder="/en/blog/" className="filter-control font-mono" /></label>}
      {context.path && context.prefix && <input type="hidden" name="prefix" value={context.prefix} />}
      {showBot && (bots ? <FilterSelect label="Bot identity" name="bot" defaultValue={context.bot ?? ""} options={[{ value: "", label: "All bots" }, ...Array.from(new Set([...bots, ...(context.bot ? [context.bot] : [])])).sort().map(value => ({ value, label: value }))]} /> : <label className="filter-field"><span className="field-label">Bot identity</span><input name="bot" defaultValue={context.bot ?? ""} placeholder="All bots · exact name" className="filter-control" /></label>)}
      <FilterSelect label="Response" name="status" defaultValue={context.status ?? ""} options={[
        { value: "", label: "All responses" },
        ...["2xx", "3xx", "4xx", "5xx", "errors", "unknown"].map(value => ({ value, label: requestStatusLabel(value) })),
        ...exact.map(value => ({ value, label: value })),
      ]} />
      <button className="apply-button" type="submit">Filter</button>
    </QueryForm>
  </div>;
}
