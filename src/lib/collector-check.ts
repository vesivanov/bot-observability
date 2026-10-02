import { getRequestDb } from "./request-db";
import { getIpHashSecret, isStrongSecret } from "./auth";
import { getFirstRunSetup } from "./first-run";

// An internal write/read check; there is no HTTP destination and no fake event.
export async function checkCollector(project?: string) {
  const setup = getFirstRunSetup(project);
  if (!setup.configured || setup.invalid || !setup.token || !process.env.DATABASE_URL || !isStrongSecret(getIpHashSecret())) {
    return { checked: false, error: "collector_not_configured" } as const;
  }
  await getRequestDb(process.env.DATABASE_URL).recordConnectionReceipt(setup.project, "collector");
  return { checked: true, project: setup.project } as const;
}
