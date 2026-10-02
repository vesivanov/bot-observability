import { getIngestionConfig } from "@/lib/auth";
import { getCollectorOrigin } from "./collector-origin";

export interface FirstRunSetup {
  configured: boolean;
  invalid: boolean;
  project: string;
  token: string;
  projects: string[];
  origin: string;
}

/**
 * Server-only helper for the empty-dashboard setup panel.
 * Returns the first ingestion credential so the UI can pre-fill a real
 * copy-paste curl. Only call from authed server components — the token is
 * secret and must never be sent to unauthenticated clients.
 */
export function getFirstRunSetup(selectedProject?: string): FirstRunSetup {
  const config = getIngestionConfig();
  const projects = config.credentials.map((c) => c.projectName).filter((p): p is string => Boolean(p));
  const first = selectedProject
    ? config.credentials.find((c) => c.projectName === selectedProject)
      ?? config.credentials.find((c) => c.legacy)
    : config.credentials.find((c) => !c.legacy) ?? config.credentials[0];
  const origin = getCollectorOrigin();
  if (!first) {
    return { configured: config.configured, invalid: config.invalid, project: selectedProject ?? "", token: "", projects, origin };
  }
  return {
    configured: config.configured,
    invalid: config.invalid,
    project: first.projectName ?? selectedProject ?? "default",
    token: first.token,
    projects,
    origin,
  };
}
