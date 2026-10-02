import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getFirstRunSetup } from "@/lib/first-run";
import { getDb } from "@/app/dashboard/db";
import { EmptySetup } from "./empty-setup";

export async function ConnectionPanel({ project }: { project?: string }) {
  const setup = getFirstRunSetup(project);
  const [delivery, snippet] = await Promise.all([
    getDb().projectDelivery(setup.project || project),
    readFile(join(process.cwd(), "examples/nextjs/proxy.ts"), "utf8"),
  ]);
  return <EmptySetup {...setup} {...delivery} snippet={snippet} />;
}
