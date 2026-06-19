"use client";

import { CheckSquare, LayoutGrid, ScanLine, User, Users } from "lucide-react";
import type { MerchantTab } from "@/lib/merchant/types";

interface MerchantNavProps {
  activeTab: MerchantTab;
  onTabChange: (tab: MerchantTab) => void;
  pendingCount?: number;
}

const NAV_ITEMS: Array<{
  id: MerchantTab;
  label: string;
  Icon: typeof LayoutGrid;
}> = [
  { id: "dashboard", label: "Home", Icon: LayoutGrid },
  { id: "customers", label: "Customers", Icon: Users },
  { id: "scan", label: "Scan", Icon: ScanLine },
  { id: "approvals", label: "Approve", Icon: CheckSquare },
  { id: "profile", label: "Profile", Icon: User },
];

export function MerchantNav({ activeTab, onTabChange, pendingCount = 0 }: MerchantNavProps) {
  return (
    <div className="nav-dock">
      <nav className="nav-bar merchant-nav-bar" aria-label="Merchant navigation">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          const isScan = id === "scan";
          const showBadge = id === "approvals" && pendingCount > 0;

          if (isScan) {
            return (
              <button
                key={id}
                type="button"
                className={`merchant-scan-btn${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                aria-label="Scan reward QR"
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
