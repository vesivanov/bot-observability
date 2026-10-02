import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAdminToken, isSessionValid, SESSION_COOKIE_NAME } from "@/lib/auth";
import { checkCollector } from "@/lib/collector-check";
import { getRequestDb } from "@/lib/request-db";

export const runtime = "nodejs";

async function authenticated() {
  const session = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return isSessionValid(session ?? null, getAdminToken());
}

export async function POST(request: Request) {
  if (!await authenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const project = typeof body?.project === "string" ? body.project : undefined;
  try {
    const result = await checkCollector(project);
    return NextResponse.json(result, { status: result.checked ? 200 : 503 });
  } catch {
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!await authenticated()) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "collector_not_configured" }, { status: 503 });
  const project = new URL(request.url).searchParams.get("project") || undefined;
  try {
    const delivery = await getRequestDb(process.env.DATABASE_URL).projectDelivery(project);
    return NextResponse.json({ project, ...delivery }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }
}
