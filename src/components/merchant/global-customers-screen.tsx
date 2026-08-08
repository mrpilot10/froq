"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ContactRound,
  Download,
  Mail,
  Phone,
  Search,
  Stamp,
  Trash2,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { deleteUnifiedCustomer } from "@/app/merchant/actions";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { useUnifiedCustomers } from "@/components/merchant/use-unified-customers";
import {
  PRODUCTS,
  comingSoonAfterProduct,
  comingSoonBeforeProducts,
  type ComingSoonProduct,
} from "@/lib/merchant/nav";
import type { MerchantProduct } from "@/lib/merchant/types";
import type { UnifiedCustomer } from "@/lib/merchant/unified-customers";

type LiveSourceKey = "all" | MerchantProduct;
type TabId = LiveSourceKey | string;
type SortKey =
  | "recent"
  | "name"
  | "stamps"
  | "loyaltyVisits"
  | "queueVisits"
  | "bookings"
  | "menuVisits";
type DetailProduct = MerchantProduct;

type CustomersTab =
  | { id: "all"; name: string; Icon: typeof ContactRound; soon: false }
  | { id: MerchantProduct; name: string; Icon: (typeof PRODUCTS)[number]["Icon"]; soon: false }
  | {
      id: string;
      name: string;
      Icon: ComingSoonProduct["Icon"];
      soon: true;
      product: ComingSoonProduct;
    };

function buildCustomersTabs(): CustomersTab[] {
  const tabs: CustomersTab[] = [{ id: "all", name: "All", Icon: ContactRound, soon: false }];
  for (const product of comingSoonBeforeProducts()) {
    tabs.push({
      id: product.id,
      name: product.name,
      Icon: product.Icon,
      soon: true,
      product,
    });
  }
  for (const live of PRODUCTS) {
    tabs.push({ id: live.id, name: live.name, Icon: live.Icon, soon: false });
    for (const product of comingSoonAfterProduct(live.id)) {
      tabs.push({
        id: product.id,
        name: product.name,
        Icon: product.Icon,
        soon: true,
        product,
      });
    }
  }
  return tabs;
}

const CUSTOMERS_TABS = buildCustomersTabs();
const SOON_IDS = new Set(
  CUSTOMERS_TABS.filter((tab): tab is Extract<CustomersTab, { soon: true }> => tab.soon).map(
    (tab) => tab.id,
  ),
);

function isLiveSource(id: TabId): id is LiveSourceKey {
  return id === "all" || !SOON_IDS.has(id);
}

const SORTS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "Recently seen" },
  { id: "name", label: "Name (A–Z)" },
  { id: "stamps", label: "Most stamps" },
  { id: "loyaltyVisits", label: "Most loyalty visits" },
  { id: "queueVisits", label: "Most queue visits" },
  { id: "bookings", label: "Most bookings" },
  { id: "menuVisits", label: "Most menu visits" },
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

function sourceLabel(customer: UnifiedCustomer) {
  const parts: string[] = [];
  if (customer.loyalty) parts.push("Loyalty");
  if (customer.queue) parts.push("Queue");
  if (customer.reservation) parts.push("Reservations");
  if (customer.menu) parts.push("Menu");
  if (parts.length === 0) return "Unknown";
  if (parts.length === 1) return `${parts[0]} only`;
  return parts.join(" + ");
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
    "Reservation bookings",
    "Completed bookings",
    "Menu visits",
    "Guest verifications",
    "Last seen",
  ];
  const body = rows.map((row) => [
    row.name,
    row.phone,
    row.email ?? "",
    sourceLabel(row),
    row.loyalty ? `${row.loyalty.stamps}/${row.loyalty.totalStamps}` : "",
    row.loyalty?.visits ?? "",
    row.loyalty?.rewardsClaimed ?? "",
    row.queue?.visits ?? "",
    row.queue?.seated ?? "",
    row.queue?.left ?? "",
    row.queue?.guests ?? "",
    row.reservation?.bookings ?? "",
    row.reservation?.completed ?? "",
    row.menu?.visits ?? "",
    row.menu?.specialOffers ?? "",
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

/**
 * Workspace-level customers hub: one row per person, merged across loyalty and
 * queue, so the merchant sees stamps and waitlist history side by side.
 */
export function GlobalCustomersScreen() {
  const { profile, onRefresh } = useMerchantWorkspace();
  const [query, setQuery] = useState("");
  const [tabId, setTabId] = useState<TabId>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const {
    customers,
    loading,
    truncated,
    fetchedAtMs: now,
    refresh,
  } = useUnifiedCustomers("all");

  const source: LiveSourceKey = isLiveSource(tabId) ? tabId : "all";
  const soonTab = CUSTOMERS_TABS.find(
    (tab): tab is Extract<CustomersTab, { soon: true }> => tab.soon && tab.id === tabId,
  );
  const SoonIcon = soonTab?.Icon;

  const totals = useMemo(
    () => ({
      people: customers.length,
      loyalty: customers.filter((c) => c.loyalty).length,
      queue: customers.filter((c) => c.queue).length,
      reservation: customers.filter((c) => c.reservation).length,
      menu: customers.filter((c) => c.menu).length,
    }),
    [customers],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");

    const filtered = customers.filter((customer) => {
      if (source === "loyalty" && !customer.loyalty) return false;
      if (source === "queue" && !customer.queue) return false;
      if (source === "reservation" && !customer.reservation) return false;
      if (source === "menu" && !customer.menu) return false;
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
      if (sort === "bookings")
        return (b.reservation?.bookings ?? 0) - (a.reservation?.bookings ?? 0);
      if (sort === "menuVisits") return (b.menu?.visits ?? 0) - (a.menu?.visits ?? 0);
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
          {soonTab
            ? soonTab.product.tagline
            : loading
              ? `Everyone who has visited ${profile.businessName}`
              : filtering
                ? `${visible.length} of ${totals.people} people`
                : `${totals.people} people · ${totals.loyalty} loyalty · ${totals.queue} queue · ${totals.reservation} reservations · ${totals.menu} menu`}
        </p>
      </div>

      <div className="queue-tabs merchant-analytics-tabs" role="tablist" aria-label="Filter by product">
        {CUSTOMERS_TABS.map((tab) => {
          const Icon = tab.Icon;
          const selectedTab = tabId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selectedTab}
              className={`queue-tab${selectedTab ? " active" : ""}${tab.soon ? " queue-tab--soon" : ""}`}
              onClick={() => setTabId(tab.id)}
            >
              <Icon size={15} strokeWidth={2.3} aria-hidden="true" />
              <span>{tab.name}</span>
              {tab.soon ? <span className="queue-tab-soon">Soon</span> : null}
            </button>
          );
        })}
      </div>

      {soonTab && SoonIcon ? (
        <div className="panel-card merchant-analytics-coming-soon">
          <div className="merchant-coming-soon-icon" aria-hidden>
            <SoonIcon size={28} strokeWidth={2.1} />
          </div>
          <span className="merchant-coming-soon-badge">Coming soon</span>
          <h3 className="merchant-coming-soon-name">{soonTab.product.name}</h3>
          <p className="merchant-coming-soon-headline">{soonTab.product.headline}</p>
          <p className="merchant-coming-soon-sub">
            Guests for this product will show up here as soon as it launches.
          </p>
        </div>
      ) : (
        <>
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

      {truncated ? (
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
              : "People appear here as soon as they join loyalty, a waitlist, book a table, or leave details on your menu."}
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
                    <div className="ucust-name-line">
                      <span className="merchant-list-title">{customer.name}</span>
                      {customer.banned && customer.loyalty ? (
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
                    {customer.reservation ? (
                      <span
                        className="ucust-pill ucust-pill--reservation"
                        title="Reservation bookings"
                      >
                        {customer.reservation.bookings}
                      </span>
                    ) : null}
                    {customer.menu ? (
                      <span className="ucust-pill ucust-pill--menu" title="Menu visits">
                        <UtensilsCrossed size={11} strokeWidth={2.5} aria-hidden />
                        {customer.menu.visits}
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
        onDeleted={() => {
          setSelectedKey(null);
          void refresh();
          void onRefresh();
        }}
      />
        </>
      )}
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
  const hasReservation = Boolean(customer.reservation);
  const hasMenu = Boolean(customer.menu);
  const [product, setProduct] = useState<DetailProduct>(() => {
    if (customer.source === "menu" && !hasLoyalty && !hasQueue && !hasReservation) return "menu";
    if (customer.source === "reservation" && !hasLoyalty && !hasQueue) return "reservation";
    if (customer.source === "queue" && !hasLoyalty) return "queue";
    if (hasLoyalty) return "loyalty";
    if (hasQueue) return "queue";
    if (hasReservation) return "reservation";
    return "menu";
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const productCount = [hasLoyalty, hasQueue, hasReservation, hasMenu].filter(Boolean).length;
  const showSwitcher = productCount > 1;

  function resolveActiveProduct(preferred: DetailProduct): DetailProduct {
    if (preferred === "loyalty" && hasLoyalty) return "loyalty";
    if (preferred === "queue" && hasQueue) return "queue";
    if (preferred === "reservation" && hasReservation) return "reservation";
    if (preferred === "menu" && hasMenu) return "menu";
    if (hasLoyalty) return "loyalty";
    if (hasQueue) return "queue";
    if (hasReservation) return "reservation";
    return "menu";
  }

  const activeProduct = resolveActiveProduct(product);

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
            <span className="ucust-name-line">
              <span>{customer.name}</span>
              {customer.banned && customer.loyalty ? (
                <span className="merchant-badge merchant-badge--banned">Banned</span>
              ) : null}
            </span>
          </h3>
          <span className="merchant-list-sub">{sourceLabel(customer)}</span>
        </div>
      </div>

      {showSwitcher ? (
        <div
          className="queue-tabs merchant-analytics-tabs"
          role="tablist"
          aria-label="Customer product"
        >
          {hasLoyalty ? (
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
          ) : null}
          {hasQueue ? (
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
          ) : null}
          {hasReservation ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeProduct === "reservation"}
              className={`queue-tab${activeProduct === "reservation" ? " active" : ""}`}
              onClick={() => setProduct("reservation")}
            >
              <span>Reservations</span>
            </button>
          ) : null}
          {hasMenu ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeProduct === "menu"}
              className={`queue-tab${activeProduct === "menu" ? " active" : ""}`}
              onClick={() => setProduct("menu")}
            >
              <UtensilsCrossed size={14} strokeWidth={2.3} aria-hidden />
              <span>Menu</span>
            </button>
          ) : null}
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

      {activeProduct === "reservation" && customer.reservation ? (
        <div className="merchant-drawer-stats">
          <div className="merchant-drawer-stat merchant-drawer-stat--accent">
            <span className="merchant-drawer-stat-label">Bookings</span>
            <span className="merchant-drawer-stat-value">
              {customer.reservation.bookings}
            </span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">Completed</span>
            <span className="merchant-drawer-stat-value">
              {customer.reservation.completed}
            </span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">No-shows</span>
            <span className="merchant-drawer-stat-value">
              {customer.reservation.noShows}
            </span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">Last booked</span>
            <span className="merchant-drawer-stat-value">
              {relativeFrom(customer.reservation.lastBookedMs, nowMs)}
            </span>
          </div>
        </div>
      ) : null}

      {activeProduct === "menu" && customer.menu ? (
        <div className="merchant-drawer-stats">
          <div className="merchant-drawer-stat merchant-drawer-stat--accent">
            <span className="merchant-drawer-stat-label">Menu visits</span>
            <span className="merchant-drawer-stat-value">{customer.menu.visits}</span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">Guest verifications</span>
            <span className="merchant-drawer-stat-value">{customer.menu.specialOffers}</span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">Last party</span>
            <span className="merchant-drawer-stat-value">
              {customer.menu.lastPartySize ?? "—"}
            </span>
          </div>
          <div className="merchant-drawer-stat">
            <span className="merchant-drawer-stat-label">Last seen</span>
            <span className="merchant-drawer-stat-value">
              {relativeFrom(customer.menu.lastSeenMs, nowMs)}
            </span>
          </div>
        </div>
      ) : null}

      {!customer.loyalty && !customer.queue && !customer.reservation && !customer.menu ? (
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
