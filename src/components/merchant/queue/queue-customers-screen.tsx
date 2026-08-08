"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Users,
  X,
} from "lucide-react";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { useUnifiedCustomers } from "@/components/merchant/use-unified-customers";
import { formatWaitShort } from "@/lib/queue/format";
import { queueGuestStatusLabel } from "@/lib/queue/session-history";
import { QueueCustomerSheet } from "./queue-customer-sheet";

type SortKey = "recent" | "name" | "visits" | "seated";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "Recently seen" },
  { id: "name", label: "Name (A–Z)" },
  { id: "visits", label: "Most queue visits" },
  { id: "seated", label: "Most seated" },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function displayPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  if (national.length !== 10) return phone || "No phone";
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
}

function relativeFrom(ms: number | null, nowMs: number) {
  if (!ms) return "—";
  const days = Math.floor((nowMs - ms) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** Queue product customers — every guest who has ever joined, any status. */
export function QueueCustomersScreen() {
  const { profile, activeBranchId, branches } = useMerchantWorkspace();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { customers, loading, fetchedAtMs: now } = useUnifiedCustomers("queue");

  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;
  const viewingAllBranches = activeBranchId === null && branches.length > 1;
  const branchLabel = activeBranch?.name ?? null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const filtered = customers.filter((customer) => {
      if (!q) return true;
      if (customer.name.toLowerCase().includes(q)) return true;
      if (digits && customer.phone.replace(/\D/g, "").includes(digits)) return true;
      return (customer.email ?? "").toLowerCase().includes(q);
    });

    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "visits") return (b.queue?.visits ?? 0) - (a.queue?.visits ?? 0);
      if (sort === "seated") return (b.queue?.seated ?? 0) - (a.queue?.seated ?? 0);
      return (b.queue?.lastJoinedMs ?? b.lastSeenMs ?? 0) - (a.queue?.lastJoinedMs ?? a.lastSeenMs ?? 0);
    });
  }, [customers, query, sort]);

  const searching = query.trim().length > 0;
  // Keep the open sheet stable even if the search no longer matches them.
  const selected = customers.find((row) => row.key === selectedKey) ?? null;

  const headSub = (() => {
    if (loading) {
      if (branchLabel) {
        return `Guest directory for the ${branchLabel} queue at ${profile.businessName}`;
      }
      if (viewingAllBranches) {
        return `Guests across every branch queue at ${profile.businessName}`;
      }
      return `Guests who have joined a queue at ${profile.businessName}`;
    }
    if (searching) return `${visible.length} of ${customers.length} guests`;
    if (branchLabel) {
      return `${customers.length} guest${customers.length === 1 ? "" : "s"} at ${branchLabel}`;
    }
    if (viewingAllBranches) {
      return `${customers.length} guest${customers.length === 1 ? "" : "s"} across all branches`;
    }
    return `${customers.length} guest${customers.length === 1 ? "" : "s"} across all queue sessions`;
  })();

  const emptySub = searching
    ? "Try a different name or number."
    : branchLabel
      ? `This is the guest directory for ${branchLabel} — waiting, called, seated, and left all appear here after they join this branch’s queue.`
      : viewingAllBranches
        ? "Guests from every branch’s queue appear here — waiting, called, seated, or left. Switch to a branch to narrow the list."
        : "Waiting, called, seated, and left guests appear here as soon as they join your queue.";

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Queue customers</h2>
        <p className="tab-sub">{headSub}</p>
      </div>

      <label className="merchant-customer-search-field">
        <Search size={16} strokeWidth={2.2} aria-hidden />
        <input
          type="search"
          className="merchant-customer-search-input"
          placeholder="Search by name or phone…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          enterKeyHint="search"
          aria-label="Search queue customers"
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

      <div className="merchant-toolbar">
        <label className="merchant-sort">
          <span className="merchant-sort-label">Sort</span>
          <select
            className="merchant-select"
            aria-label="Sort queue customers"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            {SORTS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} strokeWidth={2.4} className="merchant-sort-chevron" aria-hidden />
        </label>
      </div>

      {loading ? (
        <div className="panel-card merchant-list-panel" aria-busy="true">
          <ul className="merchant-list">
            {[0, 1, 2, 3, 4].map((index) => (
              <li key={index} className="merchant-list-item">
                <div className="merchant-list-btn">
                  <div className="sk sk-circle" style={{ width: 44, height: 44 }} />
                  <div className="merchant-list-copy">
                    <div className="sk sk-line" style={{ width: 130 }} />
                    <div className="sk sk-line" style={{ width: 170, marginTop: 7 }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : visible.length === 0 ? (
        <div className="panel-card merchant-empty">
          <div className="merchant-empty-icon" aria-hidden="true">
            <Users size={26} strokeWidth={2} />
          </div>
          <p className="merchant-empty-title">
            {searching ? "No matches" : "No queue guests yet"}
          </p>
          <p className="merchant-empty-sub">{emptySub}</p>
        </div>
      ) : (
        <div className="panel-card merchant-list-panel qcust-list-scroll">
          <ul className="merchant-list">
            {visible.map((customer) => {
              const lastStatus = customer.queue?.lastStatus ?? null;
              return (
                <li key={customer.key} className="merchant-list-item">
                  <button
                    type="button"
                    className="merchant-list-btn qcust-row"
                    onClick={() => setSelectedKey(customer.key)}
                    aria-label={`Open ${customer.name}`}
                  >
                    <div className="merchant-avatar">{initials(customer.name)}</div>
                    <div className="merchant-list-copy">
                      <div className="merchant-list-title">
                        {customer.name}
                        {lastStatus ? (
                          <span
                            className={`qhist-guest-status qhist-guest-status--${lastStatus} qcust-last-status`}
                          >
                            {queueGuestStatusLabel(lastStatus)}
                          </span>
                        ) : null}
                      </div>
                      <div className="merchant-list-sub">
                        {displayPhone(customer.phone)} ·{" "}
                        {relativeFrom(customer.queue?.lastJoinedMs ?? customer.lastSeenMs, now)}
                      </div>
                      <div className="merchant-list-sub" style={{ marginTop: 4 }}>
                        {customer.queue?.visits ?? 0} visit
                        {(customer.queue?.visits ?? 0) === 1 ? "" : "s"} ·{" "}
                        {customer.queue?.seated ?? 0} seated
                        {(customer.queue?.left ?? 0) > 0
                          ? ` · ${customer.queue?.left} left`
                          : ""}
                      </div>
                    </div>
                    <div className="merchant-list-trailing">
                      <span className="merchant-ltv-amount">
                        {customer.queue?.avgWaitMinutes != null
                          ? formatWaitShort(customer.queue.avgWaitMinutes)
                          : "—"}
                      </span>
                      <span className="merchant-list-sub">Avg wait</span>
                    </div>
                    <ChevronRight
                      size={16}
                      strokeWidth={2.2}
                      className="merchant-list-arrow"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <QueueCustomerSheet
        customer={selected}
        branchId={activeBranchId}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  );
}
