/** Shared reservation domain helpers used by the merchant screens, the public
 *  request form, the server actions and the reminder cron. */

import type { ReservationStatus } from "@/lib/supabase/database.types";
import type { MemberRole } from "./types";
import { ROLE_LABELS } from "./roles";
import {
  formatTimeForInput,
  minutesFromMidnight,
  normalizeTimeInput,
  QUEUE_HOURS_TIMEZONE,
  getZonedClock,
} from "./queue-hours";

export type { ReservationStatus };

/** Reservations run on the same fixed store timezone as the queue (IST). */
export const RESERVATION_TIMEZONE = QUEUE_HOURS_TIMEZONE;

/** IST has no DST, so a fixed offset keeps date maths exact on the server. */
const RESERVATION_UTC_OFFSET = "+05:30";

export interface Reservation {
  id: string;
  branchId: string | null;
  number: number;
  /** Permanent `rsv_…` token behind the guest's reservation page. */
  publicToken: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  customerWhatsapp: string | null;
  partySize: number;
  /** YYYY-MM-DD store-local. */
  date: string;
  /** HH:MM store-local. */
  time: string;
  status: ReservationStatus;
  /** Assigned dining table number when set. */
  tableNumber: number | null;
  diningTableId: string | null;
  notes: string;
  merchantNotes: string;
  declineReason: string;
  suggestedAtMs: number | null;
  /** Slot the merchant proposed, awaiting the guest's answer. */
  suggestedDate: string | null;
  suggestedTime: string | null;
  suggestionAcceptedAtMs: number | null;
  confirmedAtMs: number | null;
  declinedAtMs: number | null;
  cancelledAtMs: number | null;
  cancelledBy: "merchant" | "customer" | null;
  completedAtMs: number | null;
  noShowAtMs: number | null;
  reminderSentAtMs: number | null;
  /**
   * Last message that failed to reach the guest, cleared by the next successful
   * send. Present means this guest still hasn't been told.
   */
  notifyFailure: { template: string; reason: string; atMs: number | null } | null;
  createdAtMs: number;
}

/** True while a proposed time is still waiting on the guest. */
export function hasOpenSuggestion(reservation: Reservation): boolean {
  return (
    reservation.status === "pending" &&
    reservation.suggestedDate != null &&
    reservation.suggestedTime != null &&
    reservation.suggestionAcceptedAtMs == null
  );
}

export interface ReservationStats {
  today: number;
  pending: number;
  confirmed: number;
  completed: number;
  noShows: number;
}

interface StatusMeta {
  label: string;
  /** Badge colour modifier — see `.merchant-badge--*` in globals.css. */
  cls: string;
}

export const RESERVATION_STATUS_META: Record<ReservationStatus, StatusMeta> = {
  pending: { label: "Pending", cls: "pending" },
  confirmed: { label: "Confirmed", cls: "confirmed" },
  completed: { label: "Completed", cls: "completed" },
  cancelled: { label: "Cancelled", cls: "cancelled" },
  declined: { label: "Declined", cls: "declined" },
  no_show: { label: "No show", cls: "no-show" },
};

/** What the guest missed, per template — provider codes stay in the log. */
const NOTIFY_FAILURE_SUBJECTS: Record<string, string> = {
  reservation_request_received: "booking request confirmation",
  reservation_confirmed: "confirmation",
  reservation_declined: "decline notice",
  reservation_updated: "new time proposal",
  reservation_reminder: "reminder",
};

/**
 * Merchant-facing wording for a message that never arrived, so the fix is
 * obvious: ring the guest.
 */
export function notifyFailureText(
  failure: NonNullable<Reservation["notifyFailure"]>,
): { chip: string; detail: string } {
  const subject = NOTIFY_FAILURE_SUBJECTS[failure.template] ?? "message";
  if (failure.reason === "no_customer") {
    return {
      chip: "No contact",
      detail: `We have no reachable number for this guest, so the ${subject} wasn't sent.`,
    };
  }
  return {
    chip: "Not notified",
    detail: `The ${subject} didn't reach this guest. Give them a call to be safe.`,
  };
}

export const RESERVATION_STATUSES: ReservationStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "declined",
  "no_show",
];

export type ReservationDateFilter = "today" | "tomorrow" | "week" | "all";

export const RESERVATION_DATE_FILTERS: Array<{
  id: ReservationDateFilter;
  label: string;
}> = [
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This week" },
  { id: "all", label: "All" },
];

// ── Settings ────────────────────────────────────────────────────────────────

export interface ReservationSettings {
  /** Short line shown above the public form. */
  description: string;
  maxPartySize: number;
  /** Minutes between bookable slots. */
  intervalMinutes: number;
  openTime: string;
  closeTime: string;
  allowSameDay: boolean;
  allowNotes: boolean;
  /** 0 = never auto decline pending requests. */
  autoDeclineHours: number;
  whatsappEnabled: boolean;
  /** Minutes after reservation time before held queue slot → no-show. */
  graceMinutes: number;
  /** Assign best free table automatically on confirm. */
  autoAssignTables: boolean;
}

export const DEFAULT_RESERVATION_SETTINGS: ReservationSettings = {
  description: "",
  maxPartySize: 12,
  intervalMinutes: 30,
  openTime: "11:00",
  closeTime: "22:00",
  allowSameDay: true,
  allowNotes: true,
  autoDeclineHours: 0,
  whatsappEnabled: true,
  graceMinutes: 15,
  autoAssignTables: true,
};

export const RESERVATION_INTERVAL_OPTIONS = [15, 30, 45, 60];
export const RESERVATION_PARTY_SIZE_OPTIONS = [4, 6, 8, 10, 12, 16, 20];
export const RESERVATION_AUTO_DECLINE_OPTIONS = [0, 2, 4, 6, 12, 24];
export const RESERVATION_GRACE_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60];

export function reservationSettingsFromProfile(profile: {
  reservationDescription?: string;
  reservationMaxPartySize?: number;
  reservationIntervalMinutes?: number;
  reservationOpenTime?: string;
  reservationCloseTime?: string;
  /** Branch store timings — preferred seating window when present. */
  queueOpenTime?: string;
  queueCloseTime?: string;
  reservationAllowSameDay?: boolean;
  reservationAllowNotes?: boolean;
  reservationAutoDeclineHours?: number;
  reservationWhatsappEnabled?: boolean;
  reservationGraceMinutes?: number;
  reservationAutoAssignTables?: boolean;
}): ReservationSettings {
  const d = DEFAULT_RESERVATION_SETTINGS;
  return {
    description: profile.reservationDescription ?? d.description,
    maxPartySize: profile.reservationMaxPartySize ?? d.maxPartySize,
    intervalMinutes: profile.reservationIntervalMinutes ?? d.intervalMinutes,
    // Seating window comes from Business settings → Branch store timings.
    openTime: profile.queueOpenTime ?? profile.reservationOpenTime ?? d.openTime,
    closeTime: profile.queueCloseTime ?? profile.reservationCloseTime ?? d.closeTime,
    allowSameDay: profile.reservationAllowSameDay ?? d.allowSameDay,
    allowNotes: profile.reservationAllowNotes ?? d.allowNotes,
    autoDeclineHours: profile.reservationAutoDeclineHours ?? d.autoDeclineHours,
    whatsappEnabled: profile.reservationWhatsappEnabled ?? d.whatsappEnabled,
    graceMinutes: profile.reservationGraceMinutes ?? d.graceMinutes,
    autoAssignTables: profile.reservationAutoAssignTables ?? d.autoAssignTables,
  };
}

export function validateReservationSettings(settings: ReservationSettings): string | null {
  if (!normalizeTimeInput(settings.openTime)) return "Enter a valid opening time.";
  if (!normalizeTimeInput(settings.closeTime)) return "Enter a valid closing time.";
  if (settings.openTime === settings.closeTime) {
    return "Opening and closing times must be different.";
  }
  if (settings.maxPartySize < 1 || settings.maxPartySize > 50) {
    return "Maximum party size must be between 1 and 50.";
  }
  if (!RESERVATION_INTERVAL_OPTIONS.includes(settings.intervalMinutes)) {
    return "Pick a reservation interval.";
  }
  return null;
}

export function formatSettingsSummary(settings: ReservationSettings): string {
  return `Every ${settings.intervalMinutes} min · up to ${settings.maxPartySize} guests`;
}

/**
 * Bookable slots between open and close, inclusive of open and exclusive of
 * close. Supports overnight windows (e.g. 18:00–01:00).
 */
export function buildReservationSlots(settings: {
  openTime: string;
  closeTime: string;
  intervalMinutes: number;
}): string[] {
  const step = Math.max(5, Math.floor(settings.intervalMinutes) || 30);
  const open = minutesFromMidnight(formatTimeForInput(settings.openTime));
  const rawClose = minutesFromMidnight(formatTimeForInput(settings.closeTime));
  const close = rawClose > open ? rawClose : rawClose + 24 * 60;

  const slots: string[] = [];
  for (let minute = open; minute < close; minute += step) {
    const normalized = minute % (24 * 60);
    const hh = String(Math.floor(normalized / 60)).padStart(2, "0");
    const mm = String(normalized % 60).padStart(2, "0");
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

// ── Booking window ──────────────────────────────────────────────────────────

const MINUTES_PER_DAY = 24 * 60;

export interface ReservationWindowStatus {
  /** True while guests can pick a slot right now. */
  open: boolean;
  /** Seconds until the window closes (when open) or reopens (when closed). */
  secondsLeft: number;
}

/**
 * Where the store clock sits inside today's booking window. Handles overnight
 * windows (e.g. 18:00–01:00), where the small hours still belong to the
 * previous day's window.
 */
export function reservationWindowStatus(
  settings: Pick<ReservationSettings, "openTime" | "closeTime">,
  now = new Date(),
): ReservationWindowStatus {
  const clock = getZonedClock(RESERVATION_TIMEZONE, now);
  const openMin = minutesFromMidnight(formatTimeForInput(settings.openTime));
  const rawClose = minutesFromMidnight(formatTimeForInput(settings.closeTime));
  const overnight = rawClose <= openMin;
  const closeMin = overnight ? rawClose + MINUTES_PER_DAY : rawClose;
  const minutes =
    overnight && clock.minutes < rawClose ? clock.minutes + MINUTES_PER_DAY : clock.minutes;

  const open = minutes >= openMin && minutes < closeMin;
  const target = open
    ? closeMin
    : minutes < openMin
      ? openMin
      : openMin + MINUTES_PER_DAY;

  // getZonedClock floors to the minute; seconds are the same in every zone, so
  // they finish the current minute off.
  const secondsLeft = (target - minutes) * 60 - now.getSeconds();
  return { open, secondsLeft: Math.max(0, secondsLeft) };
}

/** "4h 12m" far out, "12m 30s" in the last hour — a countdown that feels live. */
export function formatWindowCountdown(secondsLeft: number): string {
  const total = Math.max(0, Math.floor(secondsLeft));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ── Dates & times ───────────────────────────────────────────────────────────

/** Today's YYYY-MM-DD in the store timezone. */
export function reservationToday(now = new Date()): string {
  return getZonedClock(RESERVATION_TIMEZONE, now).dateKey;
}

export function addDays(dateKey: string, days: number): string {
  const ms = Date.parse(`${dateKey}T00:00:00${RESERVATION_UTC_OFFSET}`);
  const next = new Date(ms + days * 86_400_000);
  return getZonedClock(RESERVATION_TIMEZONE, next).dateKey;
}

/** Epoch ms for a store-local date + time. */
export function reservationStartMs(dateKey: string, time: string): number {
  return Date.parse(
    `${dateKey}T${formatTimeForInput(time)}:00${RESERVATION_UTC_OFFSET}`,
  );
}

/** "7:30 pm" — matches the lowercase meridiem used across Froq. */
export function formatTimeLabel(time: string): string {
  const hhmm = formatTimeForInput(time);
  const [hourRaw, minute] = hhmm.split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minute} ${suffix}`;
}

/**
 * The same clock reading split for display, so a list row can stack "7:30" over
 * "pm" and keep the hour big enough to scan down a column.
 */
export function splitTimeLabel(time: string): { value: string; suffix: string } {
  const [value, suffix] = formatTimeLabel(time).split(" ");
  return { value, suffix };
}

/** "Today", "Tomorrow" or "Sat, 8 Aug". */
export function formatDateLabel(dateKey: string, now = new Date()): string {
  const today = reservationToday(now);
  if (dateKey === today) return "Today";
  if (dateKey === addDays(today, 1)) return "Tomorrow";
  if (dateKey === addDays(today, -1)) return "Yesterday";
  return new Date(`${dateKey}T00:00:00${RESERVATION_UTC_OFFSET}`).toLocaleDateString(
    "en-GB",
    {
      timeZone: RESERVATION_TIMEZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
    },
  );
}

/** "Today · 7:30 pm" for drawers and WhatsApp copy. */
export function formatReservationWhen(dateKey: string, time: string): string {
  return `${formatDateLabel(dateKey)} · ${formatTimeLabel(time)}`;
}

/** Absolute date + time for SMS / in-app copy (no relative wording). */
export function formatReservationWhenAbsolute(dateKey: string, time: string): string {
  return `${formatReservationDateForWhatsApp(dateKey)} at ${formatReservationTimeForWhatsApp(time)}`;
}

/**
 * Meta body {{3}} for reservation templates — matches the approved sample
 * ("15 Aug 2026"). Kept absolute so a "Today" relative never lands in WhatsApp.
 */
export function formatReservationDateForWhatsApp(dateKey: string): string {
  return new Date(
    `${dateKey}T00:00:00${RESERVATION_UTC_OFFSET}`,
  ).toLocaleDateString("en-GB", {
    timeZone: RESERVATION_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Meta body {{4}} — "7:30 PM", matching the approved sample's casing. */
export function formatReservationTimeForWhatsApp(time: string): string {
  return formatTimeLabel(time).replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

/** "2 min ago" / "3 h ago" / "12 Aug" — used by the Created column. */
export function formatRelativeTime(atMs: number, now = Date.now()): string {
  const diff = Math.max(0, now - atMs);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(atMs).toLocaleDateString("en-GB", {
    timeZone: RESERVATION_TIMEZONE,
    day: "numeric",
    month: "short",
  });
}

export function formatReservationNumber(value: number): string {
  return `#${String(value).padStart(4, "0")}`;
}

export function isOpenReservation(status: ReservationStatus): boolean {
  return status === "pending" || status === "confirmed";
}

// ── Actions ─────────────────────────────────────────────────────────────────

export type ReservationActionId =
  | "confirm"
  | "decline"
  | "suggest"
  | "complete"
  | "cancel"
  | "no_show";

export const RESERVATION_ACTION_LABELS: Record<ReservationActionId, string> = {
  confirm: "Confirm",
  decline: "Decline",
  suggest: "Suggest another time",
  complete: "Mark arrived",
  cancel: "Cancel",
  no_show: "No show",
};

/**
 * Tighter labels for the list rows, where several actions share one line. The
 * drawer keeps the fuller wording above.
 */
export const RESERVATION_ROW_ACTION_LABELS: Record<ReservationActionId, string> = {
  confirm: "Confirm",
  decline: "Decline",
  suggest: "New time",
  complete: "Arrived",
  cancel: "Cancel",
  no_show: "No show",
};

/** Actions offered on a row for a status. */
export function rowActionsFor(status: ReservationStatus): ReservationActionId[] {
  if (status === "pending") return ["confirm", "decline", "suggest"];
  if (status === "confirmed") return ["complete", "cancel"];
  return [];
}

/** The drawer adds the rarer outcomes the row deliberately leaves out. */
export function drawerActionsFor(status: ReservationStatus): ReservationActionId[] {
  if (status === "confirmed") return ["complete", "cancel", "no_show", "suggest"];
  return rowActionsFor(status);
}

// ── Audit trail ─────────────────────────────────────────────────────────────

/** Actions worth attributing. Note edits are left out to keep the trail readable. */
export type ReservationEventName =
  | "created"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "completed"
  | "no_show"
  | "suggested"
  | "suggestion_accepted"
  | "rescheduled";

/** One attributed action on a booking, as shown in the merchant drawer. */
export interface ReservationEvent {
  id: string;
  event: ReservationEventName;
  actorKind: "staff" | "guest" | "system";
  /** Snapshot from when it happened; null for guest and system actions. */
  actorName: string | null;
  actorRole: MemberRole | null;
  detail: string | null;
  atMs: number;
}

/** Which timeline step each trail entry belongs to. */
const EVENT_TO_TIMELINE_STEP: Record<ReservationEventName, string> = {
  created: "created",
  confirmed: "confirmed",
  declined: "declined",
  cancelled: "cancelled",
  completed: "completed",
  no_show: "no_show",
  suggested: "suggested",
  suggestion_accepted: "suggestion-answer",
  // Guest/merchant slot changes stay on the booking — no separate timeline step.
  rescheduled: "confirmed",
};

export interface TimelineActor {
  name: string;
  role: MemberRole | null;
  kind: "staff" | "guest" | "system";
}

/**
 * Index a booking's trail by timeline step so each step can name who did it.
 * The latest entry wins when an action repeats (a booking can be confirmed,
 * rescheduled, then confirmed again).
 */
export function timelineActors(
  events: ReservationEvent[],
): Record<string, TimelineActor> {
  const actors: Record<string, TimelineActor> = {};
  for (const entry of events) {
    const step = EVENT_TO_TIMELINE_STEP[entry.event];
    if (!step) continue;
    const name =
      entry.actorKind === "staff"
        ? entry.actorName?.trim() || "A teammate"
        : entry.actorKind === "guest"
          ? "the guest"
          : "Froq";
    actors[step] = { name, role: entry.actorRole, kind: entry.actorKind };
  }
  return actors;
}

/** "by Tanmay Kapse (Owner)" / "by the guest" — for timeline steps. */
export function timelineActorLabel(actor: TimelineActor | undefined): string | null {
  if (!actor) return null;
  if (actor.kind === "guest") return "by the guest";
  if (actor.kind === "system") return "by Froq";
  const role = actor.role ? ` (${ROLE_LABELS[actor.role]})` : "";
  return `by ${actor.name}${role}`;
}

// ── Timeline ────────────────────────────────────────────────────────────────

export interface ReservationTimelineStep {
  id: string;
  label: string;
  atMs: number | null;
  /** Reached steps are filled in; the rest are shown greyed out. */
  done: boolean;
}

/** The timestamps a timeline is built from — merchant drawer or guest page. */
export type ReservationTimelineSource = Pick<
  Reservation,
  | "status"
  | "createdAtMs"
  | "suggestedAtMs"
  | "suggestionAcceptedAtMs"
  | "confirmedAtMs"
  | "declinedAtMs"
  | "cancelledAtMs"
  | "cancelledBy"
  | "completedAtMs"
  | "noShowAtMs"
  | "reminderSentAtMs"
>;

/**
 * Timeline shared by the merchant drawer and the guest's reservation page.
 * Steps that can't apply to this booking are dropped, so a declined request
 * doesn't show an empty "Completed" row.
 */
export function buildReservationTimeline(
  reservation: ReservationTimelineSource,
): ReservationTimelineStep[] {
  const steps: ReservationTimelineStep[] = [
    {
      id: "created",
      label: "Reservation created",
      atMs: reservation.createdAtMs,
      done: true,
    },
  ];

  if (reservation.suggestedAtMs) {
    steps.push({
      id: "suggested",
      label: "New time proposed",
      atMs: reservation.suggestedAtMs,
      done: true,
    });
    steps.push({
      id: "suggestion-answer",
      label: reservation.suggestionAcceptedAtMs
        ? "Guest accepted the new time"
        : "Waiting on the guest",
      atMs: reservation.suggestionAcceptedAtMs,
      done: reservation.suggestionAcceptedAtMs != null,
    });
  }

  if (reservation.status === "declined") {
    steps.push({
      id: "declined",
      label: "Declined",
      atMs: reservation.declinedAtMs,
      done: true,
    });
    return steps;
  }

  if (reservation.status === "cancelled") {
    steps.push({
      id: "cancelled",
      label:
        reservation.cancelledBy === "customer"
          ? "Cancelled by the guest"
          : "Cancelled",
      atMs: reservation.cancelledAtMs,
      done: true,
    });
    return steps;
  }

  steps.push({
    id: "confirmed",
    label: "Confirmed",
    atMs: reservation.confirmedAtMs,
    done: reservation.confirmedAtMs != null,
  });
  steps.push({
    id: "reminder",
    label: "Reminder sent",
    atMs: reservation.reminderSentAtMs,
    done: reservation.reminderSentAtMs != null,
  });
  steps.push({
    id: "attendance",
    label: "Guest confirmed attendance",
    atMs: null,
    done: false,
  });

  if (reservation.status === "no_show") {
    steps.push({
      id: "no_show",
      label: "No show",
      atMs: reservation.noShowAtMs,
      done: true,
    });
    return steps;
  }

  steps.push({
    id: "completed",
    label: "Completed",
    atMs: reservation.completedAtMs,
    done: reservation.completedAtMs != null,
  });
  return steps;
}
