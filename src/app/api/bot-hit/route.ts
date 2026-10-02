import { ingestRequest } from "@/lib/ingestion";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return ingestRequest(request);
}
