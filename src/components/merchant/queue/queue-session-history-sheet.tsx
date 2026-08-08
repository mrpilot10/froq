"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { formatPhoneDisplay } from "@/lib/auth/format";
import { canDeleteQueueSessions, canViewCustomerData } from "@/lib/merchant/roles";
import type { MemberRole } from "@/lib/merchant/types";
import type { QueueSessionRecord } from "@/lib/merchant/queue-session-storage";
import {
  deleteQueueSession,
  fetchQueueSessionGuestDetail,
  fetchQueueSessionGuests,
} from "@/app/merchant/queue-actions";
import { updateCustomerMerchantNotes } from "@/app/merchant/actions";
import {
  queueGuestStatusLabel,
  type QueueGuestTimelineEvent,
  type QueueHistoryGuest,
  type QueueHistoryGuestDetail,
} from "@/lib/queue/session-history";
import { waitSegments } from "@/lib/queue/format";

type SheetView = "guests" | "guest";

interface QueueSessionHistorySheetProps {
  session: QueueSessionRecord | null;
  branchId: string | null;
  role: MemberRole;
  onClose: () => void;
  /** Fired after a successful delete so the list can drop its local record. */
  onDeleted: (session: QueueSessionRecord) => void;
}

function timelineTime(atMs: number) {
  const date = new Date(atMs);
  const day = date.toLocaleDateString([], { day: "numeric", month: "short" });
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function matchesGuestQuery(guest: QueueHistoryGuest, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  if (guest.name.toLowerCase().includes(q)) return true;
  if (digits && guest.phone.replace(/\D/g, "").includes(digits)) return true;
  return false;
}

function TimelineIcon({ type }: { type: QueueGuestTimelineEvent["type"] }) {
  if (type === "joined") return <UserRound size={12} strokeWidth={2.6} />;
  if (type === "notified") return <MessageSquare size={12} strokeWidth={2.6} />;
  if (type === "left") return <X size={12} strokeWidth={2.6} />;
  return <Check size={12} strokeWidth={3} />;
}

export function QueueSessionHistorySheet({
  session,
  branchId,
  role,
  onClose,
  onDeleted,
}: QueueSessionHistorySheetProps) {
  const [view, setView] = useState<SheetView>("guests");
  const [guests, setGuests] = useState<QueueHistoryGuest[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(false);
  const [guestsError, setGuestsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QueueHistoryGuestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const showData = canViewCustomerData(role);
  const canDelete = canDeleteQueueSessions(role);

  useEffect(() => {
    setView("guests");
    setGuests([]);
    setGuestsError(null);
    setQuery("");
    setSelectedId(null);
    setDetail(null);
    setNotes("");
    setConfirmDelete(false);
  }, [session?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setGuestsLoading(true);
    setGuestsError(null);
    void fetchQueueSessionGuests({
      sessionId: session.dbSessionId ?? session.id,
      number: session.number,
      startedAtMs: session.startedAtMs,
      branchId,
    }).then((result) => {
      if (cancelled) return;
      setGuestsLoading(false);
      if (!result.ok) {
        setGuestsError(result.error ?? "Could not load guests.");
        setGuests([]);
        return;
      }
      // All statuses — waiting, called, seated, left — no client filter.
      setGuests(result.guests);
    });
    return () => {
      cancelled = true;
    };
  }, [session, branchId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setNotes("");
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void fetchQueueSessionGuestDetail({ entryId: selectedId }).then((result) => {
      if (cancelled) return;
      setDetailLoading(false);
      if (!result.ok || !result.guest) {
        toast.error(result.error ?? "Could not load guest.");
        setView("guests");
        setSelectedId(null);
        return;
      }
      setDetail(result.guest);
      setNotes(result.guest.merchantNotes);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const visibleGuests = useMemo(
    () => guests.filter((guest) => matchesGuestQuery(guest, query)),
    [guests, query],
  );
  const searching = query.trim().length > 0;

  const notesDirty =
    !!detail?.customerId &&
    notes.trim() !== (detail.merchantNotes ?? "").trim();

  const openGuest = (guest: QueueHistoryGuest) => {
    setSelectedId(guest.id);
    setView("guest");
  };

  const backToGuests = () => {
    setView("guests");
    setSelectedId(null);
    setDetail(null);
    setNotes("");
  };

  const deleteWarning =
    guests.length > 0
      ? `This permanently removes the session and its ${guests.length} guest ${
          guests.length === 1 ? "record" : "records"
        }, including those visits on customer profiles. This cannot be undone.`
      : "This permanently removes the session. This cannot be undone.";

  const removeSession = () => {
    if (!session) return;
    setDeleting(true);
    void deleteQueueSession({
      sessionId: session.dbSessionId ?? session.id,
      number: session.number,
      startedAtMs: session.startedAtMs,
      branchId,
    })
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error ?? "Could not delete session.");
          return;
        }
        toast.success(
          result.deletedGuests > 0
            ? `Session #${session.number} and ${result.deletedGuests} guest ${
                result.deletedGuests === 1 ? "record" : "records"
              } deleted`
            : `Session #${session.number} deleted`,
        );
        onDeleted(session);
      })
      .finally(() => setDeleting(false));
  };

  const saveNotes = () => {
    if (!detail?.customerId) return;
    setSavingNotes(true);
    void updateCustomerMerchantNotes(detail.customerId, notes)
      .then((result) => {
        if (result.ok) {
          toast.success("Note saved");
          setDetail({ ...detail, merchantNotes: notes.trim() });
        } else {
          toast.error(result.error ?? "Could not save note");
        }
      })
      .finally(() => setSavingNotes(false));
  };

  return (
    <BottomSheet
      open={session !== null}
      onClose={onClose}
      labelledBy="qhist-session-sheet-title"
      className="merchant-theme"
    >
      {session && (
        <div className="merchant-drawer qhist-session-sheet">
          {view === "guests" ? (
            <>
              <div className="merchant-drawer-head">
                <div className="merchant-drawer-head-copy">
                  <h3 id="qhist-session-sheet-title" className="merchant-drawer-name">
                    Session #{session.number}
                  </h3>
                  <p className="qhist-session-sheet-sub">
                    {guestsLoading
                      ? "Loading guests…"
                      : searching
                        ? `${visibleGuests.length} of ${guests.length} guests`
                        : `${guests.length} guest${guests.length === 1 ? "" : "s"}`}
                  </p>
                </div>
              </div>

              {!guestsLoading && !guestsError && guests.length > 0 ? (
                <label className="merchant-customer-search-field qhist-guest-search">
                  <Search size={16} strokeWidth={2.2} aria-hidden />
                  <input
                    type="search"
                    className="merchant-customer-search-input"
                    placeholder="Search by name or phone…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    autoComplete="off"
                    enterKeyHint="search"
                    aria-label="Search session guests"
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
              ) : null}

              {guestsLoading ? (
                <div className="qhist-guest-list" aria-busy="true">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="qhist-guest-row">
                      <span className="sk" style={{ width: 40, height: 40, borderRadius: 999 }} />
                      <div className="qhist-guest-copy">
                        <div className="sk sk-line" style={{ width: 120 }} />
                        <div className="sk sk-line" style={{ width: 80, marginTop: 6 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : guestsError ? (
                <p className="cust-timeline-empty">{guestsError}</p>
              ) : guests.length === 0 ? (
                <p className="cust-timeline-empty">No guests in this session</p>
              ) : visibleGuests.length === 0 ? (
                <p className="cust-timeline-empty">No guests match that search</p>
              ) : (
                <ul className="qhist-guest-list">
                  {visibleGuests.map((guest) => (
                    <li key={guest.id}>
                      <button
                        type="button"
                        className="qhist-guest-row"
                        onClick={() => openGuest(guest)}
                      >
                        <span className="merchant-avatar" aria-hidden>
                          {getInitials(guest.name)}
                        </span>
                        <div className="qhist-guest-copy">
                          <div className="qhist-guest-name">{guest.name}</div>
                          <div className="qhist-guest-meta">
                            <span
                              className={`qhist-guest-status qhist-guest-status--${guest.status}`}
                            >
                              {queueGuestStatusLabel(guest.status)}
                            </span>
                            <span>
                              <Users size={12} strokeWidth={2.4} aria-hidden />{" "}
                              {guest.partySize}
                            </span>
                            {guest.waitMinutes != null ? (
                              <span>
                                {waitSegments(guest.waitMinutes).map((part) => (
                                  <Fragment key={part.unit}>
                                    {part.value}
                                    {part.unit}
                                  </Fragment>
                                ))}{" "}
                                wait
                              </span>
                            ) : null}
                          </div>
                          {showData ? (
                            <div className="qhist-guest-phone">
                              {formatPhoneDisplay(guest.phone)}
                            </div>
                          ) : null}
                        </div>
                        <ChevronRight size={16} strokeWidth={2.4} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Withheld until the guest list resolves: the warning quotes a
                  record count, and quoting a wrong one before a destructive
                  confirm is worse than making the merchant wait. */}
              {canDelete && !guestsLoading && !guestsError ? (
                confirmDelete ? (
                  <div className="merchant-confirm">
                    <p className="merchant-confirm-text">
                      Delete session #{session.number}? {deleteWarning}
                    </p>
                    <div className="merchant-confirm-actions">
                      <button
                        type="button"
                        className="merchant-action-btn merchant-action-btn--reject"
                        disabled={deleting}
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="merchant-action-btn merchant-action-btn--danger"
                        disabled={deleting}
                        onClick={removeSession}
                      >
                        {deleting ? "Deleting…" : "Delete session"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="merchant-drawer-actions merchant-drawer-actions--stack">
                    <button
                      type="button"
                      className="merchant-action-btn merchant-action-btn--danger merchant-action-btn--block"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 size={16} strokeWidth={2.3} />
                      Delete session
                    </button>
                  </div>
                )
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className="qhist-session-back"
                onClick={backToGuests}
              >
                <ChevronLeft size={16} strokeWidth={2.6} aria-hidden />
                Guests
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
                  <div className="merchant-customer-profile-head">
                    <div className="merchant-avatar merchant-avatar--lg" aria-hidden>
                      {getInitials(detail.name)}
                    </div>
                    <div className="merchant-customer-profile-identity">
                      <h3
                        id="qhist-session-sheet-title"
                        className="merchant-customer-profile-name"
                      >
                        {detail.name}
                      </h3>
                      <p className="merchant-customer-profile-since">
                        <span
                          className={`qhist-guest-status qhist-guest-status--${detail.status}`}
                        >
                          {queueGuestStatusLabel(detail.status)}
                        </span>
                        {" · "}
                        party of {detail.partySize}
                        {detail.kind === "reservation" ? " · Reservation" : ""}
                      </p>
                    </div>
                  </div>

                  {showData ? (
                    <div className="merchant-drawer-rows">
                      <div className="profile-row">
                        <div className="profile-row-icon">
                          <Phone size={18} strokeWidth={2.2} />
                        </div>
                        <div className="profile-row-copy">
                          <div className="profile-row-label">Mobile</div>
                          <div className="profile-row-value">
                            {formatPhoneDisplay(detail.phone)}
                          </div>
                        </div>
                      </div>

                      {/* Shown even when absent: queue guests often skip the
                          email field, and an omitted row reads as a bug. */}
                      <div className="profile-row">
                        <div className="profile-row-icon">
                          <Mail size={18} strokeWidth={2.2} />
                        </div>
                        <div className="profile-row-copy">
                          <div className="profile-row-label">Email</div>
                          <div
                            className={`profile-row-value${detail.email ? "" : " profile-row-value--soft"}`}
                          >
                            {detail.email ?? "Not provided"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="merchant-settings-group">
                    <h3 className="merchant-settings-title">Timeline</h3>
                    {detail.timeline.length === 0 ? (
                      <p className="cust-timeline-empty">No activity yet</p>
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

                  {showData ? (
                    <label className="auth-field">
                      <span className="auth-label">Merchant notes</span>
                      <textarea
                        className="auth-input merchant-textarea"
                        rows={2}
                        placeholder={
                          detail.customerId
                            ? "Private note — regular, prefers window seat…"
                            : "Notes unavailable for guests without a customer profile"
                        }
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        maxLength={2000}
                        disabled={!detail.customerId}
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
                  ) : null}
                </>
              )}
            </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
