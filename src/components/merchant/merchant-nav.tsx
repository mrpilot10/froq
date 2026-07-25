"use client";

import {
  BarChart3,
  History,
  LayoutGrid,
  ScanLine,
  SlidersHorizontal,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PRODUCTS } from "@/lib/merchant/nav";
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
  { id: "loyalty-analytics", label: "Analytics", Icon: BarChart3 },
  { id: "loyalty-settings", label: "Settings", Icon: SlidersHorizontal },
];

const QUEUE_NAV: MobileNavItem[] = [
  { id: "queue-home", label: "Home", Icon: LayoutGrid },
  { id: "queue-history", label: "History", Icon: History },
  { id: "queue-settings", label: "Settings", Icon: SlidersHorizontal },
  { id: "profile", label: "Profile", Icon: User },
];

export function MerchantNav({
  activeProduct,
  activeTab,
  onTabChange,
  onProductChange,
  onScan,
  pendingCount = 0,
}: MerchantNavProps) {
  const items = activeProduct === "loyalty" ? LOYALTY_NAV : QUEUE_NAV;

  return (
    <div className="nav-dock">
      <div className="merchant-nav-switch" role="tablist" aria-label="Switch product">
        {PRODUCTS.map(({ id, name, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeProduct === id}
            className={`merchant-nav-switch-btn${activeProduct === id ? " active" : ""}`}
            onClick={() => onProductChange(id)}
          >
            <Icon size={14} strokeWidth={2.4} />
            <span>{name}</span>
          </button>
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

          return (
            <button
              key={id}
              type="button"
              className={`nav-item${isActive ? " active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onTabChange(id as MerchantTab)}
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
            </button>
          );
        })}
      </nav>
    </div>
  );
}
