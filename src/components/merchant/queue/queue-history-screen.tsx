"use client";

import { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, Clock3, History, Users } from "lucide-react";

interface SessionRecord {
  id: string;
  number: number;
  startedAtMs: number;
  endedAtMs: number;
  served: number;
  left: number;
  avgWait: number;
  longestWait: number;
}

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

// Demo history — spread across ~6 months so range filters are meaningful.
function buildSessions(): SessionRecord[] {
  const dayOffsets = [0, 1, 2, 4, 6, 9, 13, 18, 24, 33, 45, 60, 80, 110, 150, 178];
  const now = Date.now();
  return dayOffsets.map((offset, i) => {
    const day = new Date(now - offset * DAY_MS);
    const startedAt = new Date(day);
    startedAt.setHours(9, 2, 0, 0);
    const endedAt = new Date(day);
    endedAt.setHours(21 + (i % 2), 41 - ((i * 7) % 40), 0, 0);
    const served = 22 + ((i * 9) % 34);
    const left = (i * 3) % 7;
    const avgWait = 8 + ((i * 5) % 14);
    const longestWait = avgWait + 9 + ((i * 4) % 12);
    return {
      id: `s-${i}`,
      number: 128 - i,
      startedAtMs: startedAt.getTime(),
      endedAtMs: endedAt.getTime(),
      served,
      left,
      avgWait,
      longestWait,
    };
  });
}

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

export function QueueHistoryScreen() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [sort, setSort] = useState<SortKey>("newest");
  const [now] = useState(() => Date.now());
  const allSessions = useMemo(() => buildSessions(), []);

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

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">History</h2>
        <p className="tab-sub">Every archived queue session, with wait times and outcomes</p>
      </div>

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
              {totals.avgWait}
              <span className="qhist-summary-unit">min</span>
            </span>
            <span className="qhist-summary-label">Avg wait</span>
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
          <p className="merchant-empty-title">No sessions in this range</p>
          <p className="merchant-empty-sub">
            Try a wider date range to see earlier queue sessions.
          </p>
        </div>
      ) : (
        <div className="qhist-list">
          {sessions.map((s) => (
            <div key={s.id} className="panel-card qhist-card">
              <div className="qhist-card-head">
                <div className="qhist-card-copy">
                  <div className="qhist-card-title">Session #{s.number}</div>
                  <div className="qhist-card-sub">
                    {formatDate(s.endedAtMs)} · {formatClock(s.startedAtMs)} –{" "}
                    {formatClock(s.endedAtMs)}
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
                    {s.avgWait}
                    <span className="qhist-stat-unit">min</span>
                  </span>
                  <span className="qhist-stat-label">Avg wait</span>
                </div>
                <div className="qhist-stat">
                  <span className="qhist-stat-value">
                    {s.longestWait}
                    <span className="qhist-stat-unit">min</span>
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
