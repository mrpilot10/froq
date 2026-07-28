"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Search,
  Users,
  X,
} from "lucide-react";
import { getUnifiedCustomers } from "@/app/merchant/actions";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { formatWaitShort } from "@/lib/queue/format";
import type { UnifiedCustomer } from "@/lib/merchant/unified-customers";

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

interface Snapshot {
  key: string;
  customers: UnifiedCustomer[];
  fetchedAtMs: number;
}

/** Queue product customers — everyone who has joined a waitlist. */
export function QueueCustomersScreen() {
  const { profile, activeBranchId } = useMerchantWorkspace();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const requestKey = activeBranchId ?? "all";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getUnifiedCustomers({ branchId: activeBranchId });
      if (cancelled) return;
      setSnapshot({
        key: requestKey,
        customers: result.customers.filter((row) => row.queue),
        fetchedAtMs: Date.now(),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBranchId, requestKey]);

  const fresh = snapshot?.key === requestKey ? snapshot : null;
  const loading = fresh === null;
  const customers = useMemo(() => fresh?.customers ?? [], [fresh]);
  const now = fresh?.fetchedAtMs ?? Date.now();

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

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Queue customers</h2>
        <p className="tab-sub">
          {loading
            ? `Guests who have joined a waitlist at ${profile.businessName}`
            : searching
              ? `${visible.length} of ${customers.length} guests`
              : `${customers.length} guests on the waitlist`}
        </p>
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
          <p className="merchant-empty-sub">
            {searching
              ? "Try a different name or number."
              : "Guests appear here as soon as they join your waitlist."}
          </p>
        </div>
      ) : (
        <div className="panel-card merchant-list-panel">
          <ul className="merchant-list">
            {visible.map((customer) => (
              <li key={customer.key} className="merchant-list-item">
                <div className="merchant-list-btn">
                  <div className="merchant-avatar">{initials(customer.name)}</div>
                  <div className="merchant-list-copy">
                    <div className="merchant-list-title">{customer.name}</div>
                    <div className="merchant-list-sub">
                      {displayPhone(customer.phone)} ·{" "}
                      {relativeFrom(customer.queue?.lastJoinedMs ?? customer.lastSeenMs, now)}
                    </div>
                    <div className="merchant-list-sub" style={{ marginTop: 4 }}>
                      {customer.queue?.visits ?? 0} visit
                      {(customer.queue?.visits ?? 0) === 1 ? "" : "s"} ·{" "}
                      {customer.queue?.seated ?? 0} seated
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
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
