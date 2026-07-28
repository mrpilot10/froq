"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Mail,
  Phone,
  Search,
  Stamp,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { deleteUnifiedCustomer, getUnifiedCustomers } from "@/app/merchant/actions";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import type { CustomerSource, UnifiedCustomer } from "@/lib/merchant/unified-customers";

type SourceKey = "all" | "loyalty" | "queue";
type SortKey = "recent" | "name" | "stamps" | "loyaltyVisits" | "queueVisits";
type DetailProduct = "loyalty" | "queue";

const SOURCES: { id: SourceKey; label: string }[] = [
  { id: "all", label: "All" },
  { id: "loyalty", label: "Loyalty" },
  { id: "queue", label: "Queue" },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "Recently seen" },
  { id: "name", label: "Name (A–Z)" },
  { id: "stamps", label: "Most stamps" },
  { id: "loyaltyVisits", label: "Most loyalty visits" },
  { id: "queueVisits", label: "Most queue visits" },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Phones arrive as +91…, 91… or bare national digits depending on the entry point. */
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

function sourceLabel(source: CustomerSource) {
  if (source === "both") return "Loyalty + Queue";
  return source === "loyalty" ? "Loyalty only" : "Queue only";
}

function exportCsv(rows: UnifiedCustomer[]) {
  const headers = [
    "Name",
    "Phone",
    "Email",
    "Products",
    "Stamps",
    "Loyalty visits",
    "Rewards redeemed",
    "Queue visits",
    "Seated",
    "No-shows",
    "Total guests",
    "Last seen",
  ];
  const body = rows.map((row) => [
    row.name,
    row.phone,
    row.email ?? "",
    sourceLabel(row.source),
    row.loyalty ? `${row.loyalty.stamps}/${row.loyalty.totalStamps}` : "",
    row.loyalty?.visits ?? "",
    row.loyalty?.rewardsClaimed ?? "",
    row.queue?.visits ?? "",
    row.queue?.seated ?? "",
    row.queue?.left ?? "",
    row.queue?.guests ?? "",
    row.lastSeenMs ? new Date(row.lastSeenMs).toISOString() : "",
  ]);
  const escape = (cell: string | number) => `"${String(cell).replace(/"/g, '""')}"`;
  const csv = [headers, ...body].map((row) => row.map(escape).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "froq-all-customers.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface Snapshot {
  /** Branch the rows belong to; a mismatch means a newer request is in flight. */
  key: string;
  customers: UnifiedCustomer[];
  truncated: boolean;
  fetchedAtMs: number;
}

/**
 * Workspace-level customers hub: one row per person, merged across loyalty and
 * queue, so the merchant sees stamps and waitlist history side by side.
 */
export function GlobalCustomersScreen() {
  const { profile, activeBranchId, onRefresh } = useMerchantWorkspace();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const requestKey = activeBranchId ?? "all";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getUnifiedCustomers({ branchId: activeBranchId });
      if (cancelled) return;
      setSnapshot({
        key: requestKey,
        customers: result.customers,
        truncated: result.truncated,
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

  const totals = useMemo(
    () => ({
      people: customers.length,
      loyalty: customers.filter((c) => c.loyalty).length,
      queue: customers.filter((c) => c.queue).length,
    }),
    [customers],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");

    const filtered = customers.filter((customer) => {
      if (source === "loyalty" && !customer.loyalty) return false;
      if (source === "queue" && !customer.queue) return false;
      if (!q) return true;
      if (customer.name.toLowerCase().includes(q)) return true;
      if (digits && customer.phone.replace(/\D/g, "").includes(digits)) return true;
      return (customer.email ?? "").toLowerCase().includes(q);
    });

    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "stamps") return (b.loyalty?.stamps ?? 0) - (a.loyalty?.stamps ?? 0);
      if (sort === "loyaltyVisits") return (b.loyalty?.visits ?? 0) - (a.loyalty?.visits ?? 0);
      if (sort === "queueVisits") return (b.queue?.visits ?? 0) - (a.queue?.visits ?? 0);
      return (b.lastSeenMs ?? 0) - (a.lastSeenMs ?? 0);
    });
  }, [customers, query, source, sort]);

  // Keep the open sheet stable even if the active filter no longer includes them.
  const selected = customers.find((c) => c.key === selectedKey) ?? null;
  const filtering = query.trim().length > 0 || source !== "all";

  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">All customers</h2>
        <p className="tab-sub">
          {loading
            ? `Everyone who has visited ${profile.businessName}`
            : filtering
              ? `${visible.length} of ${totals.people} people`
              : `${totals.people} people · ${totals.loyalty} loyalty · ${totals.queue} queue`}
        </p>
      </div>

      <div className="queue-tabs merchant-analytics-tabs" role="tablist" aria-label="Filter by product">
        {SOURCES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={source === id}
            className={`queue-tab${source === id ? " active" : ""}`}
            onClick={() => setSource(id)}
          >
            <span>{label}</span>
          </button>
        ))}
      </div>

      <label className="merchant-customer-search-field">
        <Search size={16} strokeWidth={2.2} aria-hidden />
        <input
          type="search"
          className="merchant-customer-search-input"
          placeholder="Search by name, phone, or email…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          enterKeyHint="search"
          aria-label="Search customers"
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
            aria-label="Sort customers"
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

        <button
          type="button"
          className="merchant-export-btn"
          disabled={visible.length === 0}
          onClick={() => exportCsv(visible)}
        >
          <Download size={14} strokeWidth={2.3} />
          Export
        </button>
      </div>

      {fresh?.truncated ? (
        <p className="lhist-truncated">
          Showing the most recent records only. Filter by branch to see a complete list.
        </p>
      ) : null}

      {loading ? (
        <CustomerListSkeleton />
      ) : visible.length === 0 ? (
        <div className="panel-card merchant-empty">
          <div className="merchant-empty-icon" aria-hidden="true">
            <Users size={26} strokeWidth={2} />
          </div>
          <p className="merchant-empty-title">
            {filtering ? "No matches" : "No customers yet"}
          </p>
          <p className="merchant-empty-sub">
            {filtering
              ? "Try a different name, number, or product filter."
              : "People appear here as soon as they join your loyalty program or a waitlist."}
          </p>
        </div>
      ) : (
        <div className="panel-card merchant-list-panel">
          <ul className="merchant-list">
            {visible.map((customer) => (
              <li key={customer.key} className="merchant-list-item">
                <button
                  type="button"
                  className={`merchant-list-btn ucust-row${customer.banned ? " is-banned" : ""}`}
                  onClick={() => setSelectedKey(customer.key)}
                >
                  <div className="merchant-avatar">{initials(customer.name)}</div>
                  <div className="merchant-list-copy">
                    <div className="merchant-list-title">
                      {customer.name}
                      {customer.banned ? (
                        <span className="merchant-badge merchant-badge--banned">Banned</span>
                      ) : null}
                    </div>
                    <div className="merchant-list-sub">
                      {displayPhone(customer.phone)} · {relativeFrom(customer.lastSeenMs, now)}
                    </div>
                  </div>
                  <div className="ucust-trail">
                    {customer.loyalty ? (
                      <span className="ucust-pill ucust-pill--loyalty" title="Loyalty stamps">
                        <Stamp size={11} strokeWidth={2.5} aria-hidden />
                        {customer.loyalty.stamps}/{customer.loyalty.totalStamps}
                      </span>
                    ) : null}
                    {customer.queue ? (
                      <span className="ucust-pill ucust-pill--queue" title="Queue visits">
                        <Users size={11} strokeWidth={2.5} aria-hidden />
                        {customer.queue.visits}
                      </span>
                    ) : null}
                  </div>
                  <ChevronRight
                    size={16}
                    strokeWidth={2.2}
                    className="merchant-list-arrow"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <CustomerSheet
        customer={selected}
        nowMs={now}
        onClose={() => setSelectedKey(null)}
        onDeleted={(key) => {
          setSelectedKey(null);
          setSnapshot((prev) =>
            prev
              ? { ...prev, customers: prev.customers.filter((row) => row.key !== key) }
              : prev,
          );
          void onRefresh();
        }}
      />
    </div>
  );
}

function CustomerListSkeleton() {
  return (
    <div className="panel-card merchant-list-panel" aria-busy="true">
      <ul className="merchant-list">
        {[0, 1, 2, 3, 4].map((index) => (
          <li key={index} className="merchant-list-item">
            <div className="merchant-list-btn ucust-row">
              <div className="sk sk-circle" style={{ width: 44, height: 44 }} />
              <div className="merchant-list-copy">
                <div className="sk sk-line" style={{ width: 130 }} />
                <div className="sk sk-line" style={{ width: 170, marginTop: 7 }} />
              </div>
              <div className="ucust-trail">
                <div className="sk" style={{ width: 48, height: 22, borderRadius: 999 }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CustomerSheet({
  customer,
  nowMs,
  onClose,
  onDeleted,
}: {
  customer: UnifiedCustomer | null;
  nowMs: number;
  onClose: () => void;
  onDeleted: (key: string) => void;
}) {
  return (
    <BottomSheet
      open={customer !== null}
      onClose={onClose}
      labelledBy="unified-customer-name"
      className="merchant-theme"
    >
      {customer ? (
        <CustomerSheetBody
          key={customer.key}
          customer={customer}
          nowMs={nowMs}
          onDeleted={onDeleted}
        />
      ) : null}
    </BottomSheet>
  );
}

function CustomerSheetBody({
  customer,
  nowMs,
  onDeleted,
}: {
  customer: UnifiedCustomer;
  nowMs: number;
  onDeleted: (key: string) => void;
}) {
  const hasLoyalty = Boolean(customer.loyalty);
  const hasQueue = Boolean(customer.queue);
  const [product, setProduct] = useState<DetailProduct>(
    customer.source === "queue" && !hasLoyalty ? "queue" : "loyalty",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const showSwitcher = hasLoyalty && hasQueue;
  const activeProduct: DetailProduct =
    product === "loyalty" && !hasLoyalty && hasQueue
      ? "queue"
      : product === "queue" && !hasQueue && hasLoyalty
        ? "loyalty"
        : product;

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      const result = await deleteUnifiedCustomer({
        customerId: customer.customerId,
        phone: customer.phone,
      });
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete customer.");
        return;
      }
      toast.success(`${customer.name} removed from all products`);
      onDeleted(customer.key);
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="merchant-drawer">
      <div className="merchant-drawer-head">
        <div className="merchant-avatar merchant-avatar--lg">{initials(customer.name)}</div>
        <div className="merchant-drawer-head-copy">
          <h3 id="unified-customer-name" className="merchant-drawer-name">
            {customer.name}
          </h3>
          <span className="merchant-list-sub">{sourceLabel(customer.source)}</span>
        </div>
      </div>

      {showSwitcher ? (
        <div
          className="queue-tabs merchant-analytics-tabs"
          role="tablist"
          aria-label="Customer product"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeProduct === "loyalty"}
            className={`queue-tab${activeProduct === "loyalty" ? " active" : ""}`}
            onClick={() => setProduct("loyalty")}
          >
            <Stamp size={14} strokeWidth={2.3} aria-hidden />
            <span>Loyalty</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeProduct === "queue"}
            className={`queue-tab${activeProduct === "queue" ? " active" : ""}`}
            onClick={() => setProduct("queue")}
          >
            <Users size={14} strokeWidth={2.3} aria-hidden />
            <span>Queue</span>
          </button>
        </div>
      ) : null}

      {activeProduct === "loyalty" && customer.loyalty ? (
        <div className="merchant-drawer-stats">
          <div className="merchant-drawer-stat merchant-drawer-stat--accent">
            <span className="merchant-drawer-stat-label">Stamps</span>
            <span className="merchant-drawer-stat-value">
              {customer.loyalty.stamps}/{customer.loyalty.totalStamps}
            </span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">Visits</span>
            <span className="merchant-drawer-stat-value">{customer.loyalty.visits}</span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">Rewards</span>
            <span className="merchant-drawer-stat-value">
              {customer.loyalty.rewardsClaimed}
            </span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">Last stamp</span>
            <span className="merchant-drawer-stat-value">
              {relativeFrom(customer.loyalty.lastVisitMs, nowMs)}
            </span>
          </div>
        </div>
      ) : null}

      {activeProduct === "queue" && customer.queue ? (
        <div className="merchant-drawer-stats">
          <div className="merchant-drawer-stat merchant-drawer-stat--accent">
            <span className="merchant-drawer-stat-label">Queue visits</span>
            <span className="merchant-drawer-stat-value">{customer.queue.visits}</span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">Seated</span>
            <span className="merchant-drawer-stat-value">{customer.queue.seated}</span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">No-shows</span>
            <span className="merchant-drawer-stat-value">{customer.queue.left}</span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">Total guests</span>
            <span className="merchant-drawer-stat-value">{customer.queue.guests}</span>
          </div>
        </div>
      ) : null}

      {!customer.loyalty && !customer.queue ? (
        <p className="merchant-empty-sub" style={{ margin: 0 }}>
          No product activity recorded yet.
        </p>
      ) : null}

      <div className="merchant-drawer-rows">
        <div className="profile-row">
          <div className="profile-row-icon">
            <Phone size={18} strokeWidth={2.2} />
          </div>
          <div className="profile-row-copy">
            <div className="profile-row-label">Mobile</div>
            <div className="profile-row-value">{displayPhone(customer.phone)}</div>
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

        <div className="profile-row">
          <div className="profile-row-icon">
            <Stamp size={18} strokeWidth={2.2} />
          </div>
          <div className="profile-row-copy">
            <div className="profile-row-label">
              {customer.memberSinceMs ? "Member since" : "Last seen"}
            </div>
            <div className="profile-row-value">
              {customer.memberSinceMs
                ? new Date(customer.memberSinceMs).toLocaleDateString([], {
                    month: "long",
                    year: "numeric",
                  })
                : relativeFrom(customer.lastSeenMs, nowMs)}
            </div>
          </div>
        </div>
      </div>

      {confirmDelete ? (
        <div className="merchant-confirm">
          <p className="merchant-confirm-text">
            Delete {customer.name}? This permanently removes their loyalty stamps,
            rewards, and queue history. This cannot be undone.
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
              onClick={() => void handleDelete()}
            >
              {deleting ? "Deleting…" : "Delete everywhere"}
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
            Delete customer
          </button>
        </div>
      )}
    </div>
  );
}
