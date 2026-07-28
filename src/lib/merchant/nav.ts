import {
  BarChart3,
  CalendarCheck,
  ContactRound,
  History,
  LayoutGrid,
  SlidersHorizontal,
  Stamp,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { MerchantProduct, MerchantTab } from "./types";

export interface NavItem {
  id: MerchantTab;
  label: string;
  Icon: LucideIcon;
}

export interface ProductMeta {
  id: MerchantProduct;
  name: string;
  tagline: string;
  Icon: LucideIcon;
}

/** Products shown in the far-left rail, in order. */
export const PRODUCTS: ProductMeta[] = [
  { id: "loyalty", name: "Loyalty Stamps", tagline: "Repeat-visit rewards", Icon: Stamp },
  { id: "queue", name: "Queue Management", tagline: "Live waitlists", Icon: Users },
  { id: "reservation", name: "Reservations", tagline: "Table bookings", Icon: CalendarCheck },
];

/** Product-scoped nav (contextual sidebar). */
export const PRODUCT_NAV: Record<MerchantProduct, NavItem[]> = {
  loyalty: [
    { id: "dashboard", label: "Home", Icon: LayoutGrid },
    { id: "loyalty-customers", label: "Customers", Icon: Users },
    { id: "loyalty-history", label: "History", Icon: History },
    { id: "loyalty-settings", label: "Settings", Icon: SlidersHorizontal },
  ],
  queue: [
    { id: "queue-home", label: "Home", Icon: LayoutGrid },
    { id: "queue-customers", label: "Customers", Icon: Users },
    { id: "queue-history", label: "History", Icon: History },
    { id: "queue-settings", label: "Settings", Icon: SlidersHorizontal },
  ],
  reservation: [
    { id: "reservations-home", label: "Home", Icon: LayoutGrid },
    { id: "reservations-history", label: "History", Icon: History },
    { id: "reservations-settings", label: "Settings", Icon: SlidersHorizontal },
  ],
};

/** Shared workspace nav (identical for every product). */
export const WORKSPACE_NAV: NavItem[] = [
  { id: "customers", label: "All customers", Icon: ContactRound },
  { id: "analytics", label: "Analytics", Icon: BarChart3 },
  { id: "profile", label: "Business settings", Icon: Store },
];

/**
 * Owner-only workspace hubs. Analytics stays open to every role — it hosts the
 * loyalty analytics that used to live under the loyalty product nav.
 */
export const OWNER_WORKSPACE_TABS: MerchantTab[] = ["customers"];

const WORKSPACE_TABS = new Set<MerchantTab>(WORKSPACE_NAV.map((i) => i.id));

/** True for product-agnostic hubs: analytics, all customers, business settings. */
export function isWorkspaceTab(tab: MerchantTab): boolean {
  return WORKSPACE_TABS.has(tab);
}

/** Workspace nav visible for the given role. */
export function workspaceNavForRole(isOwner: boolean): NavItem[] {
  if (isOwner) return WORKSPACE_NAV;
  return WORKSPACE_NAV.filter((item) => !OWNER_WORKSPACE_TABS.includes(item.id));
}

/** First tab shown when a product is selected. */
export const PRODUCT_DEFAULT_TAB: Record<MerchantProduct, MerchantTab> = {
  loyalty: "dashboard",
  queue: "queue-home",
  reservation: "reservations-home",
};

/** Human labels for every tab (used by the header + deep links). */
export const TAB_LABELS: Record<MerchantTab, string> = {
  dashboard: "Home",
  "loyalty-history": "History",
  analytics: "Analytics",
  scan: "Scan reward",
  approvals: "Home",
  "loyalty-customers": "Loyalty customers",
  customers: "All customers",
  profile: "Business settings",
  "loyalty-settings": "Loyalty settings",
  "queue-home": "Home",
  "queue-customers": "Queue customers",
  "queue-history": "History",
  "queue-settings": "Queue settings",
  "reservations-home": "Home",
  "reservations-history": "History",
  "reservations-settings": "Reservation settings",
};

const QUEUE_TABS = new Set<MerchantTab>(PRODUCT_NAV.queue.map((i) => i.id));
const RESERVATION_TABS = new Set<MerchantTab>(PRODUCT_NAV.reservation.map((i) => i.id));

/** Which product a tab belongs to (workspace tabs stay on the current product). */
export function productForTab(tab: MerchantTab): MerchantProduct | null {
  if (QUEUE_TABS.has(tab)) return "queue";
  if (RESERVATION_TABS.has(tab)) return "reservation";
  if (PRODUCT_NAV.loyalty.some((i) => i.id === tab)) return "loyalty";
  return null; // shared workspace tab
}

/** Canonical URL for every tab. Each dashboard page gets its own route. */
export const TAB_HREF: Record<MerchantTab, string> = {
  dashboard: "/merchant/loyalty",
  "loyalty-history": "/merchant/loyalty/history",
  scan: "/merchant/loyalty/scan",
  approvals: "/merchant/loyalty",
  "loyalty-customers": "/merchant/loyalty/customers",
  "loyalty-settings": "/merchant/loyalty/settings",
  "queue-home": "/merchant/queue",
  "queue-customers": "/merchant/queue/customers",
  "queue-history": "/merchant/queue/history",
  "queue-settings": "/merchant/queue/settings",
  "reservations-home": "/merchant/reservations",
  "reservations-history": "/merchant/reservations/history",
  "reservations-settings": "/merchant/reservations/settings",
  customers: "/merchant/customers",
  analytics: "/merchant/analytics",
  profile: "/merchant/settings",
};

const PATH_TO_TAB: Record<string, MerchantTab> = Object.fromEntries(
  (Object.entries(TAB_HREF) as [MerchantTab, string][]).map(([tab, href]) => [href, tab]),
);

/** Resolve the active tab from a pathname (defaults to the loyalty overview). */
export function tabForPathname(pathname: string): MerchantTab {
  const clean = pathname.replace(/\/+$/, "") || "/merchant";
  if (clean === "/merchant/loyalty/plan") return "loyalty-settings";
  if (clean === "/merchant/queue/plan") return "queue-settings";
  if (clean === "/merchant/reservations/plan") return "reservations-settings";
  return PATH_TO_TAB[clean] ?? "dashboard";
}

/** Resolve the product owning a pathname, or null for shared workspace pages. */
export function productForPathname(pathname: string): MerchantProduct | null {
  if (pathname.startsWith("/merchant/queue")) return "queue";
  if (pathname.startsWith("/merchant/reservations")) return "reservation";
  if (pathname.startsWith("/merchant/loyalty")) return "loyalty";
  return null;
}

export const ALL_TABS: MerchantTab[] = [
  ...PRODUCT_NAV.loyalty.map((i) => i.id),
  ...PRODUCT_NAV.queue.map((i) => i.id),
  ...PRODUCT_NAV.reservation.map((i) => i.id),
  ...WORKSPACE_NAV.map((i) => i.id),
];
