"use client";

import { ArrowUpRight, ChevronRight } from "lucide-react";
import { MERCHANT_PLANS } from "@/lib/merchant/constants";
import { PRODUCT_NAV, PRODUCTS, type NavItem } from "@/lib/merchant/nav";
import { ROLE_LABELS } from "@/lib/merchant/roles";
import type { MemberRole, MerchantProduct, MerchantTab } from "@/lib/merchant/types";
import { isProductEnabled, type Entitlements } from "@/lib/merchant/entitlements";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface MerchantSidebarProps {
  activeProduct: MerchantProduct;
  activeTab: MerchantTab;
  entitlements: Entitlements;
  canPurchase?: boolean;
  userName?: string;
  userRole?: MemberRole;
  onTabChange: (tab: MerchantTab) => void;
  onGetStarted?: (product: MerchantProduct) => void;
  onOpenAccount?: () => void;
  pendingCount?: number;
}

export function MerchantSidebar({
  activeProduct,
  activeTab,
  entitlements,
  canPurchase = true,
  userName = "",
  userRole = "staff",
  onTabChange,
  onGetStarted,
  onOpenAccount,
  pendingCount = 0,
}: MerchantSidebarProps) {
  const product = PRODUCTS.find((p) => p.id === activeProduct) ?? PRODUCTS[0];
  const catalog = MERCHANT_PLANS[activeProduct];
  const enabled = isProductEnabled(entitlements, activeProduct);
  const plan = { ...catalog, enabled };
  const ProductIcon = product.Icon;
  const displayName = userName.trim() || "Team member";
  const initials = getInitials(displayName);

  const renderItem = ({ id, label, Icon }: NavItem) => {
    const isActive = activeTab === id;
    const showBadge = id === "dashboard" && pendingCount > 0;
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
          {showBadge ? (
            <span className="merchant-side-badge" aria-label={`${pendingCount} pending`}>
              {pendingCount}
            </span>
          ) : null}
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
          {canPurchase ? (
            <button
              type="button"
              className="merchant-side-plan-cta"
              onClick={() => onGetStarted?.(activeProduct)}
            >
              Upgrade
              <ArrowUpRight size={14} strokeWidth={2.4} />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className="merchant-side-user"
          onClick={onOpenAccount}
          aria-label="Account settings"
        >
          <span className="merchant-avatar merchant-side-user-avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="merchant-side-user-copy">
            <span className="merchant-side-user-name">{displayName}</span>
            <span className="merchant-side-user-role">{ROLE_LABELS[userRole]}</span>
          </span>
          <ChevronRight
            size={15}
            strokeWidth={2.4}
            className="merchant-side-user-chevron"
            aria-hidden="true"
          />
        </button>

        <p className="merchant-sidebar-copy">
          © 2026{" "}
          <a href="https://froq.io" target="_blank" rel="noreferrer">
            froq.io
          </a>
        </p>
      </div>
    </aside>
  );
}
