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
import { RESERVATION_STATUS_META } from "@/lib/merchant/reservations";
import { ReservationCustomerSheet } from "./reservation-customer-sheet";

type SortKey = "recent" | "name" | "bookings" | "completed";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "Recently booked" },
  { id: "name", label: "Name (A–Z)" },
  { id: "bookings", label: "Most bookings" },
  { id: "completed", label: "Most completed" },
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

/** Reservations product customers — every guest who has ever booked a table. */
export function ReservationCustomersScreen() {
  const { profile, activeBranchId, branches } = useMerchantWorkspace();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { customers, loading, fetchedAtMs: now } =
    useUnifiedCustomers("reservation");

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
      if (sort === "bookings")
        return (b.reservation?.bookings ?? 0) - (a.reservation?.bookings ?? 0);
      if (sort === "completed")
        return (b.reservation?.completed ?? 0) - (a.reservation?.completed ?? 0);
      return (
        (b.reservation?.lastBookedMs ?? b.lastSeenMs ?? 0) -
        (a.reservation?.lastBookedMs ?? a.lastSeenMs ?? 0)
      );
    });
  }, [customers, query, sort]);

  const searching = query.trim().length > 0;
  const selected = customers.find((row) => row.key === selectedKey) ?? null;

  const headSub = (() => {
    if (loading) {
      if (branchLabel) {
        return `Guest directory for reservations at ${branchLabel} · ${profile.businessName}`;
      }
      if (viewingAllBranches) {
        return `Guests across every branch’s reservations at ${profile.businessName}`;
      }
      return `Guests who have booked a table at ${profile.businessName}`;
    }
    if (searching) return `${visible.length} of ${customers.length} guests`;
    if (branchLabel) {
      return `${customers.length} guest${customers.length === 1 ? "" : "s"} at ${branchLabel}`;
    }
    if (viewingAllBranches) {
      return `${customers.length} guest${customers.length === 1 ? "" : "s"} across all branches`;
    }
    return `${customers.length} guest${customers.length === 1 ? "" : "s"} across all bookings`;
  })();

  const emptySub = searching
    ? "Try a different name or number."
    : branchLabel
      ? `This is the guest directory for ${branchLabel} — pending, confirmed, completed, and cancelled bookings all appear here.`
      : viewingAllBranches
        ? "Guests from every branch’s reservations appear here. Switch to a branch to narrow the list."
        : "Guests appear here as soon as they request or receive a table booking.";

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Reservation customers</h2>
        <p className="tab-sub">{headSub}</p>
      </div>

      <div className="rcust-toolbar">
        <label className="merchant-customer-search-field rcust-toolbar-search">
          <Search size={16} strokeWidth={2.2} aria-hidden />
          <input
            type="search"
            className="merchant-customer-search-input"
            placeholder="Search by name or phone…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
            enterKeyHint="search"
            aria-label="Search reservation customers"
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

        <label className="merchant-sort rcust-toolbar-sort">
          <span className="merchant-sort-label">Sort</span>
          <select
            className="merchant-select"
            aria-label="Sort reservation customers"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            {SORTS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            strokeWidth={2.4}
            className="merchant-sort-chevron"
            aria-hidden
          />
        </label>
      </div>

      {loading ? (
        <div className="panel-card merchant-list-panel merchant-customers-panel" aria-busy="true">
          <ul className="merchant-list">
            {[0, 1, 2, 3].map((index) => (
              <li key={index} className="merchant-list-item">
                <div className="rcust-row">
                  <div className="sk sk-circle" style={{ width: 44, height: 44 }} />
                  <div className="rcust-row-main">
                    <div className="rcust-row-identity">
                      <div className="sk sk-line" style={{ width: 140 }} />
                      <div className="sk sk-line" style={{ width: 160, marginTop: 8 }} />
                    </div>
                    <div className="rcust-rail" aria-hidden>
                      {[0, 1, 2].map((cell) => (
                        <div key={cell} className="rcust-rail-cell">
                          <div className="sk sk-line" style={{ width: 22, height: 18 }} />
                          <div className="sk sk-line" style={{ width: 36, marginTop: 4 }} />
                        </div>
                      ))}
                    </div>
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
            {searching ? "No matches" : "No reservation guests yet"}
          </p>
          <p className="merchant-empty-sub">{emptySub}</p>
        </div>
      ) : (
        <div className="panel-card merchant-list-panel merchant-customers-panel qcust-list-scroll">
          <ul className="merchant-list">
            {visible.map((customer) => {
              const stats = customer.reservation;
              const lastStatus = stats?.lastStatus ?? null;
              const statusMeta = lastStatus
                ? RESERVATION_STATUS_META[lastStatus]
                : null;
              const bookings = stats?.bookings ?? 0;
              const completed = stats?.completed ?? 0;
              const noShows = stats?.noShows ?? 0;
              const guests = stats?.guests ?? 0;

              return (
                <li key={customer.key} className="merchant-list-item">
                  <button
                    type="button"
                    className="rcust-row"
                    onClick={() => setSelectedKey(customer.key)}
                    aria-label={`Open ${customer.name}`}
                  >
                    <div className="merchant-avatar">{initials(customer.name)}</div>

                    <div className="rcust-row-main">
                      <div className="rcust-row-identity">
                        <div className="rcust-row-name-line">
                          <span className="merchant-list-title">{customer.name}</span>
                          {statusMeta ? (
                            <span
                              className={`merchant-badge merchant-badge--${statusMeta.cls}`}
                            >
                              {statusMeta.label}
                            </span>
                          ) : null}
                          {/* Rare enough to earn a flag here rather than a rail
                              column that would sit at zero on most guests. */}
                          {noShows > 0 ? (
                            <span className="rcust-noshow-flag">
                              {noShows} no-show{noShows === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </div>
                        <span className="merchant-list-sub">
                          {displayPhone(customer.phone)} ·{" "}
                          {relativeFrom(
                            stats?.lastBookedMs ?? customer.lastSeenMs,
                            now,
                          )}
                        </span>
                      </div>

                      {/* Fixed three columns so the numbers stack in a straight
                          line down the list instead of shifting per row. */}
                      <div
                        className="rcust-rail"
                        aria-label={`${bookings} bookings, ${completed} arrived, ${guests} guests`}
                      >
                        <div className="rcust-rail-cell">
                          <span className="rcust-rail-value">{bookings}</span>
                          <span className="rcust-rail-label">Booked</span>
                        </div>
                        <div className="rcust-rail-cell">
                          <span className="rcust-rail-value">{completed}</span>
                          <span className="rcust-rail-label">Arrived</span>
                        </div>
                        <div className="rcust-rail-cell rcust-rail-cell--accent">
                          <span className="rcust-rail-value">{guests}</span>
                          <span className="rcust-rail-label">Guests</span>
                        </div>
                      </div>
                    </div>

                    <ChevronRight
                      size={16}
                      strokeWidth={2.2}
                      className="merchant-list-arrow merchant-cust-row-chevron"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ReservationCustomerSheet
        customer={selected}
        branchId={activeBranchId}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  );
}
