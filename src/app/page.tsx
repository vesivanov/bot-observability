import { cookies } from "next/headers";
import Link from "next/link";
import { getBotLogToken, isSessionValid, SESSION_COOKIE_NAME } from "@/lib/auth";

const CATEGORIES = [
  ["AI Training", "Bulk model data collection", "bg-amber-400"],
  ["AI Search", "Citation and retrieval indexes", "bg-indigo-400"],
  ["AI Agent", "User-triggered page fetches", "bg-emerald-400"],
  ["Search Engine", "Traditional organic discovery", "bg-sky-400"],
  ["Social Preview", "Link previews and unfurlers", "bg-fuchsia-400"],
  ["SEO Tool", "Audits and competitive scans", "bg-orange-400"],
  ["Monitoring", "Uptime and performance probes", "bg-stone-400"],
  ["Archival", "Historical page preservation", "bg-zinc-500"],
  ["Generic / CLI", "Scripts, libraries, unknowns", "bg-neutral-500"],
];

const FEATURES = [
  ["Bot identity", "Detect crawler families, categories, and verified vs UA-only traffic.", "border-neutral-800"],
  ["Traffic trends", "Compare bot, page, and project movement across daily, weekly, and monthly views.", "border-neutral-800"],
  ["Response quality", "Review status classes, failing paths, API hits, and sensitive route probes.", "border-neutral-800"],
];

const DASHBOARD_VIEWS = [
  ["Overview", "Totals, crawler mix, daily trend, time-of-day distribution, movers, and AI crawls-vs-visits by company."],
  ["Bots", "Full bot list with categories, project spread, hit share, and last seen time — includes a per-bot detail view and an AI-only filter."],
  ["Health", "2xx/3xx/4xx/5xx mix, failing paths, and sensitive/API path hits."],
  ["Raw Events", "Filterable event log for individual bot requests and debugging."],
];

const INGEST_FIELDS = [
  ["project", "Groups traffic by product, site, or deployment."],
  ["url / path", "Identifies which content bots are requesting."],
  ["user_agent", "Drives bot detection and category assignment."],
  ["ip", "Enables reverse-DNS and CIDR verification when available."],
  ["status_code", "Separates successful reads from redirects, errors, and uncaptured rows."],
  ["heartbeat", "Tracks whether the logging pipeline is still alive."],
];

export default async function HomePage() {
  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const authed = isSessionValid(session ?? null, getBotLogToken());

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-6">
      <section className="max-w-2xl">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-amber-300">Bot traffic reporting</p>
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-100 sm:text-4xl">
          Bot Observability
        </h1>
        <p className="mt-4 text-sm leading-6 text-neutral-400">
          A focused dashboard for seeing which bots crawl your projects, which pages they hit, and whether those requests are healthy, broken, or suspicious.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {authed ? (
            <Link href="/dashboard" className="rounded border border-neutral-600 bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-white">
              Open dashboard
            </Link>
          ) : null}
          <a href="#categories" className="rounded border border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:border-neutral-600 hover:text-neutral-100">
            View categories
          </a>
        </div>

        {!authed ? (
          <form action="/login" method="POST" className="mt-5 flex max-w-md gap-2">
            <input
              name="token"
              type="password"
              placeholder="Access token"
              className="min-h-10 flex-1 rounded border border-neutral-800 bg-neutral-950 px-3 text-sm text-foreground outline-none placeholder:text-neutral-600 focus:border-neutral-600"
            />
            <button type="submit" className="rounded border border-neutral-600 bg-neutral-200 px-4 text-sm font-medium text-neutral-950 hover:bg-white">
              Sign in
            </button>
          </form>
        ) : null}
      </section>

      <section className="mt-12 border-t border-neutral-800 pt-8">
        <h2 className="text-sm font-semibold text-neutral-200">Operational views</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {FEATURES.map(([title, copy, border]) => (
            <div key={title} className={`rounded border ${border} bg-neutral-950 p-4`}>
              <h3 className="text-sm font-medium text-neutral-100">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-neutral-500">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-neutral-800 pt-8">
        <h2 className="text-sm font-semibold text-neutral-200">What you can inspect</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {DASHBOARD_VIEWS.map(([title, copy]) => (
            <div key={title} className="rounded border border-neutral-800 bg-neutral-950 px-3 py-2.5">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                <div>
                  <h3 className="text-xs font-medium text-neutral-200">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-neutral-500">{copy}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-neutral-800 pt-8">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-sm font-semibold text-neutral-200">Response status reporting</h2>
            <p className="mt-3 text-xs leading-5 text-neutral-500">
              Status reporting depends on tracked sites sending <span className="font-mono text-neutral-300">status_code</span>. Rows without that field are shown as <span className="text-neutral-300">not captured</span>, not as a real HTTP status.
            </p>
            <p className="mt-3 text-xs leading-5 text-neutral-500">
              Use the Status tab to find bots reading broken URLs, hitting API routes, probing admin/login paths, or generating server errors.
            </p>
          </div>
          <div className="rounded border border-neutral-800 bg-neutral-950 p-3">
            <h3 className="text-xs font-medium text-neutral-200">Useful ingestion fields</h3>
            <div className="mt-3 grid gap-2">
              {INGEST_FIELDS.map(([field, copy]) => (
                <div key={field} className="grid grid-cols-[7rem_1fr] gap-3 text-xs">
                  <span className="font-mono text-neutral-300">{field}</span>
                  <span className="leading-5 text-neutral-500">{copy}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="categories" className="mt-10 border-t border-neutral-800 pt-8">
        <h2 className="text-sm font-semibold text-neutral-200">Bot categories</h2>
        <div className="mt-4 overflow-x-auto rounded border border-neutral-800">
          <table className="w-full text-sm">
            <tbody>
              {CATEGORIES.map(([label, description, color]) => (
                <tr key={label} className="border-t border-neutral-800 first:border-t-0">
                  <td className="w-44 px-3 py-2.5 font-medium text-neutral-200">
                    <span className={`mr-2 inline-block h-2 w-2 rounded-full ${color}`} />
                    {label}
                  </td>
                  <td className="px-3 py-2.5 text-neutral-500">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="mt-12 border-t border-neutral-800 pt-5 text-xs text-neutral-600">
        Postgres event store
      </footer>
    </div>
  );
}
