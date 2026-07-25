"use client";

import { FROQ_LOGO_SRC } from "@/lib/brand";

import Image from "next/image";
import { BarChart3, LifeBuoy, LogOut, Settings, Users, type LucideIcon } from "lucide-react";
import { PRODUCTS } from "@/lib/merchant/nav";
import type { MerchantProduct, MerchantTab } from "@/lib/merchant/types";

interface ProductRailProps {
  activeProduct: MerchantProduct;
  activeTab: MerchantTab;
  isOwner?: boolean;
  onProductChange: (product: MerchantProduct) => void;
  onTabChange: (tab: MerchantTab) => void;
  pendingCount?: number;
  onLogout?: () => void;
}

const OWNER_SHARED_ITEMS: Array<{ id: MerchantTab; label: string; Icon: LucideIcon }> = [
  { id: "customers", label: "All customers", Icon: Users },
  { id: "analytics", label: "All analytics", Icon: BarChart3 },
];

export function ProductRail({
  activeProduct,
  activeTab,
  isOwner = false,
  onProductChange,
  onTabChange,
  pendingCount = 0,
  onLogout,
}: ProductRailProps) {
  const sharedItems = isOwner ? OWNER_SHARED_ITEMS : [];

  return (
    <aside className="merchant-rail" aria-label="Products">
      <div className="merchant-rail-logo">
        <Image src={FROQ_LOGO_SRC} alt="Froq" width={36} height={36} priority />
      </div>

      <span className="merchant-rail-divider" aria-hidden="true" />

      <nav className="merchant-rail-nav" aria-label="Switch product">
        {PRODUCTS.map(({ id, name, Icon }) => {
          const isActive = activeProduct === id;
          const showBadge = id === "loyalty" && pendingCount > 0;
          return (
            <button
              key={id}
              type="button"
              className={`merchant-rail-item${isActive ? " active" : ""}`}
              aria-current={isActive ? "true" : undefined}
              aria-label={name}
              data-tip={name}
              onClick={() => onProductChange(id)}
            >
              <span className="merchant-rail-icon">
                <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                {showBadge && (
                  <span className="merchant-rail-badge" aria-label={`${pendingCount} pending`}>
                    {pendingCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {sharedItems.length > 0 ? (
        <>
          <span className="merchant-rail-divider" aria-hidden="true" />
          <nav className="merchant-rail-nav" aria-label="Workspace">
            {sharedItems.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`merchant-rail-item${isActive ? " active" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  aria-label={label}
                  data-tip={label}
                  onClick={() => onTabChange(id)}
                >
                  <span className="merchant-rail-icon">
                    <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                </button>
              );
            })}
          </nav>
        </>
      ) : null}

      <div className="merchant-rail-foot">
        <button
          type="button"
          className={`merchant-rail-item merchant-rail-item--ghost${activeTab === "profile" ? " active" : ""}`}
          aria-current={activeTab === "profile" ? "true" : undefined}
          aria-label="Business settings"
          data-tip="Business settings"
          onClick={() => onTabChange("profile")}
        >
          <span className="merchant-rail-icon">
            <Settings size={20} strokeWidth={2} />
          </span>
        </button>
        <a
          href="https://froq.io/help"
          target="_blank"
          rel="noreferrer"
          className="merchant-rail-item merchant-rail-item--ghost"
          aria-label="Help"
          data-tip="Help"
        >
          <span className="merchant-rail-icon">
            <LifeBuoy size={20} strokeWidth={2} />
          </span>
        </a>
        {onLogout && (
          <button
            type="button"
            className="merchant-rail-item merchant-rail-item--ghost"
            aria-label="Log out"
            data-tip="Log out"
            onClick={onLogout}
          >
            <span className="merchant-rail-icon">
              <LogOut size={20} strokeWidth={2} />
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}
