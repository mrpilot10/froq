import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  ContactRound,
  History,
  LayoutGrid,
  SlidersHorizontal,
  Stamp,
  Store,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { MENU_PREVIEW } from "./feature-flags";
import type { MerchantProduct, MerchantTab } from "./types";

export interface NavItem {
  id: MerchantTab;
  label: string;
  Icon: LucideIcon;
}

/** Product marks — Lucide icons shared across rail, drawers, and analytics tabs. */
export type ProductIcon = LucideIcon;

export interface ProductMeta {
  id: MerchantProduct;
  name: string;
  tagline: string;
  Icon: ProductIcon;
}

/** Preview products shown in the rail / menus but not yet launchable. */
export interface ComingSoonProduct {
  id: string;
  name: string;
  tagline: string;
  headline: string;
  Icon: ProductIcon;
  /**
   * Where to insert in the product list.
   * `null` = before all live products; otherwise after that product id.
   */
  insertAfter: MerchantProduct | null;
}

/** Coming-soon products shown in the rail / menus. */
export const COMING_SOON_PRODUCTS: ComingSoonProduct[] = [
  // Once the preview flag is on, AI Menu is a live product instead of a teaser.
  ...(MENU_PREVIEW
    ? []
    : [
        {
          id: "digital-menu",
          name: "Digital AI Menu",
          tagline: "Coming soon",
          headline: "Let Customer Talk To Your AI Powered Digital Menu",
          Icon: UtensilsCrossed,
          insertAfter: null,
        } satisfies ComingSoonProduct,
      ]),
];

/** Coming-soon items that render before any live product. */
export function comingSoonBeforeProducts(): ComingSoonProduct[] {
  return COMING_SOON_PRODUCTS.filter((p) => p.insertAfter === null);
}

/** Coming-soon items that render immediately after a given live product. */
export function comingSoonAfterProduct(productId: MerchantProduct): ComingSoonProduct[] {
  return COMING_SOON_PRODUCTS.filter((p) => p.insertAfter === productId);
}

/** Live products shown in the far-left rail, in order. AI Menu leads. */
export const PRODUCTS: ProductMeta[] = [
  ...(MENU_PREVIEW
    ? [
        {
          id: "menu",
          name: "AI Menu",
          tagline: "Talk-to-order menu",
          Icon: UtensilsCrossed,
        } satisfies ProductMeta,
      ]
    : []),
  { id: "loyalty", name: "Loyalty Stamps", tagline: "Repeat-visit rewards", Icon: Stamp },
  { id: "queue", name: "Smart Queue", tagline: "Live waitlists", Icon: Users },
  { id: "reservation", name: "Reservations", tagline: "Table bookings", Icon: CalendarCheck },
];

/** Product-scoped nav (contextual sidebar). */
export const PRODUCT_NAV: Record<MerchantProduct, NavItem[]> = {
  loyalty: [
    { id: "dashboard", label: "Home", Icon: LayoutGrid },
    { id: "loyalty-customers", label: "Customers", Icon: ContactRound },
    { id: "loyalty-history", label: "History", Icon: History },
    { id: "loyalty-settings", label: "Settings", Icon: SlidersHorizontal },
  ],
  queue: [
    { id: "queue-home", label: "Home", Icon: LayoutGrid },
    { id: "queue-customers", label: "Customers", Icon: ContactRound },
    { id: "queue-history", label: "History", Icon: History },
    { id: "queue-settings", label: "Settings", Icon: SlidersHorizontal },
  ],
  reservation: [
    { id: "reservations-home", label: "Home", Icon: LayoutGrid },
    { id: "reservations-customers", label: "Customers", Icon: ContactRound },
    { id: "reservations-history", label: "History", Icon: History },
    { id: "reservations-settings", label: "Settings", Icon: SlidersHorizontal },
  ],
  menu: [
    { id: "menu-home", label: "Home", Icon: LayoutGrid },
    { id: "menu-items", label: "Menu", Icon: BookOpen },
    { id: "menu-customers", label: "Customers", Icon: ContactRound },
    { id: "menu-settings", label: "Settings", Icon: SlidersHorizontal },
  ],
};

/** Shared workspace nav (identical for every product). */
export const WORKSPACE_NAV: NavItem[] = [
  { id: "customers", label: "All customers", Icon: ContactRound },
  { id: "analytics", label: "Analytics", Icon: BarChart3 },
  { id: "profile", label: "Business settings", Icon: Store },
];

/**
 * Owner-only workspace hubs. Analytics is gated separately for managers + owners.
 */
export const OWNER_WORKSPACE_TABS: MerchantTab[] = ["customers"];

/** Tabs only owners and managers may open. */
export const ANALYTICS_WORKSPACE_TABS: MerchantTab[] = ["analytics"];

/** Business settings page — owners and managers (store identity is owner-only inside). */
export const BUSINESS_SETTINGS_TABS: MerchantTab[] = ["profile"];

const WORKSPACE_TABS = new Set<MerchantTab>(WORKSPACE_NAV.map((i) => i.id));

/** True for product-agnostic hubs: analytics, all customers, business settings. */
export function isWorkspaceTab(tab: MerchantTab): boolean {
  return WORKSPACE_TABS.has(tab);
}

/** Workspace nav — full list for every role; access is gated on click. */
export function workspaceNavForRole(_isOwner?: boolean): NavItem[] {
  return WORKSPACE_NAV;
}

/** First tab shown when a product is selected. */
export const PRODUCT_DEFAULT_TAB: Record<MerchantProduct, MerchantTab> = {
  loyalty: "dashboard",
  queue: "queue-home",
  reservation: "reservations-home",
  menu: "menu-home",
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
  "reservations-customers": "Reservation customers",
  "reservations-history": "History",
  "reservations-settings": "Reservation settings",
  "menu-home": "Home",
  "menu-items": "Menu",
  "menu-customers": "Menu customers",
  "menu-settings": "Menu settings",
};

const QUEUE_TABS = new Set<MerchantTab>(PRODUCT_NAV.queue.map((i) => i.id));
const RESERVATION_TABS = new Set<MerchantTab>(PRODUCT_NAV.reservation.map((i) => i.id));
const MENU_TABS = new Set<MerchantTab>(PRODUCT_NAV.menu.map((i) => i.id));

/** Which product a tab belongs to (workspace tabs stay on the current product). */
export function productForTab(tab: MerchantTab): MerchantProduct | null {
  if (QUEUE_TABS.has(tab)) return "queue";
  if (RESERVATION_TABS.has(tab)) return "reservation";
  if (MENU_TABS.has(tab)) return "menu";
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
  "reservations-customers": "/merchant/reservations/customers",
  "reservations-history": "/merchant/reservations/history",
  "reservations-settings": "/merchant/reservations/settings",
  "menu-home": "/merchant/menu",
  // "items" keeps the Menu tab from living at /merchant/menu/menu.
  "menu-items": "/merchant/menu/items",
  "menu-customers": "/merchant/menu/customers",
  "menu-settings": "/merchant/menu/settings",
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
  if (clean === "/merchant/menu/plan") return "menu-settings";
  return PATH_TO_TAB[clean] ?? "dashboard";
}

/** Resolve the product owning a pathname, or null for shared workspace pages. */
export function productForPathname(pathname: string): MerchantProduct | null {
  if (pathname.startsWith("/merchant/queue")) return "queue";
  if (pathname.startsWith("/merchant/reservations")) return "reservation";
  if (pathname.startsWith("/merchant/loyalty")) return "loyalty";
  if (pathname.startsWith("/merchant/menu")) return "menu";
  return null;
}

export const ALL_TABS: MerchantTab[] = [
  ...PRODUCT_NAV.loyalty.map((i) => i.id),
  ...PRODUCT_NAV.queue.map((i) => i.id),
  ...PRODUCT_NAV.reservation.map((i) => i.id),
  ...PRODUCT_NAV.menu.map((i) => i.id),
  ...WORKSPACE_NAV.map((i) => i.id),
];
