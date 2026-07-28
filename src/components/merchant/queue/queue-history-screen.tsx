"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronDown,
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
import { queuePlanLimits } from "@/lib/merchant/plan-limits";
import { isTrialActive, trialDaysLeft } from "@/lib/merchant/entitlements";
import {
  ensureQueueDataEpoch,
  loadQueueHistoryView,
  type QueueSessionActor,
  type QueueSessionRecord,
} from "@/lib/merchant/queue-session-storage";
import { QueueHistorySkeleton } from "./queue-skeletons";

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

function startOfMonthMs(ms: number) {
  const d = new Date(ms);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function QueueHistoryScreen() {
  const router = useRouter();
  const { profile, activeBranchId, entitlements, role } = useMerchantWorkspace();
  const [range, setRange] = useState<RangeKey>("7d");
  const [sort, setSort] = useState<SortKey>("newest");
  const [now, setNow] = useState(() => Date.now());
  const [allSessions, setAllSessions] = useState<QueueSessionRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
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

  const ticketLimit = queuePlanLimits(entitlements.queue?.planId).maxTicketsPerMonth;
  const monthTickets = useMemo(() => {
    const monthStart = startOfMonthMs(now);
    return allSessions
      .filter((s) => s.endedAtMs >= monthStart)
      .reduce((sum, s) => sum + s.served + s.left, 0);
  }, [allSessions, now]);
  const canUpgrade =
    role === "owner" && basePlanId(entitlements.queue?.planId ?? "") !== "queue-pro";

  const trialing = isTrialActive(entitlements.queue);
  const daysLeft = trialDaysLeft(entitlements.queue);
  const trialDaysLabel = `${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;

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

      <div className="qhist-summary qhist-summary--4">
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
        <div className="qhist-summary-stat qhist-summary-stat--tickets">
          <span className="qhist-summary-icon">
            <Ticket size={17} strokeWidth={2.3} />
          </span>
          <div className="qhist-summary-copy">
            <span className="qhist-summary-value">
              {monthTickets.toLocaleString("en-IN")}
              {/* Trial caps are deliberately not quoted back to the merchant. */}
              {!trialing && (
                <span className="qhist-summary-unit">
                  / {ticketLimit.toLocaleString("en-IN")}
                </span>
              )}
            </span>
            <span className="qhist-summary-label">Queue tickets</span>
            {trialing && role === "owner" ? (
              <button
                type="button"
                className="qhist-upgrade-link"
                onClick={() => router.push("/merchant/queue/plan")}
              >
                {trialDaysLabel} left · Upgrade
              </button>
            ) : canUpgrade ? (
              <button
                type="button"
                className="qhist-upgrade-link"
                onClick={() => router.push("/merchant/queue/plan")}
              >
                Upgrade plan
              </button>
            ) : null}
          </div>
        </div>
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
            <div key={s.id} className="panel-card qhist-card">
              <div className="qhist-card-head">
                <div className="qhist-card-copy">
                  <div className="qhist-card-title">Session #{s.number}</div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
