import { chartBucketsForRange, DASHBOARD_RANGE_LABELS } from "./analytics";
import type {
  AnalyticsFunnelStage,
  AnalyticsInsight,
  DashboardChartBucket,
  DashboardDateRange,
  MemberRole,
} from "./types";

/** Minimal queue_entries shape the analytics math needs. */
export type QueueAnalyticsEntryRow = {
  id: string;
  session_id: string;
  party_size: number;
  kind: "walkin" | "reservation";
  status: "waiting" | "called" | "seated" | "left";
  joined_at: string;
  called_at: string | null;
  seated_at: string | null;
  left_at: string | null;
};

/** Minimal queue_sessions shape the analytics math needs. */
export type QueueAnalyticsSessionRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  started_by_user_id: string | null;
  started_by_name: string | null;
  started_by_role: MemberRole | null;
};

export interface QueueBusiestSlot {
  label: string;
  count: number;
}

/** One selectable teammate in the analytics staff filter. */
export interface QueueStaffOption {
  id: string;
  name: string;
  role: MemberRole | null;
}

/** Queue workload attributed to the teammate who started each session. */
export interface QueueStaffStat {
  key: string;
  name: string;
  role: MemberRole | null;
  sessions: number;
  parties: number;
  guests: number;
  seated: number;
  avgWaitMinutes: number;
}

export interface QueueAnalyticsStats {
  range: DashboardDateRange;
  rangeLabel: string;
  /** Parties that joined the queue in this range. */
  totalParties: number;
  /** Sum of party sizes across those parties. */
  totalGuests: number;
  seatedParties: number;
  leftParties: number;
  stillOpenParties: number;
  walkIns: number;
  reservations: number;
  sessionsRun: number;
  /** Seated ÷ joined, as a whole percentage. */
  seatRate: number;
  /** Left ÷ joined, as a whole percentage. */
  abandonRate: number;
  avgWaitMinutes: number;
  longestWaitMinutes: number;
  /** joined_at → called_at, for parties that were called. */
  avgTimeToCallMinutes: number;
  /** called_at → seated_at, for parties that were called then seated. */
  avgResponseMinutes: number;
  avgPartySize: number;
  largestPartySize: number;
  avgPartiesPerSession: number;
  busiestDay: QueueBusiestSlot | null;
  busiestHour: QueueBusiestSlot | null;
  /** Sorted by parties handled; sessions started before audit tracking group as "Unattributed". */
  staff: QueueStaffStat[];
  chartBuckets: DashboardChartBucket[];
  /** Sunday → Saturday join counts for the range. */
  dayBuckets: DashboardChartBucket[];
  /** Two-hour join buckets across the day. */
  hourBuckets: DashboardChartBucket[];
  /** Party-size distribution (1, 2, 3, 4, 5+). */
  partySizeBuckets: DashboardChartBucket[];
  chartTitle: string;
  chartSub: string;
  funnel: AnalyticsFunnelStage[];
  insights: AnalyticsInsight[];
  hasActivity: boolean;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function minutesBetween(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
  return (to - from) / 60_000;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function formatHourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${suffix}`;
}

function busiestSlot(
  entries: QueueAnalyticsEntryRow[],
  pick: (date: Date) => number,
  label: (key: number) => string,
): QueueBusiestSlot | null {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    const date = new Date(entry.joined_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = pick(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: QueueBusiestSlot | null = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count) best = { label: label(key), count };
  }
  return best;
}

function buildDayBuckets(entries: QueueAnalyticsEntryRow[]): DashboardChartBucket[] {
  const counts = Array.from({ length: 7 }, () => 0);
  for (const entry of entries) {
    const date = new Date(entry.joined_at);
    if (Number.isNaN(date.getTime())) continue;
    counts[date.getDay()] += 1;
  }
  // Monday-first for a more natural ops reading.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return order.map((day) => ({ label: short[day], value: counts[day] }));
}

function buildHourBuckets(entries: QueueAnalyticsEntryRow[]): DashboardChartBucket[] {
  const counts = Array.from({ length: 12 }, () => 0);
  for (const entry of entries) {
    const date = new Date(entry.joined_at);
    if (Number.isNaN(date.getTime())) continue;
    counts[Math.floor(date.getHours() / 2)] += 1;
  }
  return counts.map((value, index) => {
    const hour = index * 2;
    const suffix = hour >= 12 ? "p" : "a";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return { label: `${h12}${suffix}`, value };
  });
}

function buildPartySizeBuckets(entries: QueueAnalyticsEntryRow[]): DashboardChartBucket[] {
  const buckets = [
    { label: "1", value: 0 },
    { label: "2", value: 0 },
    { label: "3", value: 0 },
    { label: "4", value: 0 },
    { label: "5+", value: 0 },
  ];
  for (const entry of entries) {
    const size = Number(entry.party_size) || 0;
    if (size <= 1) buckets[0].value += 1;
    else if (size === 2) buckets[1].value += 1;
    else if (size === 3) buckets[2].value += 1;
    else if (size === 4) buckets[3].value += 1;
    else buckets[4].value += 1;
  }
  return buckets;
}

/** Bucket for sessions started before audit tracking, or by a removed teammate. */
export const QUEUE_UNATTRIBUTED = "__unattributed__";

const UNATTRIBUTED_KEY = QUEUE_UNATTRIBUTED;

/** Stable identity for a session's owner, shared by the roster and the stats rollup. */
function staffKeyFor(session: QueueAnalyticsSessionRow): string {
  return session.started_by_user_id ?? (session.started_by_name?.trim() || UNATTRIBUTED_KEY);
}

/**
 * Everyone who started at least one session in the fetched window, for the
 * filter dropdown. Built from unfiltered sessions so picking a teammate never
 * shrinks the list you picked from.
 */
export function queueStaffOptions(sessions: QueueAnalyticsSessionRow[]): QueueStaffOption[] {
  const options = new Map<string, QueueStaffOption>();
  for (const session of sessions) {
    const id = staffKeyFor(session);
    if (options.has(id)) continue;
    options.set(id, {
      id,
      name: session.started_by_name?.trim() || "Unattributed",
      role: session.started_by_role ?? null,
    });
  }
  return [...options.values()].sort((a, b) => {
    if (a.id === UNATTRIBUTED_KEY) return 1;
    if (b.id === UNATTRIBUTED_KEY) return -1;
    return a.name.localeCompare(b.name);
  });
}

/** Sessions started by one teammate, plus the entries that belong to them. */
export function filterQueueDataByStaff(
  entries: QueueAnalyticsEntryRow[],
  sessions: QueueAnalyticsSessionRow[],
  staffId: string,
): { entries: QueueAnalyticsEntryRow[]; sessions: QueueAnalyticsSessionRow[] } {
  const matched = sessions.filter((session) => staffKeyFor(session) === staffId);
  const ids = new Set(matched.map((session) => session.id));
  return { entries: entries.filter((entry) => ids.has(entry.session_id)), sessions: matched };
}

/**
 * Roll each session's entries up to whoever started that session. Sessions
 * created before audit tracking (or by a since-deleted teammate) collapse into
 * a single "Unattributed" row rather than being dropped.
 */
function buildStaffStats(
  entries: QueueAnalyticsEntryRow[],
  sessions: QueueAnalyticsSessionRow[],
): QueueStaffStat[] {
  type Bucket = Omit<QueueStaffStat, "avgWaitMinutes"> & { waits: number[] };
  const buckets = new Map<string, Bucket>();
  const sessionKey = new Map<string, string>();

  for (const session of sessions) {
    const key = staffKeyFor(session);
    sessionKey.set(session.id, key);
    const existing = buckets.get(key);
    if (existing) {
      existing.sessions += 1;
      continue;
    }
    buckets.set(key, {
      key,
      name: session.started_by_name?.trim() || "Unattributed",
      role: session.started_by_role ?? null,
      sessions: 1,
      parties: 0,
      guests: 0,
      seated: 0,
      waits: [],
    });
  }

  for (const entry of entries) {
    const key = sessionKey.get(entry.session_id);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.parties += 1;
    bucket.guests += Number(entry.party_size) || 0;
    if (entry.status === "seated") {
      bucket.seated += 1;
      const wait = minutesBetween(entry.joined_at, entry.seated_at);
      if (wait !== null) bucket.waits.push(wait);
    }
  }

  return [...buckets.values()]
    .map(({ waits, ...rest }) => ({ ...rest, avgWaitMinutes: average(waits) }))
    .sort((a, b) => b.parties - a.parties || b.sessions - a.sessions);
}

function buildFunnel(entries: QueueAnalyticsEntryRow[]): AnalyticsFunnelStage[] {
  const joined = entries.length;
  const called = entries.filter((e) => e.called_at != null).length;
  const seated = entries.filter((e) => e.status === "seated").length;

  const stages: { id: string; label: string; count: number }[] = [
    { id: "joined", label: "Joined the queue", count: joined },
    { id: "called", label: "Called to a table", count: called },
    { id: "seated", label: "Seated", count: seated },
  ];

  return stages.map((stage, index) => {
    const prev = index === 0 ? null : stages[index - 1].count;
    return {
      id: stage.id,
      label: stage.label,
      count: stage.count,
      conversionFromPrevious: prev === null ? null : pct(stage.count, prev),
    };
  });
}

function buildInsights(input: {
  stats: Omit<QueueAnalyticsStats, "insights">;
}): AnalyticsInsight[] {
  const s = input.stats;
  const insights: AnalyticsInsight[] = [];

  if (s.busiestDay) {
    insights.push({
      id: "busy-day",
      text: `${s.busiestDay.label} is your busiest queue day with ${s.busiestDay.count} ${
        s.busiestDay.count === 1 ? "party" : "parties"
      }.`,
    });
  }

  if (s.busiestHour) {
    insights.push({
      id: "busy-hour",
      text: `Most guests join around ${s.busiestHour.label}.`,
    });
  }

  if (s.avgWaitMinutes > 0) {
    insights.push({
      id: "avg-wait",
      text: `Guests wait ${s.avgWaitMinutes} min on average before being seated.`,
    });
  }

  if (s.leftParties > 0) {
    insights.push({
      id: "abandon",
      text: `${s.leftParties} ${s.leftParties === 1 ? "party" : "parties"} left without being seated (${s.abandonRate}% of joins).`,
    });
  }

  if (s.avgResponseMinutes > 0) {
    insights.push({
      id: "response",
      text: `Called guests reach their table in ${s.avgResponseMinutes} min on average.`,
    });
  }

  if (s.reservations > 0) {
    insights.push({
      id: "mix",
      text: `${pct(s.reservations, s.totalParties)}% of parties came in as reservations.`,
    });
  }

  const topStaff = s.staff.find((member) => member.key !== UNATTRIBUTED_KEY);
  if (topStaff && s.staff.length > 1) {
    insights.push({
      id: "top-staff",
      text: `${topStaff.name} ran the most queue volume — ${topStaff.sessions} ${
        topStaff.sessions === 1 ? "session" : "sessions"
      } and ${topStaff.parties} ${topStaff.parties === 1 ? "party" : "parties"}.`,
    });
  }

  return insights.slice(0, 6);
}

export function computeQueueAnalytics(input: {
  range: DashboardDateRange;
  entries: QueueAnalyticsEntryRow[];
  sessions: QueueAnalyticsSessionRow[];
}): QueueAnalyticsStats {
  const { range, entries, sessions } = input;

  const totalParties = entries.length;
  const totalGuests = entries.reduce((sum, e) => sum + (Number(e.party_size) || 0), 0);
  const seated = entries.filter((e) => e.status === "seated");
  const left = entries.filter((e) => e.status === "left");
  const stillOpen = entries.filter((e) => e.status === "waiting" || e.status === "called");

  const waitMinutes = seated
    .map((e) => minutesBetween(e.joined_at, e.seated_at))
    .filter((v): v is number => v !== null);
  const timeToCall = entries
    .map((e) => minutesBetween(e.joined_at, e.called_at))
    .filter((v): v is number => v !== null);
  const responseMinutes = seated
    .map((e) => minutesBetween(e.called_at, e.seated_at))
    .filter((v): v is number => v !== null);

  const partySizes = entries.map((e) => Number(e.party_size) || 0);

  const chartAxis = chartBucketsForRange(
    range,
    entries.map((e) => ({ created_at: e.joined_at })),
  );

  const base: Omit<QueueAnalyticsStats, "insights"> = {
    range,
    rangeLabel: DASHBOARD_RANGE_LABELS[range],
    totalParties,
    totalGuests,
    seatedParties: seated.length,
    leftParties: left.length,
    stillOpenParties: stillOpen.length,
    walkIns: entries.filter((e) => e.kind === "walkin").length,
    reservations: entries.filter((e) => e.kind === "reservation").length,
    sessionsRun: sessions.length,
    seatRate: pct(seated.length, totalParties),
    abandonRate: pct(left.length, totalParties),
    avgWaitMinutes: average(waitMinutes),
    longestWaitMinutes: waitMinutes.length > 0 ? Math.round(Math.max(...waitMinutes)) : 0,
    avgTimeToCallMinutes: average(timeToCall),
    avgResponseMinutes: average(responseMinutes),
    avgPartySize:
      totalParties > 0 ? Math.round((totalGuests / totalParties) * 10) / 10 : 0,
    largestPartySize: partySizes.length > 0 ? Math.max(...partySizes) : 0,
    avgPartiesPerSession:
      sessions.length > 0 ? Math.round((totalParties / sessions.length) * 10) / 10 : 0,
    busiestDay: busiestSlot(entries, (d) => d.getDay(), (key) => DAY_NAMES[key]),
    busiestHour: busiestSlot(entries, (d) => d.getHours(), formatHourLabel),
    staff: buildStaffStats(entries, sessions),
    chartBuckets: chartAxis.buckets,
    dayBuckets: buildDayBuckets(entries),
    hourBuckets: buildHourBuckets(entries),
    partySizeBuckets: buildPartySizeBuckets(entries),
    chartTitle: "Queue joins",
    chartSub: queueChartSub(range),
    funnel: buildFunnel(entries),
    hasActivity: totalParties > 0,
  };

  return { ...base, insights: buildInsights({ stats: base }) };
}

function queueChartSub(range: DashboardDateRange): string {
  if (range === "today") return "Parties joined by time of day";
  if (range === "7d") return "Parties joined per day";
  if (range === "30d") return "Parties joined per week";
  if (range === "12m") return "Parties joined per month";
  return "Parties joined over the last year";
}
