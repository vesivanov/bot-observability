import { getDb } from "@/app/dashboard/db";
import { ConnectionPanel } from "./connection-panel";

export async function EmptyTrafficState({ project }: { project?: string }) {
  const delivery = await getDb().projectDelivery(project);
  return delivery.delivered
    ? <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-400">No requests match this selection. {delivery.lastProbe ? `External probe received for ${project ?? "a configured project"} at ${delivery.lastProbe}.` : "This selection has prior website delivery."} Change the time range or filters to inspect it. Quiet traffic alone does not indicate disconnection.</p>
    : <ConnectionPanel project={project} />;
}
