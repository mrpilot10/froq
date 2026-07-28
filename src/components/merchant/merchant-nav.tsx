"use client";

import Link from "next/link";
import {
  History,
  LayoutGrid,
  ScanLine,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PRODUCT_DEFAULT_TAB, PRODUCTS, TAB_HREF } from "@/lib/merchant/nav";
import type { MerchantProduct, MerchantTab } from "@/lib/merchant/types";

interface MerchantNavProps {
  activeProduct: MerchantProduct;
  activeTab: MerchantTab;
  isOwner?: boolean;
  onTabChange: (tab: MerchantTab) => void;
  onProductChange: (product: MerchantProduct) => void;
  /** Opens redeem/scan sheet (loyalty primary action). */
  onScan?: () => void;
  pendingCount?: number;
}

interface MobileNavItem {
  id: MerchantTab | "scan-action";
  label: string;
  Icon: LucideIcon;
  primary?: boolean;
}

const LOYALTY_NAV: MobileNavItem[] = [
  { id: "dashboard", label: "Home", Icon: LayoutGrid },
  { id: "loyalty-customers", label: "Customers", Icon: Users },
  { id: "scan-action", label: "Scan", Icon: ScanLine, primary: true },
  { id: "loyalty-history", label: "History", Icon: History },
  { id: "loyalty-settings", label: "Settings", Icon: SlidersHorizontal },
];

const QUEUE_NAV: MobileNavItem[] = [
  { id: "queue-home", label: "Home", Icon: LayoutGrid },
  { id: "queue-customers", label: "Customers", Icon: Users },
  { id: "queue-history", label: "History", Icon: History },
  { id: "queue-settings", label: "Settings", Icon: SlidersHorizontal },
];

const RESERVATION_NAV: MobileNavItem[] = [
  { id: "reservations-home", label: "Home", Icon: LayoutGrid },
  { id: "reservations-history", label: "History", Icon: History },
  { id: "reservations-settings", label: "Settings", Icon: SlidersHorizontal },
];

const PRODUCT_MOBILE_NAV: Record<MerchantProduct, MobileNavItem[]> = {
  loyalty: LOYALTY_NAV,
  queue: QUEUE_NAV,
  reservation: RESERVATION_NAV,
};

export function MerchantNav({
  activeProduct,
  activeTab,
  onTabChange,
  onProductChange,
  onScan,
  pendingCount = 0,
}: MerchantNavProps) {
  const items = PRODUCT_MOBILE_NAV[activeProduct] ?? LOYALTY_NAV;

  return (
    <div className="nav-dock">
      <div className="merchant-nav-switch" role="tablist" aria-label="Switch product">
        {PRODUCTS.map(({ id, name, Icon }) => (
          <Link
            key={id}
            href={TAB_HREF[PRODUCT_DEFAULT_TAB[id]]}
            prefetch
            role="tab"
            aria-selected={activeProduct === id}
            className={`merchant-nav-switch-btn${activeProduct === id ? " active" : ""}`}
            onClick={(event) => {
              event.preventDefault();
              onProductChange(id);
            }}
          >
            <Icon size={14} strokeWidth={2.4} />
            <span>{name}</span>
          </Link>
        ))}
      </div>

      <nav className="nav-bar merchant-nav-bar" aria-label="Merchant navigation">
        {items.map(({ id, label, Icon, primary }) => {
          const isActive = id !== "scan-action" && activeTab === id;
          const showBadge = id === "dashboard" && pendingCount > 0;

          if (primary) {
            return (
              <button
                key={id}
                type="button"
                className="merchant-scan-btn"
                aria-label={label}
                onClick={() => onScan?.()}
              >
                <Icon size={22} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </button>
            );
          }

          const tab = id as MerchantTab;
          return (
            <Link
              key={id}
              href={TAB_HREF[tab]}
              prefetch
              className={`nav-item${isActive ? " active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                onTabChange(tab);
              }}
            >
              <span className="merchant-nav-icon-wrap">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.4 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {showBadge && (
                  <span className="merchant-nav-badge" aria-label={`${pendingCount} pending`}>
                    {pendingCount}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
