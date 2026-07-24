"use client";

import {
  CheckSquare,
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
  onTabChange: (tab: MerchantTab) => void;
  onProductChange: (product: MerchantProduct) => void;
  pendingCount?: number;
}

interface MobileNavItem {
  id: MerchantTab;
  label: string;
  Icon: LucideIcon;
  primary?: boolean;
}

// Bottom-nav layouts per product (workspace tabs are woven in for quick reach).
const MOBILE_NAV: Record<MerchantProduct, MobileNavItem[]> = {
  loyalty: [
    { id: "dashboard", label: "Home", Icon: LayoutGrid },
    { id: "customers", label: "Customers", Icon: Users },
    { id: "scan", label: "Scan", Icon: ScanLine, primary: true },
    { id: "approvals", label: "Approve", Icon: CheckSquare },
    { id: "loyalty-settings", label: "Settings", Icon: SlidersHorizontal },
  ],
  queue: [
    { id: "queue-home", label: "Home", Icon: LayoutGrid },
    { id: "customers", label: "Customers", Icon: Users },
    { id: "queue-history", label: "History", Icon: History },
    { id: "queue-settings", label: "Settings", Icon: SlidersHorizontal },
    { id: "profile", label: "Profile", Icon: User },
  ],
};

export function MerchantNav({
  activeProduct,
  activeTab,
  onTabChange,
  onProductChange,
  pendingCount = 0,
}: MerchantNavProps) {
  const items = MOBILE_NAV[activeProduct];

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
          const isActive = activeTab === id;
          const showBadge = id === "approvals" && pendingCount > 0;

          if (primary) {
            return (
              <button
                key={id}
                type="button"
                className={`merchant-scan-btn${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                aria-label={label}
                onClick={() => onTabChange(id)}
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
              onClick={() => onTabChange(id)}
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
