export type RewardCooldownUnit = "hours" | "days" | "weeks";

export const REWARD_COOLDOWN_UNITS: { value: RewardCooldownUnit; label: string }[] = [
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
];

/** Human label for merchant settings / onboarding summaries. */
export function formatRewardCooldown(value: number, unit: RewardCooldownUnit): string {
  if (!value || value <= 0) return "No wait";
  const singular = unit.slice(0, -1);
  return `${value} ${value === 1 ? singular : unit}`;
}

/** Relative unlock copy for an active cooldown. */
export function cooldownUnlockCopy(cooldownUntilIso: string | null | undefined): string | null {
  if (!cooldownUntilIso) return null;
  const until = new Date(cooldownUntilIso).getTime();
  if (!Number.isFinite(until) || until <= Date.now()) return null;
  const clock = formatCooldownClock(cooldownUntilIso);
  if (!clock) return null;
  return `Unlocks in ${clock}`;
}

/** Remaining wait as `Hh Mm` (or `Mm` / `Ss` when short). */
export function formatCooldownClock(cooldownUntilIso: string | null | undefined): string | null {
  if (!cooldownUntilIso) return null;
  const until = new Date(cooldownUntilIso).getTime();
  if (!Number.isFinite(until)) return null;
  const ms = until - Date.now();
  if (ms <= 0) return null;
  const totalSec = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function isCooldownActive(cooldownUntilIso: string | null | undefined): boolean {
  if (!cooldownUntilIso) return false;
  const until = new Date(cooldownUntilIso).getTime();
  return Number.isFinite(until) && until > Date.now();
}
