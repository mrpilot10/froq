"use client";

import { Fragment, useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquare,
  Phone,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { formatPhoneDisplay } from "@/lib/auth/format";
import { waitSegments } from "@/lib/queue/format";
import {
  queueGuestStatusLabel,
  type QueueCustomerVisit,
  type QueueGuestTimelineEvent,
  type QueueHistoryGuestDetail,
} from "@/lib/queue/session-history";
import type { UnifiedCustomer } from "@/lib/merchant/unified-customers";
import {
  fetchQueueCustomerVisits,
  fetchQueueSessionGuestDetail,
} from "@/app/merchant/queue-actions";
import { updateCustomerMerchantNotes } from "@/app/merchant/actions";

interface QueueCustomerSheetProps {
  customer: UnifiedCustomer | null;
  branchId: string | null;
  onClose: () => void;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function visitDay(atMs: number) {
  return new Date(atMs).toLocaleDateString([], { day: "numeric", month: "short" });
}

function visitTime(atMs: number) {
  return new Date(atMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function timelineTime(atMs: number) {
  return `${visitDay(atMs)} · ${visitTime(atMs)}`;
}

function TimelineIcon({ type }: { type: QueueGuestTimelineEvent["type"] }) {
  if (type === "joined") return <UserRound size={12} strokeWidth={2.6} />;
  if (type === "notified") return <MessageSquare size={12} strokeWidth={2.6} />;
  if (type === "left") return <X size={12} strokeWidth={2.6} />;
  return <Check size={12} strokeWidth={3} />;
}

/**
 * Queue → Customers drill-down: a guest's rolled-up queue record, the list of
 * every visit behind it, and the per-visit timeline one level deeper.
 */
export function QueueCustomerSheet({
  customer,
  branchId,
  onClose,
}: QueueCustomerSheetProps) {
  return (
    <BottomSheet
      open={customer !== null}
      onClose={onClose}
      labelledBy="qcust-sheet-name"
      className="merchant-theme"
    >
      {customer ? (
        // Branch is part of the key: switching it re-scopes both the rolled-up
        // stats and the visit list, so the whole body should start over.
        <QueueCustomerSheetBody
          key={`${customer.key}:${branchId ?? "all"}`}
          customer={customer}
          branchId={branchId}
        />
      ) : null}
    </BottomSheet>
  );
}

function QueueCustomerSheetBody({
  customer,
  branchId,
}: {
  customer: UnifiedCustomer;
  branchId: string | null;
}) {
  const [visits, setVisits] = useState<QueueCustomerVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(customer.customerId);
  const [resolvedEmail, setResolvedEmail] = useState<string | null>(customer.email);
  const [savedNotes, setSavedNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QueueHistoryGuestDetail | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchQueueCustomerVisits({
      customerId: customer.customerId,
      phone: customer.phone,
      branchId,
    }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error ?? "Could not load visits.");
        return;
      }
      setVisits(result.visits);
      setCustomerId(result.customerId);
      // The unified row can lack an email (reservation entries never carry
      // one); the customer record resolved server-side is authoritative.
      if (result.email) setResolvedEmail(result.email);
      setSavedNotes(result.merchantNotes);
      setNotes(result.merchantNotes);
    });
    return () => {
      cancelled = true;
    };
  }, [customer.customerId, customer.phone, branchId]);

  useEffect(() => {
    if (!selectedVisitId) return;
    let cancelled = false;
    void fetchQueueSessionGuestDetail({ entryId: selectedVisitId }).then((result) => {
      if (cancelled) return;
      if (!result.ok || !result.guest) {
        toast.error(result.error ?? "Could not load visit.");
        setSelectedVisitId(null);
        return;
      }
      setDetail(result.guest);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedVisitId]);

  // `detail` is always cleared alongside the selection, so its absence while a
  // visit is selected means the fetch is still in flight.
  const detailLoading = detail === null;
  const stats = customer.queue;
  const email = resolvedEmail;
  const lastVisitMs = visits[0]?.joinedAtMs ?? stats?.lastJoinedMs ?? null;
  const notesDirty = Boolean(customerId) && notes.trim() !== savedNotes.trim();

  const saveNotes = () => {
    if (!customerId) return;
    setSavingNotes(true);
    void updateCustomerMerchantNotes(customerId, notes)
      .then((result) => {
        if (result.ok) {
          toast.success("Note saved");
          setSavedNotes(notes.trim());
        } else {
          toast.error(result.error ?? "Could not save note");
        }
      })
      .finally(() => setSavingNotes(false));
  };

  if (selectedVisitId) {
    return (
      <div className="merchant-drawer">
        <button
          type="button"
          className="qhist-session-back"
          onClick={() => {
            setSelectedVisitId(null);
            setDetail(null);
          }}
        >
          <ChevronLeft size={16} strokeWidth={2.6} aria-hidden />
          {customer.name}
        </button>

        {detailLoading || !detail ? (
          <div className="merchant-customer-profile-head" aria-busy="true">
            <span className="sk" style={{ width: 52, height: 52, borderRadius: 999 }} />
            <div className="merchant-customer-profile-identity">
              <div className="sk sk-line" style={{ width: 140 }} />
              <div className="sk sk-line" style={{ width: 90, marginTop: 8 }} />
            </div>
          </div>
        ) : (
          <>
            <div className="merchant-drawer-head">
              <div className="merchant-drawer-head-copy">
                <h3 id="qcust-sheet-name" className="merchant-drawer-name">
                  {visitDay(detail.joinedAtMs)} visit
                </h3>
                <p className="qhist-session-sheet-sub">
                  <span
                    className={`qhist-guest-status qhist-guest-status--${detail.status}`}
                  >
                    {queueGuestStatusLabel(detail.status)}
                  </span>
                  {` · party of ${detail.partySize}`}
                  {detail.kind === "reservation" ? " · Reservation" : ""}
                </p>
              </div>
            </div>

            <div className="merchant-settings-group">
              <h3 className="merchant-settings-title">Timeline</h3>
              {detail.timeline.length === 0 ? (
                <p className="cust-timeline-empty">No activity recorded</p>
              ) : (
                <div className="cust-timeline">
                  {detail.timeline.map((event, index) => (
                    <div key={event.id} className="cust-timeline-step is-done">
                      <div className="cust-timeline-rail">
                        <span
                          className={`cust-timeline-dot cust-timeline-dot--${event.type}`}
                          aria-hidden
                        >
                          <TimelineIcon type={event.type} />
                        </span>
                        {index < detail.timeline.length - 1 ? (
                          <span className="cust-timeline-line" aria-hidden />
                        ) : null}
                      </div>
                      <div className="cust-timeline-copy">
                        <div className="cust-timeline-label">{event.label}</div>
                        <div className="cust-timeline-time">
                          {timelineTime(event.atMs)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="merchant-drawer">
      <div className="qcust-head">
        <div className="merchant-avatar merchant-avatar--lg" aria-hidden>
          {getInitials(customer.name)}
        </div>
        <div className="qcust-head-copy">
          <h3 id="qcust-sheet-name" className="qcust-head-name">
            {customer.name}
          </h3>
          <p className="qcust-head-meta">
            {stats?.lastStatus ? (
              <span
                className={`qhist-guest-status qhist-guest-status--${stats.lastStatus}`}
              >
                {queueGuestStatusLabel(stats.lastStatus)}
              </span>
            ) : (
              <span>Queue guest</span>
            )}
            {lastVisitMs != null ? <span>Last visit {visitDay(lastVisitMs)}</span> : null}
          </p>
        </div>
      </div>

      <div className="qcust-stats" aria-label="Queue metrics">
        <div className="qcust-stat">
          <span className="qcust-stat-value">{stats?.visits ?? 0}</span>
          <span className="qcust-stat-label">Visits</span>
        </div>
        <div className="qcust-stat">
          <span className="qcust-stat-value">{stats?.seated ?? 0}</span>
          <span className="qcust-stat-label">Seated</span>
        </div>
        <div className="qcust-stat">
          <span className="qcust-stat-value">{stats?.left ?? 0}</span>
          <span className="qcust-stat-label">No-shows</span>
        </div>
        <div className="qcust-stat">
          <span className="qcust-stat-value">
            {stats?.avgWaitMinutes != null
              ? waitSegments(stats.avgWaitMinutes).map((part) => (
                  <Fragment key={part.unit}>
                    {part.value}
                    <span className="qcust-stat-unit">{part.unit}</span>
                  </Fragment>
                ))
              : "—"}
          </span>
          <span className="qcust-stat-label">Avg wait</span>
        </div>
      </div>

      <div className="qcust-contact">
        <a className="qcust-contact-row" href={`tel:${customer.phone}`}>
          <span className="qcust-contact-icon" aria-hidden>
            <Phone size={15} strokeWidth={2.3} />
          </span>
          <span className="qcust-contact-copy">
            <span className="qcust-contact-label">Mobile</span>
            <span className="qcust-contact-value">
              {formatPhoneDisplay(customer.phone)}
            </span>
          </span>
        </a>

        {email ? (
          <a className="qcust-contact-row" href={`mailto:${email}`}>
            <span className="qcust-contact-icon" aria-hidden>
              <Mail size={15} strokeWidth={2.3} />
            </span>
            <span className="qcust-contact-copy">
              <span className="qcust-contact-label">Email</span>
              <span className="qcust-contact-value">{email}</span>
            </span>
          </a>
        ) : loading ? null : (
          <div className="qcust-contact-row is-empty">
            <span className="qcust-contact-icon" aria-hidden>
              <Mail size={15} strokeWidth={2.3} />
            </span>
            <span className="qcust-contact-copy">
              <span className="qcust-contact-label">Email</span>
              <span className="qcust-contact-value">Not provided</span>
            </span>
          </div>
        )}
      </div>

      <div className="merchant-settings-group">
        <h3 className="merchant-settings-title">
          Visit history{" "}
          {!loading && visits.length > 0 ? (
            <span className="qcust-visit-count">{visits.length}</span>
          ) : null}
        </h3>

        {loading ? (
          <div className="qhist-guest-list" aria-busy="true">
            {[0, 1, 2].map((index) => (
              <div key={index} className="qhist-guest-row">
                <span className="sk" style={{ width: 44, height: 40, borderRadius: 10 }} />
                <div className="qhist-guest-copy">
                  <div className="sk sk-line" style={{ width: 110 }} />
                  <div className="sk sk-line" style={{ width: 140, marginTop: 6 }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="cust-timeline-empty">{error}</p>
        ) : visits.length === 0 ? (
          <p className="cust-timeline-empty">No queue visits recorded</p>
        ) : (
          <ul className="qhist-guest-list">
            {visits.map((visit) => (
              <li key={visit.id}>
                <button
                  type="button"
                  className="qhist-guest-row"
                  onClick={() => setSelectedVisitId(visit.id)}
                >
                  {/* Date and time live in the chip so the session number,
                      itself ending in digits, can never run into them. */}
                  <span className="qcust-visit-date" aria-hidden>
                    <span className="qcust-visit-day">{visitDay(visit.joinedAtMs)}</span>
                    <span className="qcust-visit-time">
                      {visitTime(visit.joinedAtMs)}
                    </span>
                  </span>
                  <div className="qhist-guest-copy">
                    <div className="qhist-guest-name">
                      {visit.sessionNumber != null
                        ? `Session #${visit.sessionNumber}`
                        : "Queue visit"}
                      {visit.kind === "reservation" ? (
                        <span className="qcust-visit-kind">Reservation</span>
                      ) : null}
                    </div>
                    <div className="qhist-guest-meta">
                      <span
                        className={`qhist-guest-status qhist-guest-status--${visit.status}`}
                      >
                        {queueGuestStatusLabel(visit.status)}
                      </span>
                      <span>
                        <Users size={12} strokeWidth={2.4} aria-hidden />{" "}
                        {visit.partySize}
                      </span>
                      {visit.waitMinutes != null ? (
                        <span>
                          {waitSegments(visit.waitMinutes).map((part) => (
                            <Fragment key={part.unit}>
                              {part.value}
                              {part.unit}
                            </Fragment>
                          ))}{" "}
                          wait
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ChevronRight size={16} strokeWidth={2.4} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="auth-field">
        <span className="auth-label">Merchant notes</span>
        <textarea
          className="auth-input merchant-textarea"
          rows={2}
          placeholder={
            customerId
              ? "Private note — regular, prefers window seat…"
              : "Notes unavailable for guests without a customer profile"
          }
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={2000}
          disabled={loading || !customerId}
        />
        {notesDirty ? (
          <button
            type="button"
            className="merchant-action-btn merchant-action-btn--reject"
            disabled={savingNotes}
            onClick={saveNotes}
          >
            {savingNotes ? "Saving…" : "Save note"}
          </button>
        ) : null}
      </label>
    </div>
  );
}
