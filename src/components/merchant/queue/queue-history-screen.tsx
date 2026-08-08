"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clock3,
  History,
  Radio,
  Ticket,
  Users,
} from "lucide-react";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { ActorChip } from "@/components/merchant/actor-chip";
import { waitSegments } from "@/lib/queue/format";
import { joinUrlFor } from "@/components/merchant/use-merchant-qr";
import { basePlanId } from "@/lib/merchant/pricing";
import { QUEUE_TRIAL_LIMITS, queuePlanLimits } from "@/lib/merchant/plan-limits";
import {
  planBranchUsage,
  planUpgradeSummary,
} from "@/lib/merchant/plan-summary";
import { isTrialActive } from "@/lib/merchant/entitlements";
import {
  countQueueTicketsUsedInWindow,
  ensureQueueDataEpoch,
  loadQueueHistoryView,
  queueUsageWindowStartMs,
  removeQueueSessionRecord,
  type QueueSessionActor,
  type QueueSessionRecord,
} from "@/lib/merchant/queue-session-storage";
import { QueueHistorySkeleton } from "./queue-skeletons";
import { QueueSessionHistorySheet } from "./queue-session-history-sheet";

type RangeKey = "all" | "7d" | "30d" | "6m";
type SortKey = "newest" | "oldest" | "served" | "wait";

const DAY_MS = 86_400_000;

const RANGES: { id: RangeKey; label: string; days: number | null }[] = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "6m", label: "6 months", days: 183 },
  { id: "all", label: "All time", days: null },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "served", label: "Most served" },
  { id: "wait", label: "Longest wait" },
];

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function StartedBy({ actor }: { actor: QueueSessionActor }) {
  return (
    <ActorChip name={actor.startedByName} role={actor.startedByRole} prefix="Started by" />
  );
}

export function QueueHistoryScreen() {
  const router = useRouter();
  const { profile, activeBranchId, branches, entitlements, role } =
    useMerchantWorkspace();
  const [range, setRange] = useState<RangeKey>("7d");
  const [sort, setSort] = useState<SortKey>("newest");
  const [now, setNow] = useState(() => Date.now());
  const [allSessions, setAllSessions] = useState<QueueSessionRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [selectedSession, setSelectedSession] = useState<QueueSessionRecord | null>(null);
  const [live, setLive] = useState<
    | (QueueSessionActor & {
        number: number;
        startedAtMs: number;
        state: "live" | "paused";
      })
    | null
  >(null);

  const queueUrl = useMemo(() => joinUrlFor(profile, "queue"), [profile]);

  const refresh = useCallback(() => {
    const view = loadQueueHistoryView(queueUrl, activeBranchId);
    setAllSessions(view.sessions);
    setLive(view.live);
    setNow(Date.now());
    setHydrated(true);
  }, [queueUrl, activeBranchId]);

  // The server row is already gone; drop the local archive so the session
  // stops counting toward the plan's ticket meter, which reads local history.
  const handleSessionDeleted = useCallback(
    (deleted: QueueSessionRecord) => {
      removeQueueSessionRecord(queueUrl, activeBranchId, deleted);
      setSelectedSession(null);
      refresh();
    },
    [queueUrl, activeBranchId, refresh],
  );

  useEffect(() => {
    ensureQueueDataEpoch();
    refresh();
    const onHistory = () => refresh();
    const onStorage = (event: StorageEvent) => {
      if (!event.key) return;
      if (
        event.key.startsWith("froq.queue.history:") ||
        event.key.startsWith("froq.queue.session:")
      ) {
        refresh();
      }
    };
    window.addEventListener("froq:queue-history", onHistory);
    window.addEventListener("focus", onHistory);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("froq:queue-history", onHistory);
      window.removeEventListener("focus", onHistory);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const sessions = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)?.days ?? null;
    const cutoff = days === null ? 0 : now - days * DAY_MS;
    const filtered = allSessions.filter((s) => s.endedAtMs >= cutoff);
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.endedAtMs - b.endedAtMs;
        case "served":
          return b.served - a.served;
        case "wait":
          return b.longestWait - a.longestWait;
        default:
          return b.endedAtMs - a.endedAtMs;
      }
    });
    return sorted;
  }, [allSessions, range, sort, now]);

  const totals = useMemo(() => {
    if (sessions.length === 0) {
      return { sessions: 0, served: 0, avgWait: 0 };
    }
    const served = sessions.reduce((sum, s) => sum + s.served, 0);
    const avgWait = Math.round(
      sessions.reduce((sum, s) => sum + s.avgWait, 0) / sessions.length,
    );
    return { sessions: sessions.length, served, avgWait };
  }, [sessions]);

  const trialing = isTrialActive(entitlements.queue);
  const ticketCap = trialing
    ? QUEUE_TRIAL_LIMITS.maxTicketsPerTrial
    : queuePlanLimits(entitlements.queue?.planId).maxTicketsPerMonth;
  // Plan meter is merchant-wide (all branches). Session list below stays branch-scoped.
  const ticketsUsed = useMemo(() => {
    const windowStart = queueUsageWindowStartMs({
      now,
      onTrial: trialing,
      trialStartedAt: entitlements.queue?.trialStartedAt,
    });
    return countQueueTicketsUsedInWindow(
      queueUrl,
      branches.map((b) => b.id),
      windowStart,
    );
  }, [
    queueUrl,
    branches,
    now,
    trialing,
    entitlements.queue?.trialStartedAt,
  ]);
  const ticketPercent =
    ticketCap > 0 ? Math.min(100, Math.round((ticketsUsed / ticketCap) * 100)) : 0;
  const ticketUrgency = ticketPercent >= 80 ? "high" : ticketPercent >= 50 ? "mid" : "low";
  const ticketsLeft = Math.max(0, ticketCap - ticketsUsed);
  const ticketHelper =
    ticketUrgency === "high"
      ? ticketsLeft > 0
        ? `Only ${ticketsLeft.toLocaleString("en-IN")} ${
            ticketsLeft === 1 ? "ticket" : "tickets"
          } left`
        : "You're close to your plan limit"
      : null;
  const branchSnap = planBranchUsage({
    product: "queue",
    planId: entitlements.queue?.planId,
    branchesUsed: branches.length,
    onTrial: trialing,
  });
  const planSummary = planUpgradeSummary({
    product: "queue",
    planId: entitlements.queue?.planId,
  });
  const canUpgrade =
    role === "owner" &&
    Boolean(planSummary.nextPlan) &&
    (trialing || basePlanId(entitlements.queue?.planId ?? "") !== "queue-pro");
  // Sessions are read from localStorage on mount; without this the empty state
  // flashes before an existing history renders.
  if (!hydrated) return <QueueHistorySkeleton />;

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">History</h2>
        <p className="tab-sub">Archived queue sessions from this branch, with wait times and outcomes</p>
      </div>

      {live && (
        <div className="panel-card qhist-live-card">
          <div className="qhist-card-head">
            <div className="qhist-card-copy">
              <div className="qhist-card-title">
                Session #{live.number}
                <span
                  className={`queue-state-badge queue-state-badge--${
                    live.state === "live" ? "live" : "paused"
                  }`}
                >
                  <span className="queue-state-dot" aria-hidden="true" />
                  {live.state === "live" ? "Live now" : "Paused"}
                </span>
              </div>
              <div className="qhist-card-meta">
                <span className="qhist-card-sub">
                  Started {formatDate(live.startedAtMs)} · {formatClock(live.startedAtMs)}
                </span>
                <StartedBy actor={live} />
              </div>
            </div>
            <span className="qhist-served-pill qhist-served-pill--live">
              <Radio size={13} strokeWidth={2.4} />
              In progress
            </span>
          </div>
        </div>
      )}

      <div className="qhist-summary">
        <div className="qhist-summary-stat">
          <span className="qhist-summary-icon">
            <CalendarClock size={17} strokeWidth={2.3} />
          </span>
          <div className="qhist-summary-copy">
            <span className="qhist-summary-value">{totals.sessions}</span>
            <span className="qhist-summary-label">Sessions</span>
          </div>
        </div>
        <div className="qhist-summary-stat">
          <span className="qhist-summary-icon">
            <Users size={17} strokeWidth={2.3} />
          </span>
          <div className="qhist-summary-copy">
            <span className="qhist-summary-value">{totals.served}</span>
            <span className="qhist-summary-label">Guests served</span>
          </div>
        </div>
        <div className="qhist-summary-stat">
          <span className="qhist-summary-icon">
            <Clock3 size={17} strokeWidth={2.3} />
          </span>
          <div className="qhist-summary-copy">
            <span className="qhist-summary-value">
              {waitSegments(totals.avgWait).map((part) => (
                <Fragment key={part.unit}>
                  {part.value}
                  <span className="qhist-summary-unit">{part.unit}</span>
                </Fragment>
              ))}
            </span>
            <span className="qhist-summary-label">Avg wait</span>
          </div>
        </div>
      </div>

      <div className="qhist-quota-card">
        <div className="qhist-quota-top">
          <span className="qhist-summary-icon" aria-hidden="true">
            <Ticket size={17} strokeWidth={2.3} />
          </span>
          <div className="qhist-quota-body">
            {branchSnap ? (
              <p
                className={`qhist-quota-branch${
                  branchSnap.urgency === "high" ? " is-warn" : ""
                }`}
              >
                {branchSnap.label}
              </p>
            ) : null}

            <div
              className={`qhist-quota-meter${
                ticketUrgency === "high" ? " is-warn" : ""
              }`}
            >
              <div className="qhist-quota-row">
                <span>
                  {ticketsUsed.toLocaleString("en-IN")} /{" "}
                  {ticketCap.toLocaleString("en-IN")} tickets
                </span>
                <span>{ticketPercent}%</span>
              </div>
              <div
                className="qhist-quota-track"
                role="progressbar"
                aria-valuenow={ticketPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${ticketsUsed} of ${ticketCap} queue tickets used across all branches`}
              >
                <span
                  className="qhist-quota-fill"
                  style={{ width: `${ticketPercent}%` }}
                />
              </div>
              {ticketHelper ? (
                <p className="qhist-quota-helper">{ticketHelper}</p>
              ) : null}
            </div>
          </div>
        </div>

        {canUpgrade && planSummary.nextPlan ? (
          <button
            type="button"
            className="qhist-quota-cta"
            onClick={() => router.push("/merchant/queue/plan")}
          >
            <span className="qhist-quota-cta-label">Upgrade now</span>
            <span className="qhist-quota-cta-price">
              {planSummary.nextPlan.priceLabel}
              {planSummary.currentCycleLabel}
            </span>
          </button>
        ) : null}
      </div>

      <div className="qhist-toolbar">
        <div className="queue-tabs" role="tablist" aria-label="Date range">
          {RANGES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={range === id}
              className={`queue-tab${range === id ? " active" : ""}`}
              onClick={() => setRange(id)}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>

        <label className="qhist-sort">
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown size={15} strokeWidth={2.4} className="qhist-sort-chevron" />
        </label>
      </div>

      {sessions.length === 0 ? (
        <div className="panel-card merchant-empty">
          <div className="merchant-empty-icon">
            <History size={24} strokeWidth={2.2} />
          </div>
          <p className="merchant-empty-title">
            {live ? "No archived sessions yet" : "No sessions in this range"}
          </p>
          <p className="merchant-empty-sub">
            {live
              ? "End the current queue to archive today’s session here."
              : "Start and end a live queue to build your session history."}
          </p>
        </div>
      ) : (
        <div className="qhist-list">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className="panel-card qhist-card qhist-card--clickable"
              onClick={() => setSelectedSession(s)}
            >
              <div className="qhist-card-head">
                <div className="qhist-card-copy">
                  <div className="qhist-card-title">
                    Session #{s.number}
                    <ChevronRight
                      size={16}
                      strokeWidth={2.4}
                      className="qhist-card-chevron"
                    />
                  </div>
                  <div className="qhist-card-meta">
                    <span className="qhist-card-sub">
                      {formatDate(s.endedAtMs)} · {formatClock(s.startedAtMs)} –{" "}
                      {formatClock(s.endedAtMs)}
                    </span>
                    <StartedBy actor={s} />
                  </div>
                </div>
                <span className="qhist-served-pill">{s.served} served</span>
              </div>
              <div className="qhist-stats">
                <div className="qhist-stat">
                  <span className="qhist-stat-value">{s.served}</span>
                  <span className="qhist-stat-label">Served</span>
                </div>
                <div className="qhist-stat">
                  <span className="qhist-stat-value">{s.left}</span>
                  <span className="qhist-stat-label">Left</span>
                </div>
                <div className="qhist-stat">
                  <span className="qhist-stat-value">
                    {waitSegments(s.avgWait).map((part) => (
                      <Fragment key={part.unit}>
                        {part.value}
                        <span className="qhist-stat-unit">{part.unit}</span>
                      </Fragment>
                    ))}
                  </span>
                  <span className="qhist-stat-label">Avg wait</span>
                </div>
                <div className="qhist-stat">
                  <span className="qhist-stat-value">
                    {waitSegments(s.longestWait).map((part) => (
                      <Fragment key={part.unit}>
                        {part.value}
                        <span className="qhist-stat-unit">{part.unit}</span>
                      </Fragment>
                    ))}
                  </span>
                  <span className="qhist-stat-label">Longest</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <QueueSessionHistorySheet
        session={selectedSession}
        branchId={activeBranchId}
        role={role}
        onClose={() => setSelectedSession(null)}
        onDeleted={handleSessionDeleted}
      />
    </div>
  );
}
