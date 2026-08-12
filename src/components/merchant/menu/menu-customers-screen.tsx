"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cake,
  CalendarDays,
  ChevronRight,
  Mail,
  Phone,
  Search,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { formatPhoneDisplay } from "@/lib/auth/format";
import {
  fetchMenuCustomerActivity,
  fetchMenuCustomers,
  type MenuCustomerActivity,
  type MenuCustomerRow,
} from "@/app/merchant/menu-customers-actions";

type SortKey = "recent" | "name" | "visits";

const SORTS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "Recently seen" },
  { id: "name", label: "Name (A–Z)" },
  { id: "visits", label: "Most visits" },
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

function visitWhen(ms: number) {
  return new Date(ms).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function activityTitle(row: MenuCustomerActivity) {
  if (row.kind === "special_offers") return "Guest verification";
  if (row.orderCount > 0) return `Ordered ${row.orderCount} round${row.orderCount === 1 ? "" : "s"}`;
  return "Menu visit";
}

function activityMeta(row: MenuCustomerActivity) {
  const bits: string[] = [];
  if (row.partySize) bits.push(`Party of ${row.partySize}`);
  if (row.tableLabel) bits.push(row.tableLabel);
  else if (row.tableNumber) bits.push(`Table ${row.tableNumber}`);
  if (row.dishNames.length > 0) {
    bits.push(row.dishNames.slice(0, 3).join(", "));
  }
  return bits.join(" · ") || row.status;
}

/** Guests who used the digital menu — captures + dining sessions. */
export function MenuCustomersScreen() {
  const { profile, activeBranchId, branches } = useMerchantWorkspace();
  const [customers, setCustomers] = useState<MenuCustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;
  const viewingAllBranches = activeBranchId === null && branches.length > 1;
  const branchLabel = activeBranch?.name ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchMenuCustomers({ branchId: activeBranchId });
    setLoading(false);
    if (result.ok && result.customers) setCustomers(result.customers);
    else setCustomers([]);
  }, [activeBranchId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      if (sort === "visits") return b.visits - a.visits;
      return b.lastSeenMs - a.lastSeenMs;
    });
  }, [customers, query, sort]);

  const searching = query.trim().length > 0;
  const selected = customers.find((row) => row.key === selectedKey) ?? null;

  const headSub = (() => {
    if (loading) {
      return branchLabel
        ? `Guests at ${branchLabel} · ${profile.businessName}`
        : `Guests who used the menu at ${profile.businessName}`;
    }
    if (searching) return `${visible.length} of ${customers.length} guests`;
    if (branchLabel) {
      return `${customers.length} guest${customers.length === 1 ? "" : "s"} at ${branchLabel}`;
    }
    if (viewingAllBranches) {
      return `${customers.length} guest${customers.length === 1 ? "" : "s"} across all branches`;
    }
    return `${customers.length} guest${customers.length === 1 ? "" : "s"} from the digital menu`;
  })();

  const emptySub = searching
    ? "Try a different name or number."
    : "When guests verify their details on the menu, they appear here with their contact details and visits.";

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">Menu customers</h2>
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
          aria-label="Search menu customers"
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
            aria-label="Sort menu customers"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
          >
            {SORTS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
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
            {searching ? "No matches" : "No menu guests yet"}
          </p>
          <p className="merchant-empty-sub">{emptySub}</p>
        </div>
      ) : (
        <div className="panel-card merchant-list-panel qcust-list-scroll">
          <ul className="merchant-list">
            {visible.map((customer) => (
              <li key={customer.key} className="merchant-list-item">
                <button
                  type="button"
                  className="merchant-list-btn qcust-row"
                  onClick={() => setSelectedKey(customer.key)}
                  aria-label={`Open ${customer.name}`}
                >
                  <span className="merchant-avatar" aria-hidden>
                    {initials(customer.name)}
                  </span>
                  <span className="merchant-list-copy">
                    <span className="merchant-list-title">{customer.name}</span>
                    <span className="merchant-list-sub">
                      {displayPhone(customer.phone)}
                      {" · "}
                      {customer.visits} visit{customer.visits === 1 ? "" : "s"}
                      {" · "}
                      {relativeFrom(customer.lastSeenMs, now)}
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    strokeWidth={2.2}
                    className="merchant-list-chevron"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <MenuCustomerSheet
        customer={selected}
        branchId={activeBranchId}
        onClose={() => setSelectedKey(null)}
      />
    </div>
  );
}

function MenuCustomerSheet({
  customer,
  branchId,
  onClose,
}: {
  customer: MenuCustomerRow | null;
  branchId: string | null;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={customer !== null}
      onClose={onClose}
      labelledBy="mcust-sheet-name"
      className="merchant-theme"
    >
      {customer ? (
        <MenuCustomerSheetBody
          key={`${customer.key}:${branchId ?? "all"}`}
          customer={customer}
          branchId={branchId}
        />
      ) : null}
    </BottomSheet>
  );
}

function MenuCustomerSheetBody({
  customer,
  branchId,
}: {
  customer: MenuCustomerRow;
  branchId: string | null;
}) {
  const [activity, setActivity] = useState<MenuCustomerActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(customer.email);
  const [birthdate, setBirthdate] = useState<string | null>(customer.birthdate);

  useEffect(() => {
    let cancelled = false;
    void fetchMenuCustomerActivity({
      customerId: customer.customerId,
      phone: customer.phone,
      branchId,
    }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error ?? "Could not load activity.");
        return;
      }
      setActivity(result.activity ?? []);
      if (result.email) setEmail(result.email);
      if (result.birthdate) setBirthdate(result.birthdate);
    });
    return () => {
      cancelled = true;
    };
  }, [customer.customerId, customer.phone, branchId]);

  const birthdayLabel = birthdate
    ? new Date(`${birthdate}T00:00:00`).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <div className="merchant-drawer">
      <div className="qcust-head">
        <div className="merchant-avatar merchant-avatar--lg" aria-hidden>
          {initials(customer.name)}
        </div>
        <div className="qcust-head-copy">
          <h3 id="mcust-sheet-name" className="qcust-head-name">
            {customer.name}
          </h3>
          <p className="qcust-head-meta">
            <span>Menu guest</span>
            {customer.lastSeenMs ? (
              <span>Last seen {relativeFrom(customer.lastSeenMs, Date.now())}</span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="qcust-stats" aria-label="Menu metrics">
        <div className="qcust-stat">
          <span className="qcust-stat-value">{customer.visits}</span>
          <span className="qcust-stat-label">Visits</span>
        </div>
        <div className="qcust-stat">
          <span className="qcust-stat-value">
            {customer.lastPartySize ?? "—"}
          </span>
          <span className="qcust-stat-label">Last party</span>
        </div>
        <div className="qcust-stat">
          <span className="qcust-stat-value">{activity.length || "—"}</span>
          <span className="qcust-stat-label">Sessions</span>
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

        {birthdayLabel ? (
          <div className="qcust-contact-row">
            <span className="qcust-contact-icon" aria-hidden>
              <Cake size={15} strokeWidth={2.3} />
            </span>
            <span className="qcust-contact-copy">
              <span className="qcust-contact-label">Birthday</span>
              <span className="qcust-contact-value">{birthdayLabel}</span>
            </span>
          </div>
        ) : null}
      </div>

      <div className="merchant-settings-group">
        <h3 className="merchant-settings-title">
          Menu activity{" "}
          {!loading && activity.length > 0 ? (
            <span className="qcust-visit-count">{activity.length}</span>
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
        ) : activity.length === 0 ? (
          <p className="cust-timeline-empty">No menu activity recorded</p>
        ) : (
          <ul className="qhist-guest-list">
            {activity.map((row) => (
              <li key={row.id}>
                <div className="qhist-guest-row" style={{ cursor: "default" }}>
                  <span className="qcust-visit-date" aria-hidden>
                    <span className="qcust-visit-day">
                      <CalendarDays size={14} strokeWidth={2.2} />
                    </span>
                    <span className="qcust-visit-time">
                      {visitWhen(row.openedAtMs).split(",").pop()?.trim() ?? ""}
                    </span>
                  </span>
                  <div className="qhist-guest-copy">
                    <div className="qhist-guest-name">{activityTitle(row)}</div>
                    <div className="qhist-guest-meta">
                      {visitWhen(row.openedAtMs)}
                      {" · "}
                      {activityMeta(row)}
                    </div>
                  </div>
                  <span className="qcust-contact-icon" aria-hidden>
                    <UtensilsCrossed size={14} strokeWidth={2.2} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
