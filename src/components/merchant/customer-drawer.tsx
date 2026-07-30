"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronUp,
  Gift,
  Mail,
  Phone,
  ShieldCheck,
  Stamp,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { formatPhoneDisplay } from "@/lib/auth/format";
import {
  canModerateCustomers,
  canViewCustomerData,
  ROLE_LABELS,
} from "@/lib/merchant/roles";
import type { MemberRole, MerchantCustomer } from "@/lib/merchant/types";
import {
  getCustomerLoyaltyTimeline,
  type CustomerTimelineEvent,
} from "@/app/merchant/actions";
import { OfferStampOtp, type RequestOfferStampOtpResult } from "./offer-stamp-otp";

interface CustomerDrawerProps {
  customer: MerchantCustomer | null;
  role: MemberRole;
  onClose: () => void;
  onBan: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveNotes: (id: string, notes: string) => Promise<boolean>;
  /** When false, hide Offer stamp (e.g. All Branches view). Default true. */
  allowOfferStamp?: boolean;
  onRequestOfferStampOtp?: (customerId: string) => Promise<RequestOfferStampOtpResult>;
  onConfirmOfferStamp?: (
    customerId: string,
    code: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}

type ConfirmAction = "ban" | "delete" | null;

const TIMELINE_PREVIEW = 3;

function statusBadge(customer: MerchantCustomer) {
  if (customer.banned) return { label: "Banned", className: "merchant-badge--banned" };
  if (customer.status === "reward_ready") {
    return { label: "Reward ready", className: "merchant-badge--reward_ready" };
  }
  if (customer.status === "claimed") {
    return { label: "Claimed", className: "merchant-badge--claimed" };
  }
  return null;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function timelineTime(atMs: number) {
  const date = new Date(atMs);
  const day = date.toLocaleDateString([], { day: "numeric", month: "short" });
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

function timelineActor(event: CustomerTimelineEvent) {
  const name = event.staffName?.trim();
  if (!name) return null;
  const role = event.staffRole ? ROLE_LABELS[event.staffRole] : null;
  return role ? `by ${name} (${role})` : `by ${name}`;
}

export function CustomerDrawer({
  customer,
  role,
  onClose,
  onBan,
  onDelete,
  onSaveNotes,
  allowOfferStamp = true,
  onRequestOfferStampOtp,
  onConfirmOfferStamp,
}: CustomerDrawerProps) {
  const [confirm, setConfirm] = useState<ConfirmAction>(null);
  const [offering, setOffering] = useState(false);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [timeline, setTimeline] = useState<CustomerTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const showData = canViewCustomerData(role);
  const canModerate = canModerateCustomers(role);

  useEffect(() => {
    setConfirm(null);
    setOffering(false);
    setNotes(customer?.merchantNotes ?? "");
    setTimeline([]);
    setTimelineExpanded(false);
  }, [customer?.id, customer?.merchantNotes]);

  useEffect(() => {
    if (!customer?.id) return;
    let cancelled = false;
    setTimelineLoading(true);
    void getCustomerLoyaltyTimeline(customer.id).then((result) => {
      if (cancelled) return;
      setTimeline(result.events);
      setTimelineLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [customer?.id]);

  const canOfferStamp =
    allowOfferStamp &&
    !!onRequestOfferStampOtp &&
    !!onConfirmOfferStamp &&
    !!customer &&
    !customer.banned &&
    customer.status !== "reward_ready" &&
    customer.status !== "claimed";

  const badge = customer ? statusBadge(customer) : null;
  const notesDirty = customer
    ? notes.trim() !== (customer.merchantNotes ?? "").trim()
    : false;
  const visibleTimeline =
    timelineExpanded || timeline.length <= TIMELINE_PREVIEW
      ? timeline
      : timeline.slice(0, TIMELINE_PREVIEW);
  const hiddenCount = Math.max(0, timeline.length - TIMELINE_PREVIEW);

  const timelineSection = (
    <div className="merchant-settings-group">
      <h3 className="merchant-settings-title">Timeline</h3>
      {timelineLoading ? (
        <div className="cust-timeline" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="cust-timeline-step">
              <div className="cust-timeline-rail">
                <span className="sk" style={{ width: 22, height: 22, borderRadius: 999 }} />
                {index < 2 ? <span className="cust-timeline-line" aria-hidden /> : null}
              </div>
              <div className="cust-timeline-copy">
                <div className="sk sk-line" style={{ width: 120 }} />
                <div className="sk sk-line" style={{ width: 80, marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      ) : timeline.length === 0 ? (
        <p className="cust-timeline-empty">No activity yet</p>
      ) : (
        <div
          className={`cust-timeline-wrap${
            !timelineExpanded && hiddenCount > 0 ? " is-collapsed" : ""
          }`}
        >
          <div className="cust-timeline">
            {visibleTimeline.map((event, index) => {
              const by = timelineActor(event);
              const Icon =
                event.type === "reward"
                  ? Gift
                  : event.type === "joined"
                    ? UserRound
                    : Stamp;
              return (
                <div key={event.id} className="cust-timeline-step is-done">
                  <div className="cust-timeline-rail">
                    <span
                      className={`cust-timeline-dot cust-timeline-dot--${event.type}`}
                      aria-hidden
                    >
                      {event.type === "joined" ? (
                        <Check size={12} strokeWidth={3} />
                      ) : (
                        <Icon size={12} strokeWidth={2.6} />
                      )}
                    </span>
                    {index < visibleTimeline.length - 1 ? (
                      <span className="cust-timeline-line" aria-hidden />
                    ) : null}
                  </div>
                  <div className="cust-timeline-copy">
                    <div className="cust-timeline-label">{event.label}</div>
                    <div className="cust-timeline-time">
                      {timelineTime(event.atMs)}
                      {by ? ` · ${by}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {hiddenCount > 0 ? (
            <div className="cust-timeline-more-bar">
              <button
                type="button"
                className="cust-timeline-more"
                onClick={() => setTimelineExpanded((open) => !open)}
              >
                {timelineExpanded ? (
                  <>
                    Show less
                    <ChevronUp size={14} strokeWidth={2.4} aria-hidden />
                  </>
                ) : (
                  <>
                    Show more
                    <span className="cust-timeline-more-count">{hiddenCount}</span>
                    <ChevronDown size={14} strokeWidth={2.4} aria-hidden />
                  </>
                )}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );

  return (
    <BottomSheet
      open={customer !== null}
      onClose={onClose}
      labelledBy="customer-drawer-name"
      className="merchant-theme"
    >
      {customer && (
        <div className="merchant-drawer">
          {showData ? (
            <>
              <div className="merchant-customer-profile-head">
                <div className="merchant-avatar merchant-avatar--lg" aria-hidden>
                  {getInitials(customer.name)}
                </div>
                <div className="merchant-customer-profile-identity">
                  <h3 id="customer-drawer-name" className="merchant-customer-profile-name">
                    {customer.name}
                  </h3>
                  <p className="merchant-customer-profile-since">
                    Member since {customer.memberSince}
                  </p>
                  {badge ? (
                    <span className={`merchant-badge ${badge.className}`}>{badge.label}</span>
                  ) : null}
                </div>
              </div>

              <div className="merchant-drawer-stats" aria-label="Loyalty metrics">
                <div className="merchant-drawer-stat">
                  <span className="merchant-drawer-stat-label">Visits</span>
                  <span className="merchant-drawer-stat-value">{customer.lifetimeVisits}</span>
                </div>
                <div className="merchant-drawer-stat">
                  <span className="merchant-drawer-stat-label">Stamps</span>
                  <span className="merchant-drawer-stat-value">
                    {customer.stamps}/{customer.totalStamps}
                  </span>
                </div>
                <div className="merchant-drawer-stat">
                  <span className="merchant-drawer-stat-label">Rewards claimed</span>
                  <span className="merchant-drawer-stat-value">{customer.rewardsClaimed}</span>
                </div>
              </div>

              <div className="merchant-drawer-rows">
                <div className="profile-row">
                  <div className="profile-row-icon">
                    <Phone size={18} strokeWidth={2.2} />
                  </div>
                  <div className="profile-row-copy">
                    <div className="profile-row-label">Mobile</div>
                    <div className="profile-row-value">{formatPhoneDisplay(customer.phone)}</div>
                  </div>
                </div>

                {customer.email ? (
                  <div className="profile-row">
                    <div className="profile-row-icon">
                      <Mail size={18} strokeWidth={2.2} />
                    </div>
                    <div className="profile-row-copy">
                      <div className="profile-row-label">Email</div>
                      <div className="profile-row-value">{customer.email}</div>
                    </div>
                  </div>
                ) : null}
              </div>

              {timelineSection}

              <label className="auth-field">
                <span className="auth-label">Merchant notes</span>
                <textarea
                  className="auth-input merchant-textarea"
                  rows={2}
                  placeholder="Private note — regular, prefers window seat…"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={2000}
                />
                {notesDirty ? (
                  <button
                    type="button"
                    className="merchant-action-btn merchant-action-btn--reject"
                    disabled={savingNotes}
                    onClick={() => {
                      setSavingNotes(true);
                      void onSaveNotes(customer.id, notes)
                        .then((ok) => {
                          if (ok) toast.success("Note saved");
                          else toast.error("Could not save note");
                        })
                        .finally(() => setSavingNotes(false));
                    }}
                  >
                    {savingNotes ? "Saving…" : "Save note"}
                  </button>
                ) : null}
              </label>
            </>
          ) : (
            <>
              <div className="merchant-customer-profile-head">
                <div className="merchant-avatar merchant-avatar--lg" aria-hidden>
                  {getInitials(customer.name)}
                </div>
                <div className="merchant-customer-profile-identity">
                  <h3 id="customer-drawer-name" className="merchant-customer-profile-name">
                    {customer.name}
                  </h3>
                  <p className="merchant-customer-profile-since">
                    Member since {customer.memberSince}
                  </p>
                  {badge ? (
                    <span className={`merchant-badge ${badge.className}`}>{badge.label}</span>
                  ) : null}
                </div>
              </div>

              {timelineSection}
            </>
          )}

          {confirm && canModerate ? (
            <div className="merchant-confirm">
              <p className="merchant-confirm-text">
                {confirm === "delete"
                  ? `Delete ${customer.name}? This permanently removes their loyalty and queue data across all products.`
                  : `Ban ${customer.name}? They won't be able to earn or redeem stamps.`}
              </p>
              <div className="merchant-confirm-actions">
                <button
                  type="button"
                  className="merchant-action-btn merchant-action-btn--reject"
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="merchant-action-btn merchant-action-btn--danger"
                  onClick={() => {
                    if (confirm === "delete") onDelete(customer.id);
                    else onBan(customer.id);
                    setConfirm(null);
                  }}
                >
                  {confirm === "delete" ? "Delete" : "Ban"}
                </button>
              </div>
            </div>
          ) : offering && canOfferStamp ? (
            <OfferStampOtp
              customerId={customer.id}
              customerName={customer.name}
              autoSend
              onRequestCode={() => onRequestOfferStampOtp!(customer.id)}
              onConfirm={async (code) => {
                const result = await onConfirmOfferStamp!(customer.id, code);
                if (result.ok) {
                  setOffering(false);
                  void getCustomerLoyaltyTimeline(customer.id).then((res) =>
                    setTimeline(res.events),
                  );
                }
                return result;
              }}
              onCancel={() => setOffering(false)}
            />
          ) : (
            <div className="merchant-drawer-actions merchant-drawer-actions--stack">
              {allowOfferStamp ? (
              <button
                type="button"
                className="merchant-action-btn merchant-action-btn--approve merchant-action-btn--block"
                disabled={!canOfferStamp}
                title={
                  customer.status === "reward_ready"
                    ? "Redeem their reward before offering another stamp"
                    : customer.status === "claimed"
                      ? "This rewards program is complete"
                      : customer.banned
                        ? "Unban this customer first"
                        : undefined
                }
                onClick={() => setOffering(true)}
              >
                <Stamp size={16} strokeWidth={2.3} />
                Offer stamp
              </button>
              ) : null}
              {canModerate ? (
                <div className="merchant-drawer-actions">
                  {customer.banned ? (
                    <button
                      type="button"
                      className="merchant-action-btn merchant-action-btn--reject"
                      onClick={() => onBan(customer.id)}
                    >
                      <ShieldCheck size={16} strokeWidth={2.3} />
                      Unban
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="merchant-action-btn merchant-action-btn--reject"
                      onClick={() => setConfirm("ban")}
                    >
                      <Ban size={16} strokeWidth={2.3} />
                      Ban
                    </button>
                  )}
                  <button
                    type="button"
                    className="merchant-action-btn merchant-action-btn--danger"
                    onClick={() => setConfirm("delete")}
                  >
                    <Trash2 size={16} strokeWidth={2.3} />
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
