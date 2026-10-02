"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { dashboardHref, readDashboardQuery } from "@/lib/query-context";
import Link from "next/link";
import type { FirstRunSetup } from "@/lib/first-run";

export function EmptySetup({ project, token, configured, invalid, projects, origin, snippet = "", delivered = false, lastProbe = null }: FirstRunSetup & {
  snippet?: string; delivered?: boolean; lastProbe?: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const context = readDashboardQuery(Object.fromEntries(params.entries()));
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [website, setWebsite] = useState("https://your-website.example/");
  const [probeAt, setProbeAt] = useState(lastProbe);
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setResult("Copied."); }
    catch { setResult("Select and copy the text below."); }
  }
  async function check(collector: boolean) {
    setBusy(true);
    try {
      const response = await fetch(collector ? "/api/send-test-hit" : `/api/send-test-hit?project=${encodeURIComponent(project)}`, collector ? {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project }),
      } : { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      if (collector) setResult(`Collector check passed for ${body.project}. The website sender has not been tested by this check.`);
      else {
        setProbeAt(body.lastProbe);
        setResult(body.lastProbe ? `Probe received for ${project} at ${body.lastProbe}. This sender path reached the collector.` : `No external probe received for ${project} yet. Run the website command below.`);
      }
      router.refresh();
    } catch (error) { setResult(`Check failed: ${error instanceof Error ? error.message : "request failed"}`); }
    finally { setBusy(false); }
  }
  const senderEnv = `BOT_COLLECTOR_ORIGIN=${origin}\nBOT_INGEST_TOKEN=${token}`;
  const probeCommand = `curl --user-agent 'BotObservability-Connection-Probe/1.0' ${JSON.stringify(website)}`;
  if (!configured || invalid || !token) return (
    <section className="rounded border border-neutral-800 bg-neutral-950 p-5">
      <h2 className="font-medium">Configure a project to connect this website</h2>
      <p className="mt-2 text-sm text-neutral-400">Run <code>npm run setup</code> or set <code>BOT_INGEST_TOKENS</code> to a JSON map of project names to secrets of at least 32 characters, then restart. The selected project needs a configured credential.</p>
    </section>
  );
  return (
    <section className="rounded border border-neutral-800 bg-neutral-950 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium text-neutral-100">{delivered ? "Website delivery" : "Connect your website"}</h2>
        <span className="font-mono text-sm text-neutral-300">{project}</span>
      </div>
      {projects.length > 1 && <div className="mt-3 flex flex-wrap gap-2">{projects.map((name) => <Link key={name} href={dashboardHref(context, { project: name })} className={`rounded border px-3 py-2 text-sm ${name === project ? "border-neutral-500 text-white" : "border-neutral-800 text-neutral-400"}`}>{name}</Link>)}</div>}
      <p className="mt-2 text-sm text-neutral-400">{delivered ? "This project has prior website delivery. A quiet or filtered period can have no bot requests." : "Install the sender on your website, then verify a probe for this project. Checks do not add bot traffic."}</p>
      <p className="mt-2 text-sm text-neutral-400">Collector origin: <code>{origin}</code>. Set <code>BOT_COLLECTOR_ORIGIN</code> on this dashboard to its reachable origin. Keep the website credential in server environment variables.</p>
      <details className="mt-4" open={!delivered}>
        <summary className="cursor-pointer py-2 text-sm text-neutral-200">1. Install the Next.js sender</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-neutral-900 p-3 text-xs leading-5">{senderEnv}</pre>
        <button onClick={() => copy(senderEnv)} className="mt-2 rounded border border-neutral-700 px-3 py-2 text-sm">Copy website environment</button>
        <p className="mt-3 text-sm text-neutral-400">Save this as <code>src/proxy.ts</code> (or <code>proxy.ts</code> without a src directory). Merge it into your existing proxy. Delivery is best effort; final status is unknown at this stage.</p>
        <pre className="mt-3 max-h-80 overflow-auto rounded bg-neutral-900 p-3 text-xs leading-5">{snippet}</pre>
        <button onClick={() => copy(snippet)} className="mt-2 rounded border border-neutral-700 px-3 py-2 text-sm">Copy sender</button>
      </details>
      <div className="mt-4">
        <label className="grid gap-2 text-sm text-neutral-300">2. Probe a website route that uses the sender
          <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className="min-h-10 rounded border border-neutral-700 bg-neutral-900 px-3 text-neutral-100" />
        </label>
        <pre className="mt-2 overflow-x-auto rounded bg-neutral-900 p-3 text-xs leading-5">{probeCommand}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => copy(probeCommand)} className="rounded border border-neutral-700 px-3 py-2 text-sm">Copy website probe</button>
          <button disabled={busy} onClick={() => check(false)} className="rounded border border-amber-700/50 px-3 py-2 text-sm text-amber-100 disabled:opacity-50">Check receipt</button>
          <button disabled={busy} onClick={() => check(true)} className="rounded border border-neutral-700 px-3 py-2 text-sm disabled:opacity-50">Collector check</button>
        </div>
        <p className="mt-3 text-sm text-neutral-400">{probeAt ? `External probe received: ${probeAt}.` : "No external probe receipt yet."} Receipt verifies this sender path; real bot requests will appear when they arrive.</p>
        {result && <p role="status" className="mt-3 text-sm text-neutral-200">{result}</p>}
      </div>
    </section>
  );
}
