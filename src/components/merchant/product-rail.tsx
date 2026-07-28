"use client";

import { FROQ_LOGO_SRC } from "@/lib/brand";

import Image from "next/image";
import Link from "next/link";
import { BarChart3, LifeBuoy, LogOut, Settings, Users, type LucideIcon } from "lucide-react";
import { PRODUCT_DEFAULT_TAB, PRODUCTS, TAB_HREF, isWorkspaceTab } from "@/lib/merchant/nav";
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

type RailItem = { id: MerchantTab; label: string; Icon: LucideIcon; ownerOnly?: boolean };

const SHARED_ITEMS: RailItem[] = [
  { id: "customers", label: "All customers", Icon: Users, ownerOnly: true },
  { id: "analytics", label: "Analytics", Icon: BarChart3 },
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
  const sharedItems = SHARED_ITEMS.filter((item) => isOwner || !item.ownerOnly);
  // Workspace tabs (analytics, all customers, settings) aren't product-scoped, so
  // no product icon lights up there — the sidebar still keeps the last product.
  const highlightedProduct = isWorkspaceTab(activeTab) ? null : activeProduct;

  return (
    <aside className="merchant-rail" aria-label="Products">
      <div className="merchant-rail-logo">
        <Image src={FROQ_LOGO_SRC} alt="Froq" width={36} height={36} priority />
      </div>

      <span className="merchant-rail-divider" aria-hidden="true" />

      <nav className="merchant-rail-nav" aria-label="Switch product">
        {PRODUCTS.map(({ id, name, Icon }) => {
          const isActive = highlightedProduct === id;
          const showBadge = id === "loyalty" && pendingCount > 0;
          return (
            <Link
              key={id}
              href={TAB_HREF[PRODUCT_DEFAULT_TAB[id]]}
              prefetch
              className={`merchant-rail-item${isActive ? " active" : ""}`}
              aria-current={isActive ? "true" : undefined}
              aria-label={name}
              data-tip={name}
              onClick={(event) => {
                event.preventDefault();
                onProductChange(id);
              }}
            >
              <span className="merchant-rail-icon">
                <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                {showBadge && (
                  <span className="merchant-rail-badge" aria-label={`${pendingCount} pending`}>
                    {pendingCount}
                  </span>
                )}
              </span>
            </Link>
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
                <Link
                  key={id}
                  href={TAB_HREF[id]}
                  prefetch
                  className={`merchant-rail-item${isActive ? " active" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  aria-label={label}
                  data-tip={label}
                  onClick={(event) => {
                    event.preventDefault();
                    onTabChange(id);
                  }}
                >
                  <span className="merchant-rail-icon">
                    <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                </Link>
              );
            })}
          </nav>
        </>
      ) : null}

      <div className="merchant-rail-foot">
        <Link
          href={TAB_HREF.profile}
          prefetch
          className={`merchant-rail-item merchant-rail-item--ghost${activeTab === "profile" ? " active" : ""}`}
          aria-current={activeTab === "profile" ? "true" : undefined}
          aria-label="Business settings"
          data-tip="Business settings"
          onClick={(event) => {
            event.preventDefault();
            onTabChange("profile");
          }}
        >
          <span className="merchant-rail-icon">
            <Settings size={20} strokeWidth={2} />
          </span>
        </Link>
        <Link
          href="/help"
          className="merchant-rail-item merchant-rail-item--ghost"
          aria-label="Help"
          data-tip="Help"
        >
          <span className="merchant-rail-icon">
            <LifeBuoy size={20} strokeWidth={2} />
          </span>
        </Link>
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
