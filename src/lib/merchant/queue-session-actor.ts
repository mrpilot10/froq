import { ROLE_LABELS } from "./roles";
import type { QueueSessionActor } from "./queue-session-storage";

/**
 * "Tanmay Kapse (Owner)" for display. Returns null for sessions started before
 * audit tracking existed so callers can hide the line entirely.
 */
export function startedByLabel(actor: QueueSessionActor | null | undefined): string | null {
  const name = actor?.startedByName?.trim();
  if (!name) return null;
  const role = actor?.startedByRole;
  return role ? `${name} (${ROLE_LABELS[role]})` : name;
}
