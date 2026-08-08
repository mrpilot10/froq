"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  History,
  Play,
  QrCode,
  Search,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useRealtime } from "@/lib/supabase/use-realtime";
import {
  fetchReservationFormConfig,
  fetchReservations,
} from "@/app/merchant/reservation-actions";
import { listBranchDiningTables } from "@/app/merchant/table-actions";
import { useReservationActions } from "@/lib/merchant/use-reservation-actions";
import {
  formatDateLabel,
  RESERVATION_DATE_FILTERS,
  RESERVATION_STATUS_META,
  RESERVATION_STATUSES,
  reservationSettingsFromProfile,
  type Reservation,
  type ReservationActionId,
  type ReservationDateFilter,
  type ReservationStats,
  type ReservationStatus,
} from "@/lib/merchant/reservations";
import { useMerchantWorkspace } from "../merchant-workspace-context";
import { AssignTableSheet } from "../queue/seat-at-table-sheet";
import { NewReservationSheet } from "./new-reservation-sheet";
import { ReservationDrawer } from "./reservation-drawer";
import { ReservationRow } from "./reservation-row";
import { ReservationsHomeSkeleton } from "./reservation-skeletons";
import { ReservationWindowCard } from "./reservation-window-card";

const EMPTY_STATS: ReservationStats = {
  today: 0,
  pending: 0,
  confirmed: 0,
  completed: 0,
  noShows: 0,
};

export function ReservationsHomeScreen() {
  const {
    profile,
    activeBranchId,
    branches,
    onShowQr,
    onSetReservationPaused,
    goToTab,
  } = useMerchantWorkspace();

  const [dateFilter, setDateFilter] = useState<ReservationDateFilter>("today");
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [stats, setStats] = useState<ReservationStats>(EMPTY_STATS);
  const [slots, setSlots] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [confirmPick, setConfirmPick] = useState<Reservation | null>(null);
  const [hasTables, setHasTables] = useState(false);

  const load = useCallback(async () => {
    const result = await fetchReservations({
      filter: dateFilter,
      branchId: activeBranchId,
    });
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't load reservations.");
      setLoaded(true);
      return;
    }
    setReservations(result.reservations);
    setStats(result.stats);
    setLoaded(true);
  }, [dateFilter, activeBranchId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchReservationFormConfig().then((config) => {
      if (config.ok && config.slots) setSlots(config.slots);
    });
  }, []);

  // Live dashboard: a public request or a status change lands instantly.
  const merchantFilter = profile.id ? `merchant_id=eq.${profile.id}` : undefined;
  const onRealtime = useCallback(() => {
    void load();
  }, [load]);
  useRealtime("reservations", merchantFilter, onRealtime);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return reservations.filter((reservation) => {
      if (statusFilter !== "all" && reservation.status !== statusFilter) return false;
      if (!q) return true;
      if (reservation.customerName.toLowerCase().includes(q)) return true;
      if (digits && reservation.customerPhone.replace(/\D/g, "").includes(digits)) {
        return true;
      }
      return digits ? String(reservation.number).includes(digits) : false;
    });
  }, [reservations, statusFilter, query]);

  // Today and Tomorrow are one day by definition, so their rows carry no date
  // at all. The multi-day filters get day headings instead of repeating the
  // date on every row.
  const grouped = dateFilter === "week" || dateFilter === "all";
  const days = useMemo(() => {
    const byDate = new Map<string, Reservation[]>();
    for (const reservation of visible) {
      const bucket = byDate.get(reservation.date);
      if (bucket) bucket.push(reservation);
      else byDate.set(reservation.date, [reservation]);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, rows]) => ({
        date,
        rows: [...rows].sort((a, b) => a.time.localeCompare(b.time)),
      }));
  }, [visible]);

  const selected = reservations.find((item) => item.id === selectedId) ?? null;

  // Seating window follows the active branch's store timings.
  const windowSettings = useMemo(() => {
    const branch =
      branches.find((b) => b.id === activeBranchId) ??
      branches.find((b) => b.isDefault) ??
      branches[0] ??
      null;
    return reservationSettingsFromProfile({
      ...profile,
      queueOpenTime: branch?.queueOpenTime ?? profile.queueOpenTime,
      queueCloseTime: branch?.queueCloseTime ?? profile.queueCloseTime,
    });
  }, [profile, branches, activeBranchId]);
  const paused = profile.reservationPaused;

  const togglePaused = useCallback(async () => {
    setPausing(true);
    try {
      await onSetReservationPaused(!paused);
    } finally {
      setPausing(false);
    }
  }, [onSetReservationPaused, paused]);

  /** Apply the server's row back into state so the UI never re-fetches to update. */
  const applyUpdated = useCallback((next: Reservation) => {
    setReservations((prev) =>
      prev.map((item) => (item.id === next.id ? next : item)),
    );
  }, []);

  const { busyId, runAction, suggest, saveNotes } = useReservationActions(
    applyUpdated,
    load,
  );

  useEffect(() => {
    if (!activeBranchId) {
      setHasTables(false);
      return;
    }
    let cancelled = false;
    void listBranchDiningTables({ branchId: activeBranchId }).then((result) => {
      if (cancelled) return;
      setHasTables(result.ok && result.tables.length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [activeBranchId]);

  const requestAction = useCallback(
    (
      reservation: Reservation,
      action: ReservationActionId,
      input?: { reason?: string; tableId?: string | null },
    ) => {
      if (
        action === "confirm" &&
        hasTables &&
        !reservation.diningTableId &&
        input?.tableId === undefined
      ) {
        setConfirmPick(reservation);
        return Promise.resolve(false);
      }
      return runAction(reservation, action, input);
    },
    [hasTables, runAction],
  );

  if (!loaded) return <ReservationsHomeSkeleton />;

  const searching = query.trim().length > 0 || statusFilter !== "all";

  const pulse = [
    {
      id: "today",
      label: "Today",
      value: stats.today,
      active: dateFilter === "today" && statusFilter === "all",
    },
    {
      id: "pending",
      label: "To review",
      value: stats.pending,
      active: statusFilter === "pending",
      accent: stats.pending > 0,
    },
    {
      id: "confirmed",
      label: "Booked",
      value: stats.confirmed,
      active: statusFilter === "confirmed",
    },
    {
      id: "completed",
      label: "Done",
      value: stats.completed,
      active: statusFilter === "completed",
    },
  ];

  const selectPulse = (id: string) => {
    if (id === "today") {
      setDateFilter("today");
      setStatusFilter("all");
      return;
    }
    if (id === "pending" || id === "confirmed" || id === "completed") {
      setDateFilter("today");
      setStatusFilter(id);
    }
  };

  return (
    <>
      <div className="tab-screen merchant-dashboard resv-home">
        <div className="tab-head queue-live-head merchant-dashboard-head">
          <div className="queue-live-copy">
            <h2 className="tab-title">Reservations</h2>
            <p className="tab-sub">
              {paused
                ? "Bookings are stopped — guests can't request a table right now"
                : stats.pending > 0
                  ? `${stats.pending} request${stats.pending === 1 ? "" : "s"} waiting for your review`
                  : stats.today > 0
                    ? `${stats.today} booking${stats.today === 1 ? "" : "s"} on the book today`
                    : "Confirm requests and manage today's tables"}
            </p>
          </div>
          <div className="queue-session-actions">
            <button
              type="button"
              className={`queue-session-btn queue-session-btn--${paused ? "start" : "end"}`}
              onClick={togglePaused}
              disabled={pausing}
            >
              {paused ? (
                <Play size={16} strokeWidth={2.6} />
              ) : (
                <Square size={15} strokeWidth={2.6} />
              )}
              {paused ? "Start bookings" : "Stop bookings"}
            </button>
          </div>
        </div>

        <ReservationWindowCard
          settings={windowSettings}
          paused={paused}
          pulse={pulse}
          onPulseSelect={selectPulse}
        />

        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Quick actions</h3>
          </div>
          <div className="merchant-quick-actions merchant-quick-actions--all">
            <button
              type="button"
              className="queue-action"
              onClick={() => onShowQr("reservation")}
            >
              <span className="queue-action-icon queue-action-icon--accent">
                <QrCode size={18} strokeWidth={2.2} />
              </span>
              Show QR
            </button>
            <button
              type="button"
              className="queue-action"
              onClick={() => setNewOpen(true)}
            >
              <span className="queue-action-icon">
                <CalendarPlus size={18} strokeWidth={2.2} />
              </span>
              Add booking
            </button>
            <button
              type="button"
              className="queue-action"
              onClick={() => goToTab("reservations-history")}
            >
              <span className="queue-action-icon">
                <History size={18} strokeWidth={2.2} />
              </span>
              History
            </button>
          </div>
        </section>

        <section className="merchant-section">
          <div className="merchant-section-head">
            <h3 className="merchant-section-label">Bookings</h3>
            <span className="merchant-section-meta">
              {searching
                ? `${visible.length} of ${reservations.length} shown`
                : `${reservations.length} in view`}
            </span>
          </div>

          <div className="resv-toolbar">
            <label className="merchant-customer-search-field">
              <Search size={16} strokeWidth={2.2} aria-hidden />
              <input
                type="search"
                className="merchant-customer-search-input"
                placeholder="Search name, phone or booking number…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
                enterKeyHint="search"
                aria-label="Search reservations"
              />
              {query ? (
                <button
                  type="button"
                  className="merchant-customer-search-clear"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
              ) : null}
            </label>

            <div className="resv-toolbar-row">
              <div className="queue-tabs" role="tablist" aria-label="Reservation dates">
                {RESERVATION_DATE_FILTERS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={dateFilter === id}
                    className={`queue-tab${dateFilter === id ? " active" : ""}`}
                    onClick={() => setDateFilter(id)}
                  >
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div className="merchant-date-select">
                <select
                  className="merchant-date-select-input"
                  aria-label="Status"
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as ReservationStatus | "all")
                  }
                >
                  <option value="all">All statuses</option>
                  {RESERVATION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {RESERVATION_STATUS_META[status].label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  strokeWidth={2.4}
                  className="merchant-date-select-icon"
                />
              </div>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="panel-card merchant-empty">
              <div className="merchant-empty-icon" aria-hidden="true">
                <CalendarClock size={26} strokeWidth={2} />
              </div>
              <p className="merchant-empty-title">
                {searching ? "No matching reservations" : "No reservations here yet"}
              </p>
              <p className="merchant-empty-sub">
                {searching
                  ? "Try another name, number or status."
                  : "Share your reservation QR so guests can request a table, or add a booking you took over the phone."}
              </p>
            </div>
          ) : grouped ? (
            <div className="resv-day-groups">
              {days.map(({ date, rows }) => (
                <div key={date} className="resv-day">
                  <div className="resv-day-head">
                    <span className="resv-day-label">
                      {formatDateLabel(date)}
                    </span>
                    <span className="resv-day-count">
                      {rows.length} booking{rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="resv-list">
                    {rows.map((reservation) => (
                      <ReservationRow
                        key={reservation.id}
                        reservation={reservation}
                        busy={busyId === reservation.id}
                        onView={() => setSelectedId(reservation.id)}
                        onAction={(action) =>
                          void requestAction(reservation, action)
                        }
                        onSuggest={() => setSelectedId(reservation.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="resv-list">
              {visible.map((reservation) => (
                <ReservationRow
                  key={reservation.id}
                  reservation={reservation}
                  busy={busyId === reservation.id}
                  onView={() => setSelectedId(reservation.id)}
                  onAction={(action) => void requestAction(reservation, action)}
                  onSuggest={() => setSelectedId(reservation.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <ReservationDrawer
        reservation={selected}
        slots={slots}
        busy={busyId === selected?.id}
        onClose={() => setSelectedId(null)}
        onAction={(action, input) =>
          selected ? requestAction(selected, action, input) : false
        }
        onSuggest={(input) => (selected ? suggest(selected, input) : false)}
        onSaveNotes={(merchantNotes) =>
          selected ? saveNotes(selected, merchantNotes) : false
        }
        onTableAssigned={({ diningTableId, tableNumber }) => {
          if (!selected) return;
          applyUpdated({
            ...selected,
            diningTableId,
            tableNumber,
          });
        }}
      />

      <AssignTableSheet
        open={Boolean(confirmPick)}
        branchId={confirmPick?.branchId ?? activeBranchId}
        partySize={confirmPick?.partySize ?? 1}
        guestName={confirmPick?.customerName ?? "guest"}
        purpose="confirm"
        date={confirmPick?.date}
        time={confirmPick?.time}
        ignoreReservationId={confirmPick?.id}
        busy={busyId === confirmPick?.id}
        onClose={() => setConfirmPick(null)}
        onConfirm={(tableId) => {
          if (!confirmPick) return;
          const target = confirmPick;
          setConfirmPick(null);
          void requestAction(target, "confirm", { tableId });
        }}
      />

      <NewReservationSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSaved={() => void load()}
      />
    </>
  );
}
