import {
  CheckSquare,
  Clock3,
  History,
  LayoutGrid,
  ScanLine,
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
  { id: "queue", name: "Queue Management", tagline: "Live waitlists", Icon: Clock3 },
];

/** Product-scoped nav (top group of the contextual sidebar). */
export const PRODUCT_NAV: Record<MerchantProduct, NavItem[]> = {
  loyalty: [
    { id: "dashboard", label: "Overview", Icon: LayoutGrid },
    { id: "scan", label: "Scan", Icon: ScanLine },
    { id: "approvals", label: "Approvals", Icon: CheckSquare },
    { id: "loyalty-settings", label: "Settings", Icon: SlidersHorizontal },
  ],
  queue: [
    { id: "queue-home", label: "Home", Icon: LayoutGrid },
    { id: "queue-history", label: "History", Icon: History },
    { id: "queue-settings", label: "Settings", Icon: SlidersHorizontal },
  ],
};

/** Shared workspace nav (identical for every product). */
export const WORKSPACE_NAV: NavItem[] = [
  { id: "customers", label: "Customers", Icon: Users },
  { id: "profile", label: "Business settings", Icon: Store },
];

/** First tab shown when a product is selected. */
export const PRODUCT_DEFAULT_TAB: Record<MerchantProduct, MerchantTab> = {
  loyalty: "dashboard",
  queue: "queue-home",
};

/** Human labels for every tab (used by the header + deep links). */
export const TAB_LABELS: Record<MerchantTab, string> = {
  dashboard: "Overview",
  scan: "Scan reward",
  approvals: "Approvals",
  customers: "Customers",
  profile: "Business settings",
  "loyalty-settings": "Loyalty settings",
  "queue-home": "Home",
  "queue-history": "History",
  "queue-settings": "Queue settings",
};

const QUEUE_TABS = new Set<MerchantTab>(PRODUCT_NAV.queue.map((i) => i.id));

/** Which product a tab belongs to (workspace tabs stay on the current product). */
export function productForTab(tab: MerchantTab): MerchantProduct | null {
  if (QUEUE_TABS.has(tab)) return "queue";
  if (PRODUCT_NAV.loyalty.some((i) => i.id === tab)) return "loyalty";
  return null; // shared workspace tab
}

/** Canonical URL for every tab. Each dashboard page gets its own route. */
export const TAB_HREF: Record<MerchantTab, string> = {
  dashboard: "/merchant/loyalty",
  scan: "/merchant/loyalty/scan",
  approvals: "/merchant/loyalty/approvals",
  "loyalty-settings": "/merchant/loyalty/settings",
  "queue-home": "/merchant/queue",
  "queue-history": "/merchant/queue/history",
  "queue-settings": "/merchant/queue/settings",
  customers: "/merchant/customers",
  profile: "/merchant/settings",
};

const PATH_TO_TAB: Record<string, MerchantTab> = Object.fromEntries(
  (Object.entries(TAB_HREF) as [MerchantTab, string][]).map(([tab, href]) => [href, tab]),
);

/** Resolve the active tab from a pathname (defaults to the loyalty overview). */
export function tabForPathname(pathname: string): MerchantTab {
  const clean = pathname.replace(/\/+$/, "") || "/merchant";
  return PATH_TO_TAB[clean] ?? "dashboard";
}

/** Resolve the product owning a pathname, or null for shared workspace pages. */
export function productForPathname(pathname: string): MerchantProduct | null {
  if (pathname.startsWith("/merchant/queue")) return "queue";
  if (pathname.startsWith("/merchant/loyalty")) return "loyalty";
  return null;
}

export const ALL_TABS: MerchantTab[] = [
  ...PRODUCT_NAV.loyalty.map((i) => i.id),
  ...PRODUCT_NAV.queue.map((i) => i.id),
  ...WORKSPACE_NAV.map((i) => i.id),
];
