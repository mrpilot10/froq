"use client";

import { ArrowUpRight, LogOut } from "lucide-react";
import { MERCHANT_PLANS } from "@/lib/merchant/constants";
import { PRODUCT_NAV, PRODUCTS, type NavItem } from "@/lib/merchant/nav";
import type { MerchantProduct, MerchantTab } from "@/lib/merchant/types";
import { isProductEnabled, type Entitlements } from "@/lib/merchant/entitlements";

interface MerchantSidebarProps {
  activeProduct: MerchantProduct;
  activeTab: MerchantTab;
  entitlements: Entitlements;
  canPurchase?: boolean;
  onTabChange: (tab: MerchantTab) => void;
  onGetStarted?: (product: MerchantProduct) => void;
  pendingCount?: number;
  onLogout?: () => void;
}

export function MerchantSidebar({
  activeProduct,
  activeTab,
  entitlements,
  canPurchase = true,
  onTabChange,
  onGetStarted,
  pendingCount = 0,
  onLogout,
}: MerchantSidebarProps) {
  const product = PRODUCTS.find((p) => p.id === activeProduct) ?? PRODUCTS[0];
  const catalog = MERCHANT_PLANS[activeProduct];
  const enabled = isProductEnabled(entitlements, activeProduct);
  const plan = { ...catalog, enabled };
  const ProductIcon = product.Icon;

  const renderItem = ({ id, label, Icon }: NavItem) => {
    const isActive = activeTab === id;
    const showBadge = id === "approvals" && pendingCount > 0;
    return (
      <button
        key={id}
        type="button"
        className={`merchant-side-item${isActive ? " active" : ""}`}
        aria-current={isActive ? "page" : undefined}
        title={label}
        onClick={() => onTabChange(id)}
      >
        <span className="merchant-side-icon">
          <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
          {showBadge && (
            <span className="merchant-side-badge" aria-label={`${pendingCount} pending`}>
              {pendingCount}
            </span>
          )}
        </span>
        <span className="merchant-side-label">{label}</span>
      </button>
    );
  };

  return (
    <aside className="merchant-sidebar" aria-label={`${product.name} navigation`}>
      <div className="merchant-sidebar-head">
        <span className="merchant-sidebar-head-icon">
          <ProductIcon size={18} strokeWidth={2.2} />
        </span>
        <span className="merchant-sidebar-head-copy">
          <span className="merchant-sidebar-head-name">{product.name}</span>
          <span className="merchant-sidebar-head-tag">{product.tagline}</span>
        </span>
      </div>

      <span className="merchant-sidebar-divider" aria-hidden="true" />

      <nav className="merchant-sidebar-nav" aria-label={product.name}>
        {PRODUCT_NAV[activeProduct].map(renderItem)}
      </nav>

      <div className="merchant-sidebar-footer">
        <div className={`merchant-side-plan${plan.enabled ? "" : " is-locked"}`}>
          <div className="merchant-side-plan-top">
            <span className="merchant-side-plan-name">
              {product.name}
              <span className="merchant-side-plan-tier">{plan.name}</span>
            </span>
            <span className={`merchant-side-plan-status${plan.enabled ? " is-active" : ""}`}>
              {plan.status}
            </span>
          </div>
          <div className="merchant-side-plan-price">
            {plan.price}
            <span>{plan.cycle}</span>
          </div>
          {(plan.enabled || canPurchase) && (
            <button
              type="button"
              className="merchant-side-plan-cta"
              onClick={() => {
                if (!plan.enabled) onGetStarted?.(activeProduct);
              }}
            >
              {plan.enabled ? "Manage plan" : "Get Started"}
              <ArrowUpRight size={14} strokeWidth={2.4} />
            </button>
          )}
        </div>

        {onLogout && (
          <button type="button" className="merchant-side-item" title="Log out" onClick={onLogout}>
            <span className="merchant-side-icon">
              <LogOut size={19} strokeWidth={2} />
            </span>
            <span className="merchant-side-label">Log out</span>
          </button>
        )}
      </div>
    </aside>
  );
}
