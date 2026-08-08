"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, History, Search, UserX, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  fetchReservationFormConfig,
  fetchReservationHistory,
} from "@/app/merchant/reservation-actions";
import { useReservationActions } from "@/lib/merchant/use-reservation-actions";
import { formatDateLabel, type Reservation } from "@/lib/merchant/reservations";
import type { ReservationHistorySummary } from "@/lib/reservations/stats";
import { useMerchantWorkspace } from "../merchant-workspace-context";
import { ReservationDrawer } from "./reservation-drawer";
import { ReservationRow } from "./reservation-row";
import { ReservationHistorySkeleton } from "./reservation-skeletons";

type RangeKey = "7d" | "30d" | "6m" | "all";

const RANGES: Array<{ id: RangeKey; label: string; days: number | null }> = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "6m", label: "6 months", days: 183 },
  { id: "all", label: "All time", days: null },
];

const EMPTY_SUMMARY: ReservationHistorySummary = {
  total: 0,
  seated: 0,
  noShows: 0,
  droppedOff: 0,
};

/**
 * Bookings whose date has passed. The dashboard looks forward (today onwards),
 * so this is where the merchant reviews how past services actually went.
 */
export function ReservationHistoryScreen() {
  const { activeBranchId } = useMerchantWorkspace();

  const [range, setRange] = useState<RangeKey>("30d");
  const [query, setQuery] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [summary, setSummary] = useState<ReservationHistorySummary>(EMPTY_SUMMARY);
  const [slots, setSlots] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const days = RANGES.find((item) => item.id === range)?.days ?? null;
    const result = await fetchReservationHistory({ days, branchId: activeBranchId });
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't load history.");
      setLoaded(true);
      return;
    }
    setReservations(result.reservations);
    setSummary(result.summary);
    setLoaded(true);
  }, [range, activeBranchId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The drawer can still reconcile a past booking, so it needs the slot list.
  useEffect(() => {
    void fetchReservationFormConfig().then((config) => {
      if (config.ok && config.slots) setSlots(config.slots);
    });
  }, []);

  const applyUpdated = useCallback((next: Reservation) => {
    setReservations((prev) => prev.map((item) => (item.id === next.id ? next : item)));
  }, []);

  const { busyId, runAction, suggest, saveNotes } = useReservationActions(
    applyUpdated,
    load,
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reservations;
    const digits = q.replace(/\D/g, "");
    return reservations.filter((reservation) => {
      if (reservation.customerName.toLowerCase().includes(q)) return true;
      if (digits && reservation.customerPhone.replace(/\D/g, "").includes(digits)) {
        return true;
      }
      return digits ? String(reservation.number).includes(digits) : false;
    });
  }, [reservations, query]);

  /**
   * One section per service day, newest day first and chronological within it,
   * so the list reads like the day it describes instead of repeating the date
   * on every single row.
   */
  const days = useMemo(() => {
    const byDate = new Map<string, Reservation[]>();
    for (const reservation of visible) {
      const bucket = byDate.get(reservation.date);
      if (bucket) bucket.push(reservation);
      else byDate.set(reservation.date, [reservation]);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, rows]) => ({
        date,
        rows: [...rows].sort((a, b) => a.time.localeCompare(b.time)),
      }));
  }, [visible]);

  const selected = reservations.find((item) => item.id === selectedId) ?? null;

  if (!loaded) return <ReservationHistorySkeleton />;

  const cards = [
    { Icon: CalendarClock, value: summary.total, label: "Bookings" },
    { Icon: Check, value: summary.seated, label: "Seated" },
    { Icon: UserX, value: summary.noShows, label: "No shows" },
    { Icon: XCircle, value: summary.droppedOff, label: "Cancelled" },
  ];

  return (
    <>
      <div className="tab-screen">
        <div className="tab-head">
          <h2 className="tab-title">History</h2>
          <p className="tab-sub">
            Bookings from before today, with how each one ended
          </p>
        </div>

        <div className="qhist-summary qhist-summary--4">
          {cards.map(({ Icon, value, label }) => (
            <div key={label} className="qhist-summary-stat">
              <span className="qhist-summary-icon">
                <Icon size={17} strokeWidth={2.3} />
              </span>
              <div className="qhist-summary-copy">
                <span className="qhist-summary-value">{value}</span>
                <span className="qhist-summary-label">{label}</span>
              </div>
            </div>
          ))}
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
              aria-label="Search past bookings"
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
        </div>

        {visible.length === 0 ? (
          <div className="panel-card merchant-empty">
            <div className="merchant-empty-icon" aria-hidden="true">
              <History size={26} strokeWidth={2} />
            </div>
            <p className="merchant-empty-title">
              {query ? "No matching bookings" : "Nothing in this range yet"}
            </p>
            <p className="merchant-empty-sub">
              {query
                ? "Try another name, number or booking number."
                : "Past bookings land here once their date has gone by."}
            </p>
          </div>
        ) : (
          <div className="resv-history-days">
            {days.map(({ date, rows }) => (
              <section key={date} className="merchant-section">
                <div className="merchant-section-head">
                  <h3 className="merchant-section-label">
                    {formatDateLabel(date)}
                  </h3>
                  <span className="merchant-section-meta">
                    {rows.length} booking{rows.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="resv-list">
                  {/* Read-only rows: history is for reviewing, and the drawer
                      still carries every action if one needs tidying up. */}
                  {rows.map((reservation) => (
                    <ReservationRow
                      key={reservation.id}
                      reservation={reservation}
                      variant="history"
                      onView={() => setSelectedId(reservation.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <ReservationDrawer
        reservation={selected}
        slots={slots}
        busy={busyId === selected?.id}
        onClose={() => setSelectedId(null)}
        onAction={(action, input) =>
          selected ? runAction(selected, action, input) : false
        }
        onSuggest={(input) => (selected ? suggest(selected, input) : false)}
        onSaveNotes={(merchantNotes) =>
          selected ? saveNotes(selected, merchantNotes) : false
        }
      />
    </>
  );
}
