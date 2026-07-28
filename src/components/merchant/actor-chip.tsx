import { ROLE_LABELS } from "@/lib/merchant/roles";
import type { MemberRole } from "@/lib/merchant/types";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Avatar + name + role for the teammate behind an action. Renders nothing when
 * the record predates attribution, so callers can drop it in unconditionally.
 */
export function ActorChip({
  name,
  role,
  prefix = "By",
}: {
  name: string | null | undefined;
  role?: MemberRole | null;
  /** Screen-reader context, e.g. "Started by". Not shown visually. */
  prefix?: string;
}) {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const label = role ? `${trimmed} (${ROLE_LABELS[role]})` : trimmed;

  return (
    <span className="actor-chip" aria-label={`${prefix} ${label}`}>
      <span className="actor-chip-avatar" aria-hidden="true">
        {initials(trimmed)}
      </span>
      <span className="actor-chip-name">{trimmed}</span>
      {role ? <span className="actor-chip-role">{ROLE_LABELS[role]}</span> : null}
    </span>
  );
}
