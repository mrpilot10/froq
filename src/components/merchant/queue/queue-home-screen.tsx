"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  CalendarPlus,
  Check,
  ChevronRight,
  History,
  Lock,
  Megaphone,
  Minus,
  Pause,
  Phone,
  Play,
  Plus,
  QrCode,
  Search,
  Square,
  Timer,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { nationalMobileInputDigits } from "@/lib/auth/format";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import {
  CALL_ACCEPT_MINUTES,
  callAcceptDeadlineMs,
  ensureInitialEstimatedWaitMinutes,
  getWaitEstimateMeta,
  recordActualWaitMinutes,
} from "@/lib/merchant/queue-settings";
import { formatWaitShort, waitSegments } from "@/lib/queue/format";
import {
  estimatedWaitMinutes as computeEta,
  lineEntries,
  nextCallableEntry,
  reservationDisplayPhase,
} from "@/lib/queue/ordering";
import type { MerchantProfile } from "@/lib/merchant/types";
import { isProductEnabled } from "@/lib/merchant/entitlements";
import {
  addLiveQueueEntry,
  fetchLiveQueueBoard,
  setLiveQueueSessionStatus,
  startLiveQueueSession,
  updateLiveQueueEntryStatus,
} from "@/app/merchant/queue-actions";
import {
  archiveQueueSession,
  ensureQueueDataEpoch,
  removeQueueSessionRecord,
  type QueueSessionActor,
  type QueueSessionRecord,
} from "@/lib/merchant/queue-session-storage";
import { startedByLabel } from "@/lib/merchant/queue-session-actor";
import { joinUrlFor } from "../use-merchant-qr";
import { useMerchantWorkspace } from "../merchant-workspace-context";
import { ActorChip } from "../actor-chip";
import { QueueHomeSkeleton } from "./queue-skeletons";
import { QueueSessionHistorySheet } from "./queue-session-history-sheet";
import { QueueStatusHero } from "./queue-status-hero";

interface QueueHomeScreenProps {
  profile: MerchantProfile;
  onViewHistory?: () => void;
}

interface QueueEntry {
  id: string;
  name: string;
  phone: string;
  email?: string;
  partySize: number;
  joinedAtMs: number;
  calledAtMs?: number;
  acceptByMs?: number;
  seatedAtMs?: number;
  leftAtMs?: number;
  status: "held" | "called" | "waiting" | "seated" | "left";
  kind: "walkin" | "reservation";
  reservationTime?: string;
  reservationId?: string;
  tableNumber?: number;
  diningTableId?: string;
  /** How many of the 3 call reminders have been delivered (0–3). */
  remindersSent?: number;
}

type SheetKind = "guest" | "reservation" | "end" | null;
type QueueListFilter = "waiting" | "seated" | "left";
type QueueState = "not_started" | "live" | "paused" | "ended";

interface QueueSession extends QueueSessionActor {
  number: number;
  startedAtMs: number;
}

interface EndedSummary extends QueueSessionActor {
  number: number;
  startedAtMs: number;
  endedAtMs: number;
  served: number;
  left: number;
  avgWait: number;
  longestWait: number;
  sessionId?: string;
}

interface PersistedQueue {
  queueState: QueueState;
  session: QueueSession | null;
  endedSummary: EndedSummary | null;
  entries: QueueEntry[];
  /** Highest session number ever used — survives end so the next start increments. */
  lastSessionNumber: number;
}

const EMPTY_QUEUE: PersistedQueue = {
  queueState: "not_started",
  session: null,
  endedSummary: null,
  entries: [],
  lastSessionNumber: 0,
};

function isQueueState(value: unknown): value is QueueState {
  return (
    value === "not_started" ||
    value === "live" ||
    value === "paused" ||
    value === "ended"
  );
}

/** Old builds shipped a hardcoded live session #128 + demo guests. Ignore those. */
function isLegacyDemoSnapshot(saved: PersistedQueue): boolean {
  if (saved.session?.number !== 128) return false;
  const ids = new Set(saved.entries.map((e) => e.id));
  return ids.has("q1") && ids.has("q2") && ids.has("q3");
}

function parsePersistedQueue(raw: string): PersistedQueue | null {
  try {
    const saved = JSON.parse(raw) as Partial<PersistedQueue>;
    if (!saved || !isQueueState(saved.queueState)) return null;
    const lastSessionNumber = Math.max(
      0,
      Math.round(Number(saved.lastSessionNumber) || 0),
      Math.round(Number(saved.session?.number) || 0),
      Math.round(Number(saved.endedSummary?.number) || 0),
    );
    const snapshot: PersistedQueue = {
      queueState: saved.queueState,
      session: saved.session ?? null,
      endedSummary: saved.endedSummary ?? null,
      entries: Array.isArray(saved.entries) ? (saved.entries as QueueEntry[]) : [],
      lastSessionNumber,
    };
    if (isLegacyDemoSnapshot(snapshot)) return EMPTY_QUEUE;
    return snapshot;
  } catch {
    return null;
  }
}

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Meta items describing when a session ran, e.g. `["2:10 pm – 3:46 pm", "1h 36m"]`.
 * A session opened and closed inside the same minute collapses to a single
 * time — "11:09 pm – 11:09 pm · 0m" is three ways of saying nothing happened.
 */
function sessionWindow(startedAtMs: number, endedAtMs: number): string[] {
  const from = formatClock(startedAtMs);
  const to = formatClock(endedAtMs);
  if (from === to) return [from];
  const minutes = Math.max(0, Math.round((endedAtMs - startedAtMs) / 60_000));
  return [`${from} – ${to}`, formatWaitShort(minutes)];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function waitMinutes(joinedAtMs: number, now: number) {
  return Math.max(0, Math.floor((now - joinedAtMs) / 60_000));
}

/**
 * Cheap poll fingerprint — every field QueueEntryCard renders (plus status for
 * filter membership). Entry order is encoded by concatenation order (token #).
 * email is omitted: not shown on the card today.
 */
function fingerprintEntries(entries: QueueEntry[]): string {
  let out = String(entries.length);
  for (const e of entries) {
    out += `\n${e.id}\0${e.status}\0${e.joinedAtMs}\0${e.calledAtMs ?? ""}\0${
      e.acceptByMs ?? ""
    }\0${e.seatedAtMs ?? ""}\0${e.leftAtMs ?? ""}\0${e.partySize}\0${e.name}\0${
      e.phone
    }\0${e.kind}\0${e.reservationTime ?? ""}\0${e.remindersSent ?? ""}`;
  }
  return out;
}

function fingerprintSession(session: {
  status: QueueState;
  number: number;
  startedAtMs: number;
}): string {
  return `${session.status}\0${session.number}\0${session.startedAtMs}`;
}

/** 1s accept-window countdown — owns its own clock so the list does not re-render. */
const AcceptWindowCountdown = memo(function AcceptWindowCountdown({
  calledAtMs,
  acceptByMs,
}: {
  calledAtMs?: number;
  acceptByMs?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const deadlineMs =
    calledAtMs != null ? callAcceptDeadlineMs(calledAtMs) : acceptByMs;
  const msLeft = deadlineMs != null ? deadlineMs - now : 0;
  const label = formatCountdown(msLeft);
  return (
    <div
      className={`queue-timer${msLeft < 60_000 ? " is-urgent" : ""}`}
      aria-label={`${label} left to arrive`}
    >
      <Timer size={14} strokeWidth={2.4} />
      <span className="queue-timer-value">{label}</span>
    </div>
  );
});

/**
 * Wait-minute label — ticks on each minute boundary for this join time (≤60s),
 * so "3 min" cannot linger after 4:00 elapsed.
 */
const WaitMinutesLabel = memo(function WaitMinutesLabel({
  joinedAtMs,
}: {
  joinedAtMs: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let intervalId = 0;
    const tick = () => setNow(Date.now());
    // Sync immediately on mount / joinedAt change — do not keep a stale `now`
    // from a prior interval across prop updates (wrong minute until next boundary).
    tick();
    const elapsed = Date.now() - joinedAtMs;
    const msIntoMinute = ((elapsed % 60_000) + 60_000) % 60_000;
    const msToNextMinute = msIntoMinute === 0 ? 60_000 : 60_000 - msIntoMinute;
    const timeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 60_000);
    }, msToNextMinute);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [joinedAtMs]);
  return <>{waitLabel(waitMinutes(joinedAtMs, now))}</>;
});

type QueueEntryCardProps = {
  entry: QueueEntry;
  token: number;
  pendingSeating: boolean;
  pendingLeaving: boolean;
  actionsBusy: boolean;
  onOpen: (entry: QueueEntry) => void;
  onCall: (entry: QueueEntry) => void;
  onSeated: (entry: QueueEntry) => void;
  onLeft: (entry: QueueEntry) => void;
};

const QueueEntryCard = memo(function QueueEntryCard({
  entry,
  token,
  pendingSeating,
  pendingLeaving,
  actionsBusy,
  onOpen,
  onCall,
  onSeated,
  onLeft,
}: QueueEntryCardProps) {
  const isSeated = entry.status === "seated";
  const isLeft = entry.status === "left";
  const isHeld = entry.status === "held";
  const calledCard = entry.status === "called";
  const showActions = !isSeated && !isLeft;
  const timeLabel = (ms?: number) =>
    ms
      ? new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";

  const remindersSent = Math.min(3, Math.max(0, entry.remindersSent ?? 0));

  return (
    <div
      className={`panel-card queue-entry${calledCard ? " queue-entry--called" : ""}${
        isSeated ? " queue-entry--seated" : ""
      }${isLeft ? " queue-entry--left" : ""}${isHeld ? " queue-entry--held" : ""}${
        showActions ? " has-actions" : ""
      }`}
    >
      <div className="queue-entry-main">
        <button
          type="button"
          className="queue-entry-open"
          aria-label={`View ${entry.name}`}
          onClick={() => onOpen(entry)}
        >
          <span className="queue-token">#{token}</span>
          <div className="merchant-avatar">{initials(entry.name)}</div>
          <div className="queue-entry-copy">
            <div className="merchant-list-title">
              {entry.name}
              {reservationDisplayPhase(entry) === "upcoming" && (
                <span className="queue-entry-badge queue-entry-badge--reserved">
                  Reserved
                </span>
              )}
              {reservationDisplayPhase(entry) === "waiting" && (
                <span className="queue-entry-badge">Waiting · Reserved</span>
              )}
            </div>
            {entry.phone ? (
              <span className="merchant-list-sub queue-entry-phone">
                <Phone size={13} strokeWidth={2.4} aria-hidden="true" />
                <span>{entry.phone}</span>
              </span>
            ) : (
              <div className="merchant-list-sub">No phone</div>
            )}
            <div className="queue-entry-meta">
              {isSeated
                ? `${partyLabel(entry.partySize)} · seated${
                    entry.seatedAtMs ? ` · ${timeLabel(entry.seatedAtMs)}` : ""
                  }`
                : isLeft
                  ? `${partyLabel(entry.partySize)} · left${
                      entry.leftAtMs ? ` · ${timeLabel(entry.leftAtMs)}` : ""
                    }`
                  : calledCard
                    ? `${partyLabel(entry.partySize)} · Called`
                    : isHeld
                      ? `${partyLabel(entry.partySize)} · arrives ${
                          entry.reservationTime || timeLabel(entry.joinedAtMs)
                        }`
                      : (
                          <>
                            {partyLabel(entry.partySize)} ·{" "}
                            <WaitMinutesLabel joinedAtMs={entry.joinedAtMs} />
                            {entry.kind === "reservation" && entry.reservationTime
                              ? ` · ${entry.reservationTime}`
                              : ""}
                          </>
                        )}
            </div>
          </div>
          <ChevronRight
            size={18}
            strokeWidth={2.2}
            className="merchant-list-arrow queue-entry-chevron"
            aria-hidden="true"
          />
        </button>

        {/* Inline with the guest, like a booking row; drops to its own full
            width line under 720px where two buttons can't sit beside a name. */}
        {showActions ? (
          <div className="queue-entry-trailing">
            <div className="queue-entry-actions">
              {calledCard ? (
                <button
                  type="button"
                  className="queue-act queue-act--served"
                  disabled={actionsBusy}
                  aria-busy={pendingSeating || undefined}
                  onClick={() => onSeated(entry)}
                >
                  {pendingSeating ? (
                    <span className="merchant-btn-spinner" aria-hidden="true" />
                  ) : (
                    <Check size={14} strokeWidth={2.3} />
                  )}
                  {pendingSeating ? "Seating…" : "Seated"}
                </button>
              ) : !isHeld ? (
                <button
                  type="button"
                  className="queue-act queue-act--call"
                  disabled={actionsBusy}
                  onClick={() => onCall(entry)}
                >
                  <Megaphone size={14} strokeWidth={2.3} />
                  Call
                </button>
              ) : null}
              <button
                type="button"
                className="queue-act queue-act--left"
                disabled={actionsBusy}
                aria-busy={pendingLeaving || undefined}
                onClick={() => onLeft(entry)}
              >
                {pendingLeaving ? (
                  <span className="merchant-btn-spinner" aria-hidden="true" />
                ) : (
                  <X size={14} strokeWidth={2.3} />
                )}
                {pendingLeaving ? "Leaving…" : isHeld ? "No show" : "Left"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Called-only status strip: how many reminders went out, and how long
          the guest still has to show up. */}
      {calledCard ? (
        <div className="queue-entry-foot">
          <div className="queue-reminders" aria-label="Reminders sent">
            <span className="queue-reminders-label">
              Reminders {remindersSent}/3
            </span>
            <span className="queue-reminders-dots" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className={`queue-reminders-dot${
                    index < remindersSent ? " is-sent" : ""
                  }`}
                />
              ))}
            </span>
          </div>
          <AcceptWindowCountdown
            calledAtMs={entry.calledAtMs}
            acceptByMs={entry.acceptByMs}
          />
        </div>
      ) : null}
    </div>
  );
});

function partyLabel(size: number) {
  return `Party of ${size}`;
}

function guestStatusLabel(status: QueueEntry["status"]) {
  if (status === "held") return "Held";
  if (status === "waiting") return "Waiting";
  if (status === "called") return "Called";
  if (status === "seated") return "Seated";
  return "Left";
}

function waitLabel(mins: number) {
  if (mins < 1) return "just joined";
  return `waiting ${formatWaitShort(mins)}`;
}

function formatCountdown(msLeft: number) {
  const totalSec = Math.max(0, Math.ceil(msLeft / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function QueueHomeScreen({ profile, onViewHistory }: QueueHomeScreenProps) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [queueState, setQueueState] = useState<QueueState>("not_started");
  const [session, setSession] = useState<QueueSession | null>(null);
  const [endedSummary, setEndedSummary] = useState<EndedSummary | null>(null);
  const [lastSessionNumber, setLastSessionNumber] = useState(0);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<QueueListFilter>("waiting");
  const [searchQuery, setSearchQuery] = useState("");
  const acceptMinutes = CALL_ACCEPT_MINUTES;
  const [minsPerParty, setMinsPerParty] = useState(10);
  const [waitSource, setWaitSource] = useState<"initial" | "learned">("initial");
  const [waitSamples, setWaitSamples] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  /** In-flight Seated / Left action — spinner on the pressed button. */
  const [pendingResolve, setPendingResolve] = useState<{
    entryId: string;
    action: "seated" | "left";
  } | null>(null);
  const resolvedCallRef = useRef<Set<string>>(new Set());
  /** Only persist after hydrate for this exact sessionKey (avoids clobber races). */
  const hydratedKeyRef = useRef<string | null>(null);
  const pendingResolveRef = useRef<{
    entryId: string;
    action: "seated" | "left";
  } | null>(null);
  /** Entries with a call request in flight — stops double-taps at the source. */
  const callingRef = useRef<Set<string>>(new Set());

  const isLive = queueState === "live";
  const isPaused = queueState === "paused";
  const showDashboard = isLive || isPaused;
  /** Nobody joined, so the recap has no numbers worth tabulating. */
  const noGuests =
    !!endedSummary && endedSummary.served === 0 && endedSummary.left === 0;

  // The recap sheet speaks the History screen's record shape, so adapt the
  // just-ended summary rather than teaching the sheet a second shape.
  const endedRecord: QueueSessionRecord | null = endedSummary
    ? {
        id:
          endedSummary.sessionId ??
          `qs-${endedSummary.number}-${endedSummary.endedAtMs}`,
        number: endedSummary.number,
        startedAtMs: endedSummary.startedAtMs,
        endedAtMs: endedSummary.endedAtMs,
        served: endedSummary.served,
        left: endedSummary.left,
        avgWait: endedSummary.avgWait,
        longestWait: endedSummary.longestWait,
        startedByName: endedSummary.startedByName,
        startedByRole: endedSummary.startedByRole,
        ...(endedSummary.sessionId ? { dbSessionId: endedSummary.sessionId } : {}),
      }
    : null;

  // Add guest form
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestParty, setGuestParty] = useState(2);

  // Reservation form
  const [resName, setResName] = useState("");
  const [resPhone, setResPhone] = useState("");
  const [resParty, setResParty] = useState(2);
  const [resTime, setResTime] = useState("");

  const { activeBranchId, branches, entitlements, role, onShowQr, onPurchaseProduct } =
    useMerchantWorkspace();
  const reservationsEnabled = isProductEnabled(entitlements, "reservation");
  const queueUrl = useMemo(() => joinUrlFor(profile, "queue"), [profile]);
  // Each branch keeps its own live session (queues run independently).
  const sessionKey = useMemo(
    () => `froq.queue.session:${queueUrl}:${activeBranchId ?? "all"}`,
    [queueUrl, activeBranchId],
  );

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const queueStateRef = useRef(queueState);
  queueStateRef.current = queueState;

  const applyQueueSnapshot = useCallback((snapshot: PersistedQueue) => {
    setQueueState(snapshot.queueState);
    setSession(snapshot.session);
    setEndedSummary(snapshot.endedSummary);
    setEntries(snapshot.entries);
    setLastSessionNumber(snapshot.lastSessionNumber);
  }, []);

  const syncLiveBoard = useCallback(async () => {
    const board = await fetchLiveQueueBoard({ branchId: activeBranchId });
    if (!board.ok) return;
    if (board.session) {
      const nextSession = {
        number: board.session.number,
        startedAtMs: board.session.startedAtMs,
        startedByName: board.session.startedByName,
        startedByRole: board.session.startedByRole,
      };
      const nextState = board.session.status as QueueState;
      const sessionChanged =
        fingerprintSession({
          status: nextState,
          number: nextSession.number,
          startedAtMs: nextSession.startedAtMs,
        }) !==
        fingerprintSession({
          status: queueStateRef.current,
          number: sessionRef.current?.number ?? -1,
          startedAtMs: sessionRef.current?.startedAtMs ?? -1,
        });
      const entriesChanged =
        fingerprintEntries(board.entries) !== fingerprintEntries(entriesRef.current);

      if (sessionChanged) {
        setQueueState(nextState);
        setSession(nextSession);
      }
      setLastSessionNumber((n) => Math.max(n, board.session!.number));
      if (entriesChanged) setEntries(board.entries);
      if (board.session.status !== "ended") {
        setEndedSummary((prev) => (prev == null ? prev : null));
      }
    } else if (queueStateRef.current === "live" || queueStateRef.current === "paused") {
      // Ended externally (auto-close, another device). Don't keep a stale "live"
      // board — guests already can't join, and Start must be available again.
      const endedAtMs = Date.now();
      setQueueState("not_started");
      setSession(null);
      setEndedSummary(null);
      setEntries((prev) =>
        prev.map((e) =>
          e.status === "held" || e.status === "waiting" || e.status === "called"
            ? { ...e, status: "left" as const, leftAtMs: endedAtMs }
            : e,
        ),
      );
    }
  }, [activeBranchId]);

  const startQueue = () => {
    if (branches.length > 1 && !activeBranchId) {
      toast.error("Select a branch to start its queue.");
      return;
    }
    void startLiveQueueSession({ branchId: activeBranchId }).then((result) => {
      if (!result.ok || !result.session) {
        toast.error(result.error ?? "Couldn't start the queue");
        return;
      }
      setSession({
        number: result.session.number,
        startedAtMs: result.session.startedAtMs,
        startedByName: result.session.startedByName,
        startedByRole: result.session.startedByRole,
      });
      setLastSessionNumber(result.session.number);
      setEndedSummary(null);
      setEntries([]);
      resolvedCallRef.current.clear();
      setListFilter("waiting");
      setQueueState("live");
      toast.success(`Queue session #${result.session.number} started`);
    });
  };

  const pauseQueue = () => {
    void setLiveQueueSessionStatus({
      status: "paused",
      branchId: activeBranchId,
    }).then((result) => {
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't pause the queue");
        return;
      }
      setQueueState("paused");
      toast("Queue paused — new guests can't join");
    });
  };

  const resumeQueue = () => {
    void setLiveQueueSessionStatus({
      status: "live",
      branchId: activeBranchId,
    }).then((result) => {
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't resume the queue");
        return;
      }
      setQueueState("live");
      toast.success("Queue resumed — accepting guests");
    });
  };

  const confirmEndQueue = () => {
    void setLiveQueueSessionStatus({
      status: "ended",
      branchId: activeBranchId,
    }).then((result) => {
      if (!result.ok) {
        toast.error(result.error ?? "Couldn't end the queue");
        return;
      }
      const endedAtMs = Date.now();
      const summary = result.summary ?? {
        number: session?.number ?? lastSessionNumber ?? 1,
        startedAtMs: session?.startedAtMs ?? endedAtMs,
        endedAtMs,
        served: entries.filter((e) => e.status === "seated").length,
        left: entries.filter((e) => e.status !== "seated").length,
        avgWait: 0,
        longestWait: 0,
        startedByName: session?.startedByName,
        startedByRole: session?.startedByRole,
      };
      setEntries((prev) =>
        prev.map((e) =>
          e.status === "held" || e.status === "waiting" || e.status === "called"
            ? { ...e, status: "left" as const, leftAtMs: endedAtMs }
            : e,
        ),
      );
      setLastSessionNumber(Math.max(lastSessionNumber, summary.number));
      setEndedSummary(summary);
      setQueueState("ended");
      setSheet(null);
      archiveQueueSession(queueUrl, activeBranchId, {
        ...summary,
        sessionId: result.summary?.sessionId,
      });
      toast.success("Queue ended — session archived");
    });
  };

  // Hydrate the persisted session so ending / pausing survives navigation & reloads.
  useEffect(() => {
    hydratedKeyRef.current = null;
    setHydrated(false);
    ensureQueueDataEpoch();

    const raw = window.localStorage.getItem(sessionKey);
    const saved = raw ? parsePersistedQueue(raw) : null;
    applyQueueSnapshot(saved ?? EMPTY_QUEUE);
    setListFilter("waiting");
    resolvedCallRef.current.clear();

    hydratedKeyRef.current = sessionKey;
    setHydrated(true);
    void fetchLiveQueueBoard({ branchId: activeBranchId }).then((board) => {
      if (!board.ok) return;
      if (!board.session) {
        // Drop a stale localStorage "live"/"paused" when the server has no session
        // (e.g. auto-close ended it while this tab was closed).
        if (queueStateRef.current === "live" || queueStateRef.current === "paused") {
          setQueueState("not_started");
          setSession(null);
          setEntries([]);
          setEndedSummary(null);
        }
        return;
      }
      setQueueState(board.session.status);
      setSession({
        number: board.session.number,
        startedAtMs: board.session.startedAtMs,
        startedByName: board.session.startedByName,
        startedByRole: board.session.startedByRole,
      });
      setLastSessionNumber((n) => Math.max(n, board.session!.number));
      setEntries(board.entries);
      setEndedSummary(null);
    });
  }, [sessionKey, applyQueueSnapshot, activeBranchId]);

  // Pull QR joins + board changes while the queue is open.
  useEffect(() => {
    if (!hydrated) return;
    if (queueState !== "live" && queueState !== "paused") return;
    const id = window.setInterval(() => {
      void syncLiveBoard();
    }, 3000);
    void syncLiveBoard();
    return () => window.clearInterval(id);
  }, [hydrated, queueState, syncLiveBoard]);

  // Persist only after hydrate for this key — never write defaults over a real session.
  useEffect(() => {
    if (!hydrated || hydratedKeyRef.current !== sessionKey) return;
    try {
      const payload: PersistedQueue = {
        queueState,
        session,
        endedSummary,
        entries,
        lastSessionNumber,
      };
      window.localStorage.setItem(sessionKey, JSON.stringify(payload));
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [
    hydrated,
    sessionKey,
    queueState,
    session,
    endedSummary,
    entries,
    lastSessionNumber,
  ]);

  useEffect(() => {
    const activeBranch =
      branches.find((b) => b.id === activeBranchId) ?? null;
    ensureInitialEstimatedWaitMinutes(
      activeBranchId,
      activeBranch?.estimatedWaitMinutes,
    );
    const meta = getWaitEstimateMeta(activeBranchId);
    setMinsPerParty(meta.minutes);
    setWaitSource(meta.source);
    setWaitSamples(meta.samples);
    const onSettings = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          branchId?: string | null;
          estimatedWaitMinutes?: number;
          waitSource?: "initial" | "learned";
          waitSamples?: number;
        }>
      ).detail;
      if (
        detail?.branchId != null &&
        activeBranchId != null &&
        detail.branchId !== activeBranchId
      ) {
        return;
      }
      if (detail?.estimatedWaitMinutes != null) {
        setMinsPerParty(detail.estimatedWaitMinutes);
        if (detail.waitSource) setWaitSource(detail.waitSource);
        if (detail.waitSamples != null) setWaitSamples(detail.waitSamples);
      } else {
        const next = getWaitEstimateMeta(activeBranchId);
        setMinsPerParty(next.minutes);
        setWaitSource(next.source);
        setWaitSamples(next.samples);
      }
    };
    window.addEventListener("froq:queue-settings", onSettings);
    return () => window.removeEventListener("froq:queue-settings", onSettings);
  }, [activeBranchId, branches]);

  // After reminder 3, keep status "called" until the merchant marks
  // Seated / Left / Skipped — never auto-resolve from the accept window.

  const called = useMemo(
    () => entries.filter((e) => e.status === "called"),
    [entries],
  );
  const seated = useMemo(
    () => entries.filter((e) => e.status === "seated"),
    [entries],
  );
  const left = useMemo(
    () => entries.filter((e) => e.status === "left"),
    [entries],
  );

  const openSheet = (kind: SheetKind) => {
    if (kind === "guest" && !isLive) {
      toast.error(
        isPaused
          ? "Queue is paused — resume it to add guests"
          : "Start the queue to add guests",
      );
      return;
    }
    setSheet(kind);
  };

  const closeSheet = () => setSheet(null);

  const resetGuestForm = () => {
    setGuestName("");
    setGuestPhone("");
    setGuestEmail("");
    setGuestParty(2);
  };

  const resetResForm = () => {
    setResName("");
    setResPhone("");
    setResParty(2);
    setResTime("");
  };

  const addGuest = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = guestName.trim();
    const phone = guestPhone.trim();
    const email = guestEmail.trim();
    if (!trimmed) {
      toast.error("Enter the guest's name");
      return;
    }
    if (!phone) {
      toast.error("Enter the guest's phone number");
      return;
    }
    const lineCount = lineEntries(entries).length;
    const estimatedWaitMinutes = computeEta({
      partiesAhead: lineCount,
      minutesPerParty: minsPerParty,
      includeSelf: true,
    });
    void addLiveQueueEntry({
      name: trimmed,
      phone,
      email: email || undefined,
      partySize: guestParty,
      kind: "walkin",
      branchId: activeBranchId,
      estimatedWaitMinutes,
    }).then((result) => {
      if (!result.ok || !result.entry) {
        toast.error(result.error ?? "Couldn't add guest");
        return;
      }
      setEntries((prev) => {
        if (prev.some((e) => e.id === result.entry!.id)) return prev;
        return [...prev, result.entry!];
      });
      if (result.error) {
        toast.warning(`${trimmed} added · WhatsApp failed: ${result.error}`);
      } else {
        toast.success(`${trimmed} added to the queue`);
      }
      resetGuestForm();
      closeSheet();
      void syncLiveBoard();
    });
  };

  const addReservation = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = resName.trim();
    if (!trimmed) {
      toast.error("Enter the guest's name");
      return;
    }
    if (!resTime) {
      toast.error("Pick a reservation time");
      return;
    }
    if (!resPhone.trim()) {
      toast.error("Enter the guest's phone number");
      return;
    }
    void addLiveQueueEntry({
      name: trimmed,
      phone: resPhone.trim(),
      partySize: resParty,
      kind: "reservation",
      reservationTime: resTime,
      branchId: activeBranchId,
      estimatedWaitMinutes: minsPerParty,
    }).then((result) => {
      if (!result.ok || !result.entry) {
        toast.error(result.error ?? "Couldn't add reservation");
        return;
      }
      setEntries((prev) => {
        if (prev.some((e) => e.id === result.entry!.id)) return prev;
        return [...prev, result.entry!];
      });
      if (result.error) {
        toast.warning(
          `Reservation for ${trimmed} added · WhatsApp failed: ${result.error}`,
        );
      } else {
        toast.success(`Reservation for ${trimmed} added`);
      }
      resetResForm();
      closeSheet();
      void syncLiveBoard();
    });
  };

  const completeCall = useCallback(
    (entry: QueueEntry, tableId: string | null) => {
      if (callingRef.current.has(entry.id)) return;
      callingRef.current.add(entry.id);
      void updateLiveQueueEntryStatus({
        entryId: entry.id,
        status: "called",
        branchId: activeBranchId,
        tableId,
      })
        .then((result) => {
          if (!result.ok || !result.entry) {
            toast.error(result.error ?? "Couldn't call guest");
            return;
          }
          setEntries((prev) =>
            prev.map((e) => (e.id === result.entry!.id ? result.entry! : e)),
          );
          if (result.error) {
            toast.warning(
              `${entry.name} called · WhatsApp failed: ${result.error}`,
            );
          } else {
            toast.success(
              `${entry.name} has been called · ${acceptMinutes} min to arrive`,
            );
          }
          void syncLiveBoard();
        })
        .finally(() => {
          callingRef.current.delete(entry.id);
        });
    },
    [activeBranchId, acceptMinutes, syncLiveBoard],
  );

  const callEntry = useCallback(
    (entry: QueueEntry) => {
      if (callingRef.current.has(entry.id)) return;
      completeCall(entry, null);
    },
    [completeCall],
  );

  const callNext = useCallback(() => {
    if (callingRef.current.has("__next__")) return;
    const preview = nextCallableEntry(entries);
    if (!preview) {
      toast("No one is waiting in the queue");
      return;
    }
    completeCall(preview, null);
  }, [entries, completeCall]);

  const completeSeating = useCallback(
    (entry: QueueEntry, tableId: string | null) => {
      if (pendingResolveRef.current) return;
      const pending = { entryId: entry.id, action: "seated" as const };
      pendingResolveRef.current = pending;
      setPendingResolve(pending);
      const seatedAtMs = Date.now();
      const actualWait = Math.max(
        0,
        Math.round((seatedAtMs - entry.joinedAtMs) / 60_000),
      );
      const learned = recordActualWaitMinutes(actualWait, activeBranchId);
      const meta = getWaitEstimateMeta(activeBranchId);
      setMinsPerParty(learned);
      setWaitSource(meta.source);
      setWaitSamples(meta.samples);
      void updateLiveQueueEntryStatus({
        entryId: entry.id,
        status: "seated",
        branchId: activeBranchId,
        tableId: tableId ?? entry.diningTableId ?? null,
      })
        .then((result) => {
          if (!result.ok || !result.entry) {
            toast.error(result.error ?? "Couldn't mark seated");
            return;
          }
          setEntries((prev) =>
            prev.map((e) => (e.id === result.entry!.id ? result.entry! : e)),
          );
          if (result.error) {
            toast.warning(
              `${entry.name} seated · WhatsApp failed: ${result.error}`,
            );
          } else {
            toast.success(
              `${entry.name} marked as seated · wait was ${formatWaitShort(actualWait)}`,
            );
          }
          void syncLiveBoard();
        })
        .finally(() => {
          pendingResolveRef.current = null;
          setPendingResolve((prev) =>
            prev?.entryId === entry.id && prev.action === "seated" ? null : prev,
          );
        });
    },
    [activeBranchId, syncLiveBoard],
  );

  const markServed = useCallback(
    (entry: QueueEntry) => {
      if (pendingResolveRef.current) return;
      completeSeating(entry, null);
    },
    [completeSeating],
  );

  const markLeft = useCallback(
    (entry: QueueEntry) => {
      if (pendingResolveRef.current) return;
      const pending = { entryId: entry.id, action: "left" as const };
      pendingResolveRef.current = pending;
      setPendingResolve(pending);
      void updateLiveQueueEntryStatus({
        entryId: entry.id,
        status: "left",
        branchId: activeBranchId,
      })
        .then((result) => {
          if (!result.ok || !result.entry) {
            toast.error(result.error ?? "Couldn't mark left");
            return;
          }
          setEntries((prev) =>
            prev.map((e) => (e.id === result.entry!.id ? result.entry! : e)),
          );
          if (result.error) {
            toast.warning(`${entry.name} left · WhatsApp failed: ${result.error}`);
          } else {
            toast(`${entry.name} marked as left`);
          }
          void syncLiveBoard();
        })
        .finally(() => {
          pendingResolveRef.current = null;
          setPendingResolve((prev) =>
            prev?.entryId === entry.id && prev.action === "left" ? null : prev,
          );
        });
    },
    [activeBranchId, syncLiveBoard],
  );

  const avgPerTable = minsPerParty;
  const lineCount = useMemo(() => lineEntries(entries).length, [entries]);
  const currentWait = computeEta({
    partiesAhead: Math.max(0, lineCount - called.length),
    minutesPerParty: avgPerTable,
    includeSelf: false,
  });

  const actionsBusy = Boolean(pendingResolve);

  // Active line: held + waiting + called, ordered by effective service time.
  // Token # on cards is index+1 in this list (= live place in line).
  // Called guests stay in this one list rather than a tab of their own — they
  // are still the front of the line, and their card already stands out.
  const waitingList = useMemo(() => lineEntries(entries), [entries]);

  const filteredByTab =
    listFilter === "waiting"
      ? waitingList
      : listFilter === "seated"
        ? seated
        : left;

  const activeList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredByTab;
    const digits = q.replace(/\D/g, "");
    return filteredByTab.filter((entry) => {
      if (entry.name.toLowerCase().includes(q)) return true;
      if (digits && entry.phone.replace(/\D/g, "").includes(digits)) return true;
      return (entry.email ?? "").toLowerCase().includes(q);
    });
  }, [filteredByTab, searchQuery]);

  const searching = searchQuery.trim().length > 0;
  const emptyCopy = searching
    ? "No guests match that search."
    : listFilter === "waiting"
      ? "No one is in line right now."
      : listFilter === "seated"
        ? "No seated guests yet."
        : "No guests have left.";

  const hero =
    queueState === "live"
      ? {
          label: "Live queue",
          value: "Live",
          meta: session
            ? `Session #${session.number} · ~${formatWaitShort(currentWait)} wait · ${lineCount} in line`
            : `~${formatWaitShort(currentWait)} wait · ${lineCount} in line`,
          badge: "Live",
          badgeClass: "live" as const,
          tone: "open" as const,
        }
      : queueState === "paused"
        ? {
            label: "Live queue",
            value: "Paused",
            meta: "New guests can't join — existing guests can still be called",
            badge: "Paused",
            badgeClass: "paused" as const,
            tone: "paused" as const,
          }
        : queueState === "ended"
          ? {
              label: "Live queue",
              value: "Closed",
              meta: endedSummary
                ? `Session #${endedSummary.number} · ${endedSummary.served} seated · ${endedSummary.left} left`
                : "Start a new session whenever you're ready",
              badge: "Closed",
              badgeClass: "ended" as const,
              tone: "closed" as const,
            }
          : {
              label: "Live queue",
              value: "Not started",
              meta: "Open the line to accept walk-ins and seat guests",
              badge: "Idle",
              badgeClass: "idle" as const,
              tone: "closed" as const,
            };

  const pulse = [
    {
      id: "waiting",
      label: "In line",
      value: waitingList.length,
      active: listFilter === "waiting",
      accent: waitingList.length > 0 && isLive,
    },
    {
      id: "seated",
      label: "Seated",
      value: seated.length,
      active: listFilter === "seated",
    },
    {
      id: "left",
      label: "Left",
      value: left.length,
      active: listFilter === "left",
    },
  ];

  const boardFilters = useMemo(
    () => [
      { id: "waiting" as const, label: "In line", count: waitingList.length },
      { id: "seated" as const, label: "Seated", count: seated.length },
      { id: "left" as const, label: "Left", count: left.length },
    ],
    [waitingList.length, seated.length, left.length],
  );

  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? null;

  const openGuest = useCallback((entry: QueueEntry) => {
    setSelectedEntryId(entry.id);
  }, []);

  const closeGuest = useCallback(() => {
    setSelectedEntryId(null);
  }, []);

  // Session state lives in localStorage, so rendering before hydration would
  // flash "Queue hasn't started yet" over a queue that is actually running.
  if (!hydrated) return <QueueHomeSkeleton />;

  return (
    <>
      <div className="tab-screen queue-home merchant-dashboard resv-home">
        <div className="tab-head queue-live-head merchant-dashboard-head">
          <div className="queue-live-copy">
            <h2 className="tab-title">Queue</h2>
            <p className="tab-sub">
              {session && showDashboard
                ? `Session #${session.number} · Started ${formatClock(session.startedAtMs)}${
                    startedByLabel(session) ? ` by ${startedByLabel(session)}` : ""
                  }`
                : queueState === "ended"
                  ? "Start a new session whenever you're ready for guests"
                  : called.length > 0
                    ? `${called.length} guest${called.length === 1 ? "" : "s"} called — waiting to seat`
                    : waitingList.length > 0
                      ? `${waitingList.length} in line · ~${formatWaitShort(currentWait)} wait`
                      : "Add walk-ins and call guests when their table is ready"}
            </p>
          </div>
          <div className="queue-session-actions">
            {queueState === "not_started" && (
              <button
                type="button"
                className="queue-session-btn queue-session-btn--start"
                onClick={startQueue}
              >
                <Play size={16} strokeWidth={2.6} />
                Start queue
              </button>
            )}
            {isLive && (
              <>
                <button
                  type="button"
                  className="queue-session-btn queue-session-btn--pause"
                  onClick={pauseQueue}
                >
                  <Pause size={16} strokeWidth={2.6} />
                  Pause
                </button>
                <button
                  type="button"
                  className="queue-session-btn queue-session-btn--end"
                  onClick={() => setSheet("end")}
                >
                  <Square size={15} strokeWidth={2.6} />
                  End
                </button>
              </>
            )}
            {isPaused && (
              <>
                <button
                  type="button"
                  className="queue-session-btn queue-session-btn--start"
                  onClick={resumeQueue}
                >
                  <Play size={16} strokeWidth={2.6} />
                  Resume
                </button>
                <button
                  type="button"
                  className="queue-session-btn queue-session-btn--end"
                  onClick={() => setSheet("end")}
                >
                  <Square size={15} strokeWidth={2.6} />
                  End
                </button>
              </>
            )}
            {queueState === "ended" && (
              <button
                type="button"
                className="queue-session-btn queue-session-btn--start"
                onClick={startQueue}
              >
                <Play size={16} strokeWidth={2.6} />
                Start new queue
              </button>
            )}
          </div>
        </div>

        <QueueStatusHero
          {...hero}
          pulse={pulse}
          onPulseSelect={(id) => {
            if (id === "waiting" || id === "seated" || id === "left") {
              setListFilter(id);
            }
          }}
        />

        {queueState === "ended" && endedSummary && (
          <section className="merchant-section queue-state-fade">
            <div className="merchant-section-head">
              <h3 className="merchant-section-label">Last session</h3>
            </div>
            {/* Same card as History → Sessions. Matching its look without
                matching its behaviour would be a trap, so this opens the same
                sheet: guests, per-guest timelines and delete. */}
            <button
              type="button"
              className="panel-card qhist-card qhist-card--clickable"
              onClick={() => setRecapOpen(true)}
            >
              <div className="qhist-card-head">
                <div className="qhist-card-copy">
                  <div className="qhist-card-title">
                    Session #{endedSummary.number}
                    <ChevronRight
                      size={16}
                      strokeWidth={2.4}
                      className="qhist-card-chevron"
                    />
                  </div>
                  <div className="qhist-card-meta">
                    <span className="qhist-card-sub">
                      {sessionWindow(
                        endedSummary.startedAtMs,
                        endedSummary.endedAtMs,
                      ).join(" · ")}
                    </span>
                    <ActorChip
                      name={endedSummary.startedByName}
                      role={endedSummary.startedByRole}
                      prefix="Started by"
                    />
                  </div>
                </div>
                {noGuests ? (
                  <span className="qhist-served-pill qhist-served-pill--none">
                    No guests joined
                  </span>
                ) : (
                  <span className="qhist-served-pill">
                    {endedSummary.served} served
                  </span>
                )}
              </div>

              {/* A row of zeroes reads as broken; the pill already said it. */}
              {noGuests ? null : (
                <div className="qhist-stats">
                  <div className="qhist-stat">
                    <span className="qhist-stat-value">{endedSummary.served}</span>
                    <span className="qhist-stat-label">Served</span>
                  </div>
                  <div className="qhist-stat">
                    <span className="qhist-stat-value">{endedSummary.left}</span>
                    <span className="qhist-stat-label">Left</span>
                  </div>
                  <div className="qhist-stat">
                    <span className="qhist-stat-value">
                      {waitSegments(endedSummary.avgWait).map((part) => (
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
                      {waitSegments(endedSummary.longestWait).map((part) => (
                        <Fragment key={part.unit}>
                          {part.value}
                          <span className="qhist-stat-unit">{part.unit}</span>
                        </Fragment>
                      ))}
                    </span>
                    <span className="qhist-stat-label">Longest</span>
                  </div>
                </div>
              )}
            </button>
          </section>
        )}

        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Quick actions</h3>
          </div>
          <div className="merchant-quick-actions merchant-quick-actions--all">
            <button
              type="button"
              className="queue-action"
              onClick={() => onShowQr("queue")}
              disabled={isPaused}
            >
              <span className="queue-action-icon queue-action-icon--accent">
                <QrCode size={18} strokeWidth={2.2} />
              </span>
              Show QR
            </button>

            {showDashboard ? (
              <button
                type="button"
                className="queue-action"
                onClick={() => openSheet("guest")}
                disabled={!isLive}
              >
                <span className="queue-action-icon">
                  <UserPlus size={18} strokeWidth={2.2} />
                </span>
                Add guest
              </button>
            ) : (
              <button
                type="button"
                className={`queue-action${reservationsEnabled ? "" : " is-locked"}`}
                aria-label={
                  reservationsEnabled
                    ? "Add reservation"
                    : "Add reservation — unlock Reservations"
                }
                onClick={() => {
                  if (!reservationsEnabled) {
                    onPurchaseProduct("reservation");
                    return;
                  }
                  openSheet("reservation");
                }}
              >
                {!reservationsEnabled ? (
                  <span className="queue-action-lock" aria-hidden>
                    <Lock size={11} strokeWidth={2.4} />
                  </span>
                ) : null}
                <span className="queue-action-icon">
                  <CalendarPlus size={18} strokeWidth={2.2} />
                </span>
                Add reservation
              </button>
            )}

            <button
              type="button"
              className="queue-action"
              onClick={() => onViewHistory?.()}
            >
              <span className="queue-action-icon">
                <History size={18} strokeWidth={2.2} />
              </span>
              History
            </button>
          </div>
        </section>

        {showDashboard && (
          <div className="queue-state-fade">
            <section className="merchant-section">
              <div className="merchant-section-head">
                <h3 className="merchant-section-label">Now serving</h3>
                <span className="merchant-section-meta">{lineCount} in line</span>
              </div>
              <button
                type="button"
                className="queue-call-next"
                onClick={callNext}
                disabled={!nextCallableEntry(entries)}
              >
                <Megaphone size={20} strokeWidth={2.3} />
                Call next customer
              </button>
            </section>

            <section className="merchant-section">
              <div className="merchant-section-head">
                <h3 className="merchant-section-label">Queue</h3>
                <span className="merchant-section-meta">{activeList.length} shown</span>
              </div>
              <div className="queue-board">
                <label className="merchant-customer-search-field queue-search-field">
                  <Search size={16} strokeWidth={2.2} aria-hidden />
                  <input
                    type="search"
                    className="merchant-customer-search-input"
                    placeholder="Search by name or phone…"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    autoComplete="off"
                    enterKeyHint="search"
                    aria-label="Search queue guests"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      className="merchant-customer-search-clear"
                      aria-label="Clear search"
                      onClick={() => setSearchQuery("")}
                    >
                      <X size={14} strokeWidth={2.4} />
                    </button>
                  ) : null}
                </label>

                <div className="queue-tabs" role="tablist" aria-label="Queue filters">
                  {boardFilters.map(({ id, label, count }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={listFilter === id}
                      className={`queue-tab${listFilter === id ? " active" : ""}`}
                      onClick={() => setListFilter(id)}
                    >
                      <span>{label}</span>
                      <span className="queue-tab-badge">{count}</span>
                    </button>
                  ))}
                </div>

                {activeList.length === 0 ? (
                  <p className="queue-list-empty">{emptyCopy}</p>
                ) : (
                  <div className="queue-list">
                    {activeList.map((entry, i) => (
                      <QueueEntryCard
                        key={entry.id}
                        entry={entry}
                        token={
                          listFilter === "waiting"
                            ? waitingList.findIndex((e) => e.id === entry.id) + 1 || i + 1
                            : i + 1
                        }
                        pendingSeating={
                          pendingResolve?.entryId === entry.id &&
                          pendingResolve.action === "seated"
                        }
                        pendingLeaving={
                          pendingResolve?.entryId === entry.id &&
                          pendingResolve.action === "left"
                        }
                        actionsBusy={actionsBusy}
                        onOpen={openGuest}
                        onCall={callEntry}
                        onSeated={markServed}
                        onLeft={markLeft}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <BottomSheet
        open={sheet === "guest"}
        onClose={closeSheet}
        labelledBy="queue-guest-title"
        className="merchant-theme"
      >
        <form className="queue-sheet" onSubmit={addGuest}>
          <div className="queue-sheet-head">
            <h3 id="queue-guest-title" className="queue-sheet-title">
              Add guest
            </h3>
            <p className="queue-sheet-sub">Walk-in party joins the waiting list</p>
          </div>

          <div className="queue-sheet-form">
            <label className="auth-field">
              <span className="auth-label">Guest name</span>
              <input
                className="auth-input"
                type="text"
                placeholder="e.g. Tanmay Kapse"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                autoFocus
              />
            </label>

            <label className="auth-field">
              <span className="auth-label">Phone</span>
              <input
                className="auth-input"
                type="tel"
                inputMode="numeric"
                placeholder="10-digit mobile"
                value={guestPhone}
                onChange={(e) => setGuestPhone(nationalMobileInputDigits(e.target.value))}
                required
              />
            </label>

            <label className="auth-field">
              <span className="auth-label">Email (optional)</span>
              <input
                className="auth-input"
                type="email"
                placeholder="guest@email.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
              />
            </label>

            <div className="queue-party-row">
              <div className="queue-party-copy">
                <span className="queue-party-label">Number of persons</span>
                <span className="queue-party-hint">How many in this party?</span>
              </div>
              <div className="queue-stepper">
                <button
                  type="button"
                  className="queue-stepper-btn"
                  aria-label="Decrease party size"
                  onClick={() => setGuestParty((n) => Math.max(1, n - 1))}
                  disabled={guestParty <= 1}
                >
                  <Minus size={16} strokeWidth={2.4} />
                </button>
                <span className="queue-stepper-value">{guestParty}</span>
                <button
                  type="button"
                  className="queue-stepper-btn"
                  aria-label="Increase party size"
                  onClick={() => setGuestParty((n) => Math.min(20, n + 1))}
                  disabled={guestParty >= 20}
                >
                  <Plus size={16} strokeWidth={2.4} />
                </button>
              </div>
            </div>

            <button type="submit" className="cta-btn merchant-cta-accent">
              <Plus size={17} strokeWidth={2.4} />
              Add to queue
            </button>
          </div>
        </form>
      </BottomSheet>

      <BottomSheet
        open={sheet === "reservation"}
        onClose={closeSheet}
        labelledBy="queue-res-title"
        className="merchant-theme"
      >
        <form className="queue-sheet" onSubmit={addReservation}>
          <div className="queue-sheet-head">
            <h3 id="queue-res-title" className="queue-sheet-title">
              Add reservation
            </h3>
            <p className="queue-sheet-sub">Book a table and hold a spot in the line</p>
          </div>

          <div className="queue-sheet-form">
            <label className="auth-field">
              <span className="auth-label">Guest name</span>
              <input
                className="auth-input"
                type="text"
                placeholder="e.g. Rahul Verma"
                value={resName}
                onChange={(e) => setResName(e.target.value)}
                autoFocus
              />
            </label>

            <label className="auth-field">
              <span className="auth-label">Phone (optional)</span>
              <input
                className="auth-input"
                type="tel"
                placeholder="10-digit mobile"
                value={resPhone}
                onChange={(e) => setResPhone(nationalMobileInputDigits(e.target.value))}
                inputMode="numeric"
              />
            </label>

            <div className="queue-party-row">
              <div className="queue-party-copy">
                <span className="queue-party-label">Number of persons</span>
                <span className="queue-party-hint">How many in this party?</span>
              </div>
              <div className="queue-stepper">
                <button
                  type="button"
                  className="queue-stepper-btn"
                  aria-label="Decrease party size"
                  onClick={() => setResParty((n) => Math.max(1, n - 1))}
                  disabled={resParty <= 1}
                >
                  <Minus size={16} strokeWidth={2.4} />
                </button>
                <span className="queue-stepper-value">{resParty}</span>
                <button
                  type="button"
                  className="queue-stepper-btn"
                  aria-label="Increase party size"
                  onClick={() => setResParty((n) => Math.min(20, n + 1))}
                  disabled={resParty >= 20}
                >
                  <Plus size={16} strokeWidth={2.4} />
                </button>
              </div>
            </div>

            <label className="auth-field">
              <span className="auth-label">Reservation time</span>
              <input
                className="auth-input"
                type="time"
                value={resTime}
                onChange={(e) => setResTime(e.target.value)}
              />
            </label>

            <button type="submit" className="cta-btn merchant-cta-accent">
              <CalendarPlus size={17} strokeWidth={2.4} />
              Add reservation
            </button>
          </div>
        </form>
      </BottomSheet>

      <BottomSheet
        open={Boolean(selectedEntry)}
        onClose={closeGuest}
        labelledBy="queue-guest-detail-title"
        className="merchant-theme"
      >
        {selectedEntry ? (
          <div className="queue-sheet queue-guest-detail">
            <div className="queue-sheet-head qcust-head">
              <div className="merchant-avatar">
                {initials(selectedEntry.name)}
              </div>
              <div className="qcust-head-copy">
                <h3 id="queue-guest-detail-title" className="qcust-head-name">
                  {selectedEntry.name}
                </h3>
                <p className="qcust-head-meta">
                  <span>{guestStatusLabel(selectedEntry.status)}</span>
                  <span>{partyLabel(selectedEntry.partySize)}</span>
                </p>
              </div>
            </div>

            <div className="qcust-contact">
              {selectedEntry.phone ? (
                <a
                  className="qcust-contact-row"
                  href={`tel:${selectedEntry.phone.replace(/[^\d+]/g, "")}`}
                >
                  <span className="qcust-contact-icon" aria-hidden="true">
                    <Phone size={16} strokeWidth={2.2} />
                  </span>
                  <span className="qcust-contact-copy">
                    <span className="qcust-contact-label">Phone</span>
                    <span className="qcust-contact-value">{selectedEntry.phone}</span>
                  </span>
                </a>
              ) : (
                <div className="qcust-contact-row is-empty">
                  <span className="qcust-contact-icon" aria-hidden="true">
                    <Phone size={16} strokeWidth={2.2} />
                  </span>
                  <span className="qcust-contact-copy">
                    <span className="qcust-contact-label">Phone</span>
                    <span className="qcust-contact-value">Not provided</span>
                  </span>
                </div>
              )}
            </div>

            {selectedEntry.status !== "seated" &&
            selectedEntry.status !== "left" ? (
              <div className="queue-entry-actions queue-guest-detail-actions">
                {selectedEntry.status === "called" ? (
                  <button
                    type="button"
                    className="queue-act queue-act--served"
                    disabled={actionsBusy}
                    onClick={() => {
                      markServed(selectedEntry);
                      closeGuest();
                    }}
                  >
                    <Check size={14} strokeWidth={2.3} />
                    Seated
                  </button>
                ) : selectedEntry.status !== "held" ? (
                  <button
                    type="button"
                    className="queue-act queue-act--call"
                    disabled={actionsBusy}
                    onClick={() => {
                      callEntry(selectedEntry);
                      closeGuest();
                    }}
                  >
                    <Megaphone size={14} strokeWidth={2.3} />
                    Call
                  </button>
                ) : null}
                <button
                  type="button"
                  className="queue-act queue-act--left"
                  disabled={actionsBusy}
                  onClick={() => {
                    markLeft(selectedEntry);
                    closeGuest();
                  }}
                >
                  <X size={14} strokeWidth={2.3} />
                  {selectedEntry.status === "held" ? "No show" : "Left"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={sheet === "end"}
        onClose={closeSheet}
        labelledBy="queue-end-title"
        className="merchant-theme"
      >
        <div className="queue-sheet queue-end-sheet">
          <div className="queue-sheet-head">
            <h3 id="queue-end-title" className="queue-sheet-title">
              End queue?
            </h3>
            <p className="queue-sheet-sub">
              Wrapping up{session ? ` session #${session.number}` : " this session"}.
            </p>
          </div>

          <ul className="queue-end-list">
            <li>
              <Check size={15} strokeWidth={2.6} />
              Finish serving the current customer.
            </li>
            <li>
              <Check size={15} strokeWidth={2.6} />
              Mark all remaining waiting &amp; called guests as left.
            </li>
            <li>
              <Check size={15} strokeWidth={2.6} />
              Archive this queue session &amp; save analytics.
            </li>
          </ul>

          <div className="queue-end-actions">
            <button type="button" className="queue-end-cancel" onClick={closeSheet}>
              Cancel
            </button>
            <button
              type="button"
              className="cta-btn queue-end-confirm"
              onClick={confirmEndQueue}
            >
              <Square size={15} strokeWidth={2.6} />
              End queue
            </button>
          </div>
        </div>
      </BottomSheet>

      <QueueSessionHistorySheet
        session={recapOpen ? endedRecord : null}
        branchId={activeBranchId}
        role={role}
        onClose={() => setRecapOpen(false)}
        onDeleted={(deleted) => {
          removeQueueSessionRecord(queueUrl, activeBranchId, deleted);
          setRecapOpen(false);
          // The card is gone, but the queue is still closed — the header keeps
          // offering Start, so the screen stays coherent with no recap.
          setEndedSummary(null);
        }}
      />
    </>
  );
}
