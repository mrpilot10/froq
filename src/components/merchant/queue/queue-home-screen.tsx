"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import {
  BarChart3,
  Bell,
  CalendarPlus,
  Check,
  Copy,
  Download,
  Megaphone,
  Minus,
  Pause,
  Play,
  Plus,
  QrCode,
  Square,
  Timer,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import {
  acceptWindowMs,
  getAcceptWindowMinutes,
  getWaitEstimateMeta,
  recordActualWaitMinutes,
  reminderOffsetsMs,
  REMINDER_COUNT,
} from "@/lib/merchant/queue-settings";
import type { MerchantProfile } from "@/lib/merchant/types";
import { joinUrlFor } from "../use-merchant-qr";
import { useMerchantWorkspace } from "../merchant-workspace-context";

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
  remindersSent?: number;
  seatedAtMs?: number;
  leftAtMs?: number;
  status: "called" | "waiting" | "seated" | "left";
  kind: "walkin" | "reservation";
  reservationTime?: string;
}

type SheetKind = "guest" | "reservation" | "qr" | "end" | null;
type QueueListFilter = "waiting" | "seated" | "left";
type QueueState = "not_started" | "live" | "paused" | "ended";

interface QueueSession {
  number: number;
  startedAtMs: number;
}

interface EndedSummary {
  number: number;
  startedAtMs: number;
  endedAtMs: number;
  served: number;
  left: number;
  avgWait: number;
  longestWait: number;
}

interface PersistedQueue {
  queueState: QueueState;
  session: QueueSession | null;
  endedSummary: EndedSummary | null;
  entries: QueueEntry[];
}

const STATE_META: Record<QueueState, { label: string; cls: string }> = {
  not_started: { label: "Queue not started", cls: "idle" },
  live: { label: "Queue live", cls: "live" },
  paused: { label: "Queue paused", cls: "paused" },
  ended: { label: "Queue closed", cls: "ended" },
};

function todayAt(hours: number, minutes: number) {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

function formatClock(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function makeCalledDemo(): QueueEntry {
  const calledAtMs = Date.now() - 2 * 60_000;
  const windowMs = acceptWindowMs();
  return {
    id: "q1",
    name: "Tanmay Kapse",
    phone: "9004857320",
    partySize: 2,
    joinedAtMs: Date.now() - 16 * 60_000,
    calledAtMs,
    acceptByMs: calledAtMs + windowMs,
    remindersSent: 0,
    status: "called",
    kind: "walkin",
  };
}

const INITIAL_ENTRIES: QueueEntry[] = [
  makeCalledDemo(),
  {
    id: "q2",
    name: "Mansi Mistry",
    phone: "7400240079",
    partySize: 4,
    joinedAtMs: Date.now() - 9 * 60_000,
    status: "waiting",
    kind: "walkin",
  },
  {
    id: "q3",
    name: "Rahul Verma",
    phone: "9820011234",
    partySize: 2,
    joinedAtMs: Date.now() - 4 * 60_000,
    status: "waiting",
    kind: "reservation",
    reservationTime: "8:00 PM",
  },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function waitMinutes(joinedAtMs: number, now: number) {
  return Math.max(0, Math.floor((now - joinedAtMs) / 60_000));
}

function partyLabel(size: number) {
  return `Party of ${size}`;
}

function waitLabel(mins: number) {
  if (mins < 1) return "just joined";
  return `waiting ${mins} min`;
}

function formatCountdown(msLeft: number) {
  const totalSec = Math.max(0, Math.ceil(msLeft / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function QueueHomeScreen({ profile, onViewHistory }: QueueHomeScreenProps) {
  const [entries, setEntries] = useState<QueueEntry[]>(INITIAL_ENTRIES);
  const [queueState, setQueueState] = useState<QueueState>("live");
  const [session, setSession] = useState<QueueSession | null>({
    number: 128,
    startedAtMs: todayAt(9, 2),
  });
  const [endedSummary, setEndedSummary] = useState<EndedSummary | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [listFilter, setListFilter] = useState<QueueListFilter>("waiting");
  const [now, setNow] = useState(() => Date.now());
  const [acceptMinutes, setAcceptMinutes] = useState(15);
  const [minsPerParty, setMinsPerParty] = useState(10);
  const [waitSource, setWaitSource] = useState<"initial" | "learned">("initial");
  const [waitSamples, setWaitSamples] = useState(0);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const remindedToastRef = useRef<Set<string>>(new Set());

  const isLive = queueState === "live";
  const isPaused = queueState === "paused";
  const showDashboard = isLive || isPaused;

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

  const startQueue = () => {
    const number = endedSummary
      ? endedSummary.number + 1
      : session
        ? session.number
        : 128;
    setSession({ number, startedAtMs: Date.now() });
    setEndedSummary(null);
    // Fresh session: keep pending reservations, drop everyone else. Numbers reset.
    setEntries((prev) =>
      prev.filter((e) => e.kind === "reservation" && e.status === "waiting"),
    );
    remindedToastRef.current.clear();
    setListFilter("waiting");
    setQueueState("live");
    toast.success(`Queue session #${number} started`);
  };

  const pauseQueue = () => {
    setQueueState("paused");
    toast("Queue paused — new guests can't join");
  };

  const resumeQueue = () => {
    setQueueState("live");
    toast.success("Queue resumed — accepting guests");
  };

  const confirmEndQueue = () => {
    const endedAtMs = Date.now();
    const updated = entries.map((e) =>
      e.status === "waiting" || e.status === "called"
        ? { ...e, status: "left" as const, leftAtMs: endedAtMs }
        : e,
    );
    const seatedNow = updated.filter((e) => e.status === "seated");
    const leftNow = updated.filter((e) => e.status === "left");
    const waits = seatedNow.map((e) =>
      Math.max(0, Math.round(((e.seatedAtMs ?? endedAtMs) - e.joinedAtMs) / 60_000)),
    );
    const avgWait = waits.length
      ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
      : 0;
    const longestWait = waits.length ? Math.max(...waits) : 0;

    setEntries(updated);
    setEndedSummary({
      number: session?.number ?? 128,
      startedAtMs: session?.startedAtMs ?? todayAt(9, 2),
      endedAtMs,
      served: seatedNow.length,
      left: leftNow.length,
      avgWait,
      longestWait,
    });
    setQueueState("ended");
    setSheet(null);
    toast.success("Queue ended — session archived");
  };

  const { activeBranchId } = useMerchantWorkspace();
  const queueUrl = useMemo(() => joinUrlFor(profile, "queue"), [profile]);
  // Each branch keeps its own live session (queues run independently).
  const sessionKey = useMemo(
    () => `froq.queue.session:${queueUrl}:${activeBranchId ?? "all"}`,
    [queueUrl, activeBranchId],
  );

  // Hydrate the persisted session so ending / pausing survives navigation & reloads.
  useEffect(() => {
    setHydrated(false);
    try {
      const raw = window.localStorage.getItem(sessionKey);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistedQueue>;
        if (saved && saved.queueState) {
          setQueueState(saved.queueState);
          setSession(saved.session ?? null);
          setEndedSummary(saved.endedSummary ?? null);
          if (Array.isArray(saved.entries)) setEntries(saved.entries);
        }
      }
    } catch {
      /* ignore malformed storage */
    }
    setHydrated(true);
  }, [sessionKey]);

  // Persist the session whenever it changes (after hydration to avoid clobbering it).
  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: PersistedQueue = { queueState, session, endedSummary, entries };
      window.localStorage.setItem(sessionKey, JSON.stringify(payload));
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [hydrated, sessionKey, queueState, session, endedSummary, entries]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(queueUrl, {
      margin: 1,
      width: 440,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setQrUrl(url);
      })
      .catch(() => {
        if (active) setQrUrl(null);
      });
    return () => {
      active = false;
    };
  }, [queueUrl]);

  useEffect(() => {
    setAcceptMinutes(getAcceptWindowMinutes());
    const meta = getWaitEstimateMeta();
    setMinsPerParty(meta.minutes);
    setWaitSource(meta.source);
    setWaitSamples(meta.samples);
    const onSettings = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          acceptMinutes?: number;
          estimatedWaitMinutes?: number;
          waitSource?: "initial" | "learned";
          waitSamples?: number;
        }>
      ).detail;
      if (detail?.acceptMinutes) setAcceptMinutes(detail.acceptMinutes);
      else setAcceptMinutes(getAcceptWindowMinutes());
      if (detail?.estimatedWaitMinutes != null) {
        setMinsPerParty(detail.estimatedWaitMinutes);
        if (detail.waitSource) setWaitSource(detail.waitSource);
        if (detail.waitSamples != null) setWaitSamples(detail.waitSamples);
      } else {
        const next = getWaitEstimateMeta();
        setMinsPerParty(next.minutes);
        setWaitSource(next.source);
        setWaitSamples(next.samples);
      }
    };
    window.addEventListener("froq:queue-settings", onSettings);
    return () => window.removeEventListener("froq:queue-settings", onSettings);
  }, []);

  // Tick every second while guests are called (countdown + auto-reminders).
  useEffect(() => {
    const hasCalled = entries.some((e) => e.status === "called");
    const id = window.setInterval(
      () => setNow(Date.now()),
      hasCalled ? 1000 : 30_000,
    );
    return () => window.clearInterval(id);
  }, [entries]);

  // Fire evenly spaced reminders (3) and mark as left when the accept window ends.
  useEffect(() => {
    const windowMs = acceptWindowMs(acceptMinutes);
    const offsets = reminderOffsetsMs(windowMs);

    setEntries((prev) => {
      let changed = false;
      const next = prev.flatMap((entry) => {
        if (entry.status !== "called" || !entry.calledAtMs || !entry.acceptByMs) return [entry];

        const elapsed = now - entry.calledAtMs;
        let remindersSent = entry.remindersSent ?? 0;

        while (remindersSent < REMINDER_COUNT && elapsed >= offsets[remindersSent]) {
          remindersSent += 1;
          changed = true;
          const toastKey = `${entry.id}:${remindersSent}`;
          if (!remindedToastRef.current.has(toastKey)) {
            remindedToastRef.current.add(toastKey);
            toast(`Reminder ${remindersSent}/${REMINDER_COUNT} sent to ${entry.name}`);
          }
        }

        if (now >= entry.acceptByMs) {
          changed = true;
          toast.error(`${entry.name} didn't arrive — marked as left`);
          return [{ ...entry, status: "left" as const, leftAtMs: now, remindersSent }];
        }

        if (remindersSent !== (entry.remindersSent ?? 0)) {
          return [{ ...entry, remindersSent }];
        }
        return [entry];
      });

      return changed ? next : prev;
    });
  }, [now, acceptMinutes]);

  const called = entries.filter((e) => e.status === "called");
  const waiting = entries.filter((e) => e.status === "waiting");
  const seated = entries.filter((e) => e.status === "seated");
  const left = entries.filter((e) => e.status === "left");
  const servedCount = seated.length;

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
    setEntries((prev) => [
      ...prev,
      {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
        name: trimmed,
        phone,
        email: email || undefined,
        partySize: guestParty,
        joinedAtMs: Date.now(),
        status: "waiting",
        kind: "walkin",
      },
    ]);
    toast.success(`${trimmed} added to the queue`);
    resetGuestForm();
    closeSheet();
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
    setEntries((prev) => [
      ...prev,
      {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
        name: trimmed,
        phone: resPhone.trim(),
        partySize: resParty,
        joinedAtMs: Date.now(),
        status: "waiting",
        kind: "reservation",
        reservationTime: resTime,
      },
    ]);
    toast.success(`Reservation for ${trimmed} added`);
    resetResForm();
    closeSheet();
  };

  const markAsCalled = useCallback(
    (entry: QueueEntry): QueueEntry => {
      const calledAtMs = Date.now();
      const windowMs = acceptWindowMs(acceptMinutes);
      return {
        ...entry,
        status: "called",
        calledAtMs,
        acceptByMs: calledAtMs + windowMs,
        remindersSent: 0,
      };
    },
    [acceptMinutes],
  );

  const callNext = useCallback(() => {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.status === "waiting");
      if (idx === -1) {
        toast("No one is waiting in the queue");
        return prev;
      }
      const next = [...prev];
      next[idx] = markAsCalled(next[idx]);
      toast.success(
        `${next[idx].name} has been called · ${acceptMinutes} min to arrive`,
      );
      return next;
    });
  }, [markAsCalled, acceptMinutes]);

  const callEntry = (entry: QueueEntry) => {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? markAsCalled(e) : e)));
    toast.success(`${entry.name} has been called · ${acceptMinutes} min to arrive`);
  };

  const markServed = (entry: QueueEntry) => {
    const seatedAtMs = Date.now();
    const actualWait = Math.max(0, Math.round((seatedAtMs - entry.joinedAtMs) / 60_000));
    const learned = recordActualWaitMinutes(actualWait);
    const meta = getWaitEstimateMeta();
    setMinsPerParty(learned);
    setWaitSource(meta.source);
    setWaitSamples(meta.samples);
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id ? { ...e, status: "seated", seatedAtMs } : e,
      ),
    );
    setListFilter("seated");
    toast.success(`${entry.name} marked as seated · wait was ${actualWait} min`);
  };

  const markLeft = (entry: QueueEntry) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id ? { ...e, status: "left", leftAtMs: Date.now() } : e,
      ),
    );
    setListFilter("left");
    toast(`${entry.name} marked as left`);
  };

  const remind = (entry: QueueEntry) => {
    const sent = (entry.remindersSent ?? 0) + 1;
    if (sent > REMINDER_COUNT) {
      toast("All reminders already sent");
      return;
    }
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, remindersSent: sent } : e)),
    );
    toast.success(`Reminder ${sent}/${REMINDER_COUNT} sent to ${entry.name}`);
  };

  const avgPerTable = minsPerParty;
  const currentWait = waiting.length * avgPerTable;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(queueUrl);
      toast.success("Queue link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const downloadQr = () => {
    if (!qrUrl) return;
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = "queue-qr.png";
    link.click();
  };

  const renderEntry = (entry: QueueEntry, token: number) => {
    const mins = waitMinutes(entry.joinedAtMs, now);
    const isSeated = entry.status === "seated";
    const isLeft = entry.status === "left";
    const calledCard = entry.status === "called";
    const msLeft = calledCard && entry.acceptByMs ? entry.acceptByMs - now : 0;
    const remindersSent = entry.remindersSent ?? 0;
    const timeLabel = (ms?: number) =>
      ms
        ? new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : "";
    const meta = isSeated
      ? `${partyLabel(entry.partySize)} · seated${entry.seatedAtMs ? ` · ${timeLabel(entry.seatedAtMs)}` : ""}`
      : isLeft
        ? `${partyLabel(entry.partySize)} · left${entry.leftAtMs ? ` · ${timeLabel(entry.leftAtMs)}` : ""}`
        : calledCard
          ? `${partyLabel(entry.partySize)} · called · waiting to enter`
          : `${partyLabel(entry.partySize)} · ${waitLabel(mins)}`;

    return (
      <div
        key={entry.id}
        className={`panel-card queue-entry${calledCard ? " queue-entry--called" : ""}${
          isSeated ? " queue-entry--seated" : ""
        }${isLeft ? " queue-entry--left" : ""}`}
      >
        <span className="queue-token">#{token}</span>
        <div className="merchant-avatar">{initials(entry.name)}</div>
        <div className="queue-entry-copy">
          <div className="merchant-list-title">
            {entry.name}
            {entry.kind === "reservation" && (
              <span className="queue-entry-badge">Reservation</span>
            )}
          </div>
          <div className="merchant-list-sub">{entry.phone || "No phone"}</div>
          <div className="queue-entry-meta">
            {meta}
            {entry.kind === "reservation" && entry.reservationTime && !isSeated && !isLeft
              ? ` · ${entry.reservationTime}`
              : ""}
          </div>
        </div>

        {(calledCard || (!isSeated && !isLeft)) && (
          <div className="queue-entry-trailing">
            {calledCard && (
              <div
                className={`queue-timer${msLeft < 60_000 ? " is-urgent" : ""}`}
                aria-label={`${formatCountdown(msLeft)} left to arrive`}
              >
                <Timer size={14} strokeWidth={2.4} />
                <span className="queue-timer-value">{formatCountdown(msLeft)}</span>
              </div>
            )}

            {!isSeated && !isLeft && (
              <div className="queue-entry-actions">
                {calledCard ? (
                  <>
                    <button
                      type="button"
                      className="queue-act queue-act--remind"
                      onClick={() => remind(entry)}
                      disabled={remindersSent >= REMINDER_COUNT}
                    >
                      <Bell size={14} strokeWidth={2.3} />
                      Remind
                    </button>
                    <button type="button" className="queue-act queue-act--served" onClick={() => markServed(entry)}>
                      <Check size={14} strokeWidth={2.3} />
                      Seated
                    </button>
                    <button type="button" className="queue-act queue-act--left" onClick={() => markLeft(entry)}>
                      <X size={14} strokeWidth={2.3} />
                      Left
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="queue-act queue-act--call" onClick={() => callEntry(entry)}>
                      <Megaphone size={14} strokeWidth={2.3} />
                      Call
                    </button>
                    <button type="button" className="queue-act queue-act--left" onClick={() => markLeft(entry)}>
                      <X size={14} strokeWidth={2.3} />
                      Left
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Waiting filter shows called guests first, then the rest of the line.
  const waitingList = [...called, ...waiting];

  const filters: Array<{ id: QueueListFilter; label: string; count: number }> = [
    { id: "waiting", label: "Waiting", count: waitingList.length },
    { id: "seated", label: "Seated", count: seated.length },
    { id: "left", label: "Left", count: left.length },
  ];

  const activeList =
    listFilter === "waiting" ? waitingList : listFilter === "seated" ? seated : left;
  const emptyCopy =
    listFilter === "waiting"
      ? "The line is empty."
      : listFilter === "seated"
        ? "No seated guests yet."
        : "No guests have left.";

  return (
    <>
      <div className="tab-screen queue-home merchant-dashboard">
        <div className="tab-head queue-live-head merchant-dashboard-head">
          <div className="queue-live-copy">
            <div className="queue-live-titlerow">
              <h2 className="tab-title">Live queue</h2>
              <span
                className={`queue-state-badge queue-state-badge--${STATE_META[queueState].cls}`}
              >
                <span className="queue-state-dot" aria-hidden="true" />
                {STATE_META[queueState].label}
              </span>
            </div>
            <p className="tab-sub">
              {session && showDashboard
                ? `Session #${session.number} · Started ${formatClock(session.startedAtMs)}`
                : queueState === "ended" && endedSummary
                  ? `Session #${endedSummary.number} · Archived`
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

        {queueState === "not_started" && (
          <section className="merchant-section queue-state-fade">
            <div className="panel-card queue-empty-card">
              <span className="queue-empty-icon">
                <Play size={26} strokeWidth={2.4} />
              </span>
              <h3 className="queue-empty-title">Queue hasn&apos;t started yet</h3>
              <p className="queue-empty-sub">
                Start a new queue session to begin accepting guests.
              </p>
              <button
                type="button"
                className="cta-btn merchant-cta-accent queue-empty-cta"
                onClick={startQueue}
              >
                <Play size={17} strokeWidth={2.5} />
                Start queue
              </button>
            </div>
          </section>
        )}

        {queueState === "ended" && endedSummary && (
          <section className="merchant-section queue-state-fade">
            <div className="panel-card queue-summary-card">
              <div className="queue-summary-head">
                <span className="queue-summary-eyebrow">Today&apos;s queue completed</span>
                <span className="queue-summary-session">Session #{endedSummary.number}</span>
              </div>
              <div className="queue-summary-times">
                <div className="queue-summary-time">
                  <span className="queue-summary-time-label">Started</span>
                  <span className="queue-summary-time-value">
                    {formatClock(endedSummary.startedAtMs)}
                  </span>
                </div>
                <div className="queue-summary-time">
                  <span className="queue-summary-time-label">Ended</span>
                  <span className="queue-summary-time-value">
                    {formatClock(endedSummary.endedAtMs)}
                  </span>
                </div>
              </div>
              <div className="queue-summary-divider" />
              <div className="queue-summary-stats">
                <div className="queue-summary-stat">
                  <span className="queue-summary-stat-value">{endedSummary.served}</span>
                  <span className="queue-summary-stat-label">Guests served</span>
                </div>
                <div className="queue-summary-stat">
                  <span className="queue-summary-stat-value">{endedSummary.left}</span>
                  <span className="queue-summary-stat-label">Guests left</span>
                </div>
                <div className="queue-summary-stat">
                  <span className="queue-summary-stat-value">
                    {endedSummary.avgWait}
                    <span className="queue-summary-stat-unit">min</span>
                  </span>
                  <span className="queue-summary-stat-label">Average wait</span>
                </div>
                <div className="queue-summary-stat">
                  <span className="queue-summary-stat-value">
                    {endedSummary.longestWait}
                    <span className="queue-summary-stat-unit">min</span>
                  </span>
                  <span className="queue-summary-stat-label">Longest wait</span>
                </div>
              </div>
              <div className="queue-summary-divider" />
              <button
                type="button"
                className="cta-btn merchant-cta-accent queue-summary-cta"
                onClick={startQueue}
              >
                <Play size={17} strokeWidth={2.5} />
                Start new queue
              </button>
            </div>
          </section>
        )}

        {showDashboard && (
          <div className="queue-state-fade">
            {isPaused && (
              <div className="queue-paused-banner">
                <span className="queue-paused-icon">
                  <Pause size={18} strokeWidth={2.4} />
                </span>
                <div className="queue-paused-copy">
                  <strong>Queue is paused</strong>
                  <p>New guests can&apos;t join. Existing guests can still be called and seated.</p>
                </div>
              </div>
            )}

            <section className="merchant-section">
              <div className="merchant-section-head">
                <h3 className="merchant-section-label">Wait time</h3>
                <span className="merchant-section-meta">{waiting.length} in line</span>
              </div>
              <div className="merchant-ltv-card queue-wait-card">
                <div className="merchant-ltv-head">
                  <span className="merchant-ltv-eyebrow">Current wait</span>
                </div>
                <div className="merchant-ltv-value queue-wait-value">
                  {currentWait}
                  <span className="queue-wait-unit">min</span>
                </div>
                <p className="queue-wait-sub">
                  {waiting.length} {waiting.length === 1 ? "party" : "parties"} in line ·{" "}
                  {avgPerTable} min per party
                  {waitSource === "learned"
                    ? ` · learned from ${waitSamples} seating${waitSamples === 1 ? "" : "s"}`
                    : " · your estimate"}
                </p>
                <div className="merchant-ltv-metrics queue-wait-tiles">
                  <div className="merchant-ltv-tile queue-wait-tile">
                    <span className="merchant-ltv-tile-value">{waiting.length}</span>
                    <span className="merchant-ltv-tile-label">In line</span>
                  </div>
                  <div className="merchant-ltv-tile queue-wait-tile">
                    <span className="merchant-ltv-tile-value">{called.length}</span>
                    <span className="merchant-ltv-tile-label">Called</span>
                  </div>
                  <div className="merchant-ltv-tile queue-wait-tile">
                    <span className="merchant-ltv-tile-value">{servedCount}</span>
                    <span className="merchant-ltv-tile-label">Seated</span>
                  </div>
                  <div className="merchant-ltv-tile queue-wait-tile">
                    <span className="merchant-ltv-tile-value">{left.length}</span>
                    <span className="merchant-ltv-tile-label">Left</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Quick actions</h3>
          </div>
          <div className="queue-actions">
            {queueState === "not_started" || queueState === "ended" ? (
              <button type="button" className="queue-action" onClick={startQueue}>
                <span className="queue-action-icon queue-action-icon--accent">
                  <Play size={18} strokeWidth={2.2} />
                </span>
                {queueState === "ended" ? "Start new queue" : "Start queue"}
              </button>
            ) : (
              <button
                type="button"
                className="queue-action"
                onClick={() => openSheet("guest")}
                disabled={!isLive}
              >
                <span className="queue-action-icon queue-action-icon--accent">
                  <UserPlus size={18} strokeWidth={2.2} />
                </span>
                Add guest
              </button>
            )}

            <button
              type="button"
              className="queue-action"
              onClick={() => openSheet("reservation")}
            >
              <span className="queue-action-icon">
                <CalendarPlus size={18} strokeWidth={2.2} />
              </span>
              Add reservation
            </button>

            {queueState === "ended" ? (
              <button
                type="button"
                className="queue-action"
                onClick={() => onViewHistory?.()}
              >
                <span className="queue-action-icon">
                  <BarChart3 size={18} strokeWidth={2.2} />
                </span>
                View history
              </button>
            ) : (
              <button
                type="button"
                className="queue-action"
                onClick={() => openSheet("qr")}
                disabled={isPaused}
              >
                <span className="queue-action-icon">
                  <QrCode size={18} strokeWidth={2.2} />
                </span>
                Show QR
              </button>
            )}
          </div>
        </section>

        {showDashboard && (
          <div className="queue-state-fade">
            <section className="merchant-section">
              <div className="merchant-section-head">
                <h3 className="merchant-section-label">Now serving</h3>
                <span className="merchant-section-meta">{waiting.length} waiting</span>
              </div>
              <button
                type="button"
                className="queue-call-next"
                onClick={callNext}
                disabled={waiting.length === 0}
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
                <div className="queue-tabs" role="tablist" aria-label="Queue filters">
                  {filters.map(({ id, label, count }) => (
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
                    {activeList.map((entry, i) => renderEntry(entry, i + 1))}
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
                placeholder="10-digit mobile"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
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
                onChange={(e) => setResPhone(e.target.value)}
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
        open={sheet === "qr"}
        onClose={closeSheet}
        labelledBy="queue-qr-title"
        className="merchant-theme"
      >
        <div className="queue-sheet queue-sheet-qr">
          <div className="queue-sheet-head">
            <h3 id="queue-qr-title" className="queue-sheet-title">
              Queue QR
            </h3>
            <p className="queue-sheet-sub">
              Guests scan this to join {profile.businessName}&apos;s live queue
            </p>
          </div>

          <div className="merchant-qr-frame queue-qr">
            {qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="merchant-qr-img" src={qrUrl} alt="Queue join QR code" width={200} height={200} />
            ) : (
              <div className="merchant-qr-skeleton" aria-hidden="true" />
            )}
          </div>

          <div className="queue-sheet-url">{queueUrl}</div>

          <div className="queue-sheet-actions">
            <button type="button" className="queue-share-btn" onClick={copyLink}>
              <Copy size={15} strokeWidth={2.2} />
              Copy link
            </button>
            <button type="button" className="queue-share-btn" onClick={downloadQr} disabled={!qrUrl}>
              <Download size={15} strokeWidth={2.2} />
              Download QR
            </button>
          </div>
        </div>
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
    </>
  );
}
