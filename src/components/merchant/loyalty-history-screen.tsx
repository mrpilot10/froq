"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Gift, History, Stamp, Users, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { getLoyaltyHistory, type LoyaltyHistoryEvent } from "@/app/merchant/actions";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { CustomerDrawer } from "@/components/merchant/customer-drawer";
import { ROLE_LABELS } from "@/lib/merchant/roles";
import type { MemberRole } from "@/lib/merchant/types";

type RangeKey = "7d" | "30d" | "6m" | "all";
type SortKey = "newest" | "oldest";
type TypeKey = "all" | "stamp" | "reward";

const RANGES: { id: RangeKey; label: string; days: number | null }[] = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "6m", label: "6 months", days: 183 },
  { id: "all", label: "All time", days: null },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
];

const TYPES: { id: TypeKey; label: string }[] = [
  { id: "all", label: "All activity" },
  { id: "stamp", label: "Stamps only" },
  { id: "reward", label: "Rewards only" },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function staffLine(name: string | null, role: MemberRole | null) {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return {
    name: trimmed,
    roleLabel: role ? ROLE_LABELS[role] : null,
  };
}

/** Summary tile that shows a shimmer instead of a misleading 0 while loading. */
function SummaryStat({
  Icon,
  value,
  label,
  loading,
}: {
  Icon: LucideIcon;
  value: number;
  label: string;
  loading: boolean;
}) {
  return (
    <div className="qhist-summary-stat">
      <span className="qhist-summary-icon">
        <Icon size={17} strokeWidth={2.3} />
      </span>
      <div className="qhist-summary-copy">
        {loading ? (
          <span className="sk sk-line" style={{ width: 30, height: 17, marginBottom: 4 }} />
        ) : (
          <span className="qhist-summary-value">{value}</span>
        )}
        <span className="qhist-summary-label">{label}</span>
      </div>
    </div>
  );
}

function formatWhen(ms: number) {
  const date = new Date(ms);
  const day = date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

/** Group label for the day an event happened. */
function dayLabel(ms: number, nowMs: number) {
  const startOf = (value: number) => {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const diffDays = Math.round((startOf(nowMs) - startOf(ms)) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Date(ms).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

interface HistorySnapshot {
  /** Branch + range the rows belong to; a mismatch means we are still loading. */
  key: string;
  events: LoyaltyHistoryEvent[];
  truncated: boolean;
  fetchedAtMs: number;
}

export function LoyaltyHistoryScreen() {
  const {
    profile,
    activeBranchId,
    customers,
    role,
    onBanCustomer,
    onDeleteCustomer,
    onSaveCustomerNotes,
    onRequestOfferStampOtp,
    onConfirmOfferStamp,
  } = useMerchantWorkspace();
  const allBranches = activeBranchId === null;
  const [range, setRange] = useState<RangeKey>("7d");
  const [sort, setSort] = useState<SortKey>("newest");
  const [type, setType] = useState<TypeKey>("all");
  const [snapshot, setSnapshot] = useState<HistorySnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const days = RANGES.find((r) => r.id === range)?.days ?? null;
  const requestKey = `${activeBranchId ?? "all"}:${days ?? "all"}`;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getLoyaltyHistory({ branchId: activeBranchId, days });
      if (cancelled) return;
      setSnapshot({
        key: requestKey,
        events: result.events,
        truncated: result.truncated,
        fetchedAtMs: Date.now(),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBranchId, days, requestKey]);

  const fresh = snapshot?.key === requestKey ? snapshot : null;
  const loading = fresh === null;
  const events = useMemo(() => fresh?.events ?? [], [fresh]);
  const truncated = fresh?.truncated ?? false;
  const now = fresh?.fetchedAtMs ?? 0;

  const visible = useMemo(() => {
    const filtered = type === "all" ? events : events.filter((e) => e.type === type);
    return sort === "oldest" ? [...filtered].reverse() : filtered;
  }, [events, type, sort]);

  const totals = useMemo(() => {
    const stamps = events.filter((e) => e.type === "stamp").length;
    const rewards = events.filter((e) => e.type === "reward").length;
    const uniqueCustomers = new Set(
      events.map((e) => e.customerId).filter((id): id is string => Boolean(id)),
    ).size;
    return { stamps, rewards, customers: uniqueCustomers };
  }, [events]);

  // Insert a day heading whenever the calendar day changes down the list.
  const rows = useMemo(() => {
    const out: { key: string; heading?: string; event?: LoyaltyHistoryEvent }[] = [];
    let lastHeading: string | null = null;
    for (const event of visible) {
      const heading = dayLabel(event.atMs, now);
      if (heading !== lastHeading) {
        out.push({ key: `head:${heading}:${event.id}`, heading });
        lastHeading = heading;
      }
      out.push({ key: event.id, event });
    }
    return out;
  }, [visible, now]);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  const openCustomer = (event: LoyaltyHistoryEvent) => {
    if (!event.customerId) {
      toast.error("Customer record is no longer available");
      return;
    }
    const match = customers.find((c) => c.id === event.customerId);
    if (!match) {
      toast.error("Customer record is no longer available");
      return;
    }
    setSelectedId(match.id);
  };

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">History</h2>
        <p className="tab-sub">
          {allBranches
            ? `Stamps and rewards across every branch at ${profile.businessName}`
            : `Every stamp and reward at ${profile.businessName}`}
        </p>
      </div>

      <div className="qhist-summary">
        <SummaryStat Icon={Stamp} value={totals.stamps} label="Stamps" loading={loading} />
        <SummaryStat Icon={Gift} value={totals.rewards} label="Rewards" loading={loading} />
        <SummaryStat Icon={Users} value={totals.customers} label="Customers" loading={loading} />
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

        <div className="lhist-selects">
          <label className="qhist-sort">
            <select
              aria-label="Filter activity"
              value={type}
              onChange={(e) => setType(e.target.value as TypeKey)}
            >
              {TYPES.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} strokeWidth={2.4} className="qhist-sort-chevron" />
          </label>

          <label className="qhist-sort">
            <select
              aria-label="Sort activity"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {SORTS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} strokeWidth={2.4} className="qhist-sort-chevron" />
          </label>
        </div>
      </div>

      {truncated && (
        <p className="lhist-truncated">
          Showing the most recent activity only. Narrow the date range to see a
          complete list.
        </p>
      )}

      {loading ? (
        <div className="lhist-list" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="panel-card lhist-item lhist-item--loading">
              <div className="sk" style={{ width: 38, height: 38, borderRadius: 12 }} />
              <div className="lhist-copy">
                <div className="sk sk-line" style={{ width: 140 }} />
                <div className="sk sk-line" style={{ width: 90, marginTop: 6 }} />
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="panel-card merchant-empty">
          <div className="merchant-empty-icon">
            <History size={24} strokeWidth={2.2} />
          </div>
          <p className="merchant-empty-title">No activity in this range</p>
          <p className="merchant-empty-sub">
            Stamps and reward redemptions will appear here as customers visit.
          </p>
        </div>
      ) : (
        <div className="lhist-list">
          {rows.map(({ key, heading, event }) =>
            heading ? (
              <div key={key} className="lhist-day">
                {heading}
              </div>
            ) : event ? (
              (() => {
                const staff = staffLine(event.staffName, event.staffRole);
                return (
                  <button
                    key={key}
                    type="button"
                    className="panel-card lhist-item lhist-item--clickable"
                    onClick={() => openCustomer(event)}
                  >
                    <span className={`lhist-icon lhist-icon--${event.type}`}>
                      {event.type === "stamp" ? (
                        <Stamp size={17} strokeWidth={2.3} />
                      ) : (
                        <Gift size={17} strokeWidth={2.3} />
                      )}
                    </span>

                    <div className="lhist-copy">
                      <div className="lhist-title">{event.customerName}</div>
                      {allBranches && event.branchName ? (
                        <span className="merchant-branch-badge">{event.branchName}</span>
                      ) : null}
                      {staff ? (
                        <div className="lhist-actor">
                          <span className="lhist-actor-avatar" aria-hidden>
                            {initials(staff.name)}
                          </span>
                          <span className="lhist-actor-text">
                            <span className="lhist-actor-by">By </span>
                            <span className="lhist-actor-name">{staff.name}</span>
                            {staff.roleLabel ? (
                              <span className="lhist-actor-role">{staff.roleLabel}</span>
                            ) : null}
                          </span>
                        </div>
                      ) : (
                        <div className="lhist-actor lhist-actor--muted">Staff not recorded</div>
                      )}
                    </div>

                    <div className="lhist-meta">
                      <span className={`lhist-meta-action lhist-meta-action--${event.type}`}>
                        {event.type === "stamp" ? "Stamp collected" : "Reward claimed"}
                      </span>
                      <span className="lhist-meta-when">{formatWhen(event.atMs)}</span>
                    </div>

                    <ChevronRight
                      size={16}
                      strokeWidth={2.2}
                      className="lhist-chevron"
                      aria-hidden
                    />
                  </button>
                );
              })()
            ) : null,
          )}
        </div>
      )}

      <CustomerDrawer
        customer={selected}
        role={role}
        onClose={() => setSelectedId(null)}
        onBan={onBanCustomer}
        onDelete={(id) => {
          onDeleteCustomer(id);
          setSelectedId(null);
        }}
        onSaveNotes={onSaveCustomerNotes}
        allowOfferStamp={!allBranches}
        onRequestOfferStampOtp={allBranches ? undefined : onRequestOfferStampOtp}
        onConfirmOfferStamp={allBranches ? undefined : onConfirmOfferStamp}
      />
    </div>
  );
}
