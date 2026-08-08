"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PRODUCT_NAV, PRODUCTS, TAB_HREF, type NavItem } from "@/lib/merchant/nav";
import { ROLE_LABELS } from "@/lib/merchant/roles";
import type { MemberRole, MerchantProduct, MerchantTab } from "@/lib/merchant/types";
import type { Entitlements } from "@/lib/merchant/entitlements";
import {
  MerchantSidePlanCard,
  type MerchantSidePlanUsage,
} from "./merchant-side-plan-card";

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
  planUsage?: MerchantSidePlanUsage;
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
  planUsage,
  userName = "",
  userRole = "staff",
  onTabChange,
  onGetStarted,
  onOpenAccount,
  pendingCount = 0,
}: MerchantSidebarProps) {
  const product = PRODUCTS.find((p) => p.id === activeProduct) ?? PRODUCTS[0];
  const ProductIcon = product.Icon;
  const displayName = userName.trim() || "Team member";
  const initials = getInitials(displayName);

  const renderItem = ({ id, label, Icon }: NavItem) => {
    const isActive = activeTab === id;
    const showBadge = id === "dashboard" && pendingCount > 0;
    return (
      <Link
        key={id}
        href={TAB_HREF[id]}
        prefetch
        className={`merchant-side-item${isActive ? " active" : ""}`}
        aria-current={isActive ? "page" : undefined}
        title={label}
        onClick={(event) => {
          event.preventDefault();
          onTabChange(id);
        }}
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
      </Link>
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
        <MerchantSidePlanCard
          product={activeProduct}
          entitlements={entitlements}
          canPurchase={canPurchase}
          usage={planUsage}
          onAction={onGetStarted}
        />

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
