"use client";

import { FROQ_LOGO_SRC } from "@/lib/brand";

import { Fragment, useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, LifeBuoy, LogOut, X } from "lucide-react";
import {
  PRODUCT_DEFAULT_TAB,
  PRODUCTS,
  TAB_HREF,
  comingSoonAfterProduct,
  comingSoonBeforeProducts,
  isWorkspaceTab,
  workspaceNavForRole,
  type ComingSoonProduct,
  type NavItem,
} from "@/lib/merchant/nav";
import { ROLE_LABELS } from "@/lib/merchant/roles";
import { planUpgradeSummary } from "@/lib/merchant/plan-summary";
import type { MemberRole, MerchantProduct, MerchantTab } from "@/lib/merchant/types";
import {
  isProductEnabled,
  isTrialActive,
  trialDaysLeft,
  type Entitlements,
} from "@/lib/merchant/entitlements";

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface MerchantMobileMenuProps {
  open: boolean;
  activeTab: MerchantTab;
  activeProduct: MerchantProduct;
  role: MemberRole;
  entitlements: Entitlements;
  canPurchase?: boolean;
  userName?: string;
  onTabChange: (tab: MerchantTab) => void;
  onProductChange: (product: MerchantProduct) => void;
  onComingSoonProduct?: (product: ComingSoonProduct) => void;
  onUpgrade?: (product: MerchantProduct) => void;
  onOpenAccount?: () => void;
  onLogout?: () => void;
  onClose: () => void;
}

export function MerchantMobileMenu({
  open,
  activeTab,
  activeProduct,
  role,
  entitlements,
  canPurchase = true,
  userName = "",
  onTabChange,
  onProductChange,
  onComingSoonProduct,
  onUpgrade,
  onOpenAccount,
  onLogout,
  onClose,
}: MerchantMobileMenuProps) {
  const [mounted, setMounted] = useState(false);
  const [menuPanel, setMenuPanel] = useState<"business" | "products">("business");
  const product = PRODUCTS.find((p) => p.id === activeProduct) ?? PRODUCTS[0];
  const entitlement = entitlements[activeProduct];
  const enabled = isProductEnabled(entitlements, activeProduct);
  const onTrial = isTrialActive(entitlement);
  const summary = planUpgradeSummary({
    product: activeProduct,
    planId: entitlement?.planId,
  });
  const statusLabel = onTrial
    ? `${trialDaysLeft(entitlement)}d trial left`
    : enabled
      ? "Active"
      : "Not enabled";
  const workspaceItems = workspaceNavForRole();
  const displayName = userName.trim() || "Team member";
  const initials = getInitials(displayName);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setMenuPanel(isWorkspaceTab(activeTab) ? "business" : "products");
  }, [open, activeTab]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const selectTab = (tab: MerchantTab) => {
    onTabChange(tab);
    onClose();
  };

  const selectProduct = (next: MerchantProduct) => {
    onProductChange(next);
    onClose();
  };

  const renderNavItem = ({ id, label, Icon }: NavItem) => {
    const isActive = activeTab === id;
    return (
      <Link
        key={id}
        href={TAB_HREF[id]}
        prefetch
        className={`merchant-menu-item${isActive ? " active" : ""}`}
        aria-current={isActive ? "page" : undefined}
        onClick={(event) => {
          event.preventDefault();
          selectTab(id);
        }}
      >
        <span className="merchant-menu-item-icon">
          <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
        </span>
        <span>{label}</span>
      </Link>
    );
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className={`merchant-menu-overlay${open ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-label="Menu"
      onClick={handleOverlayClick}
    >
      <aside className={`merchant-menu${open ? " open" : ""}`}>
        <div className="merchant-menu-head">
          <div className="merchant-menu-brand">
            <div className="merchant-menu-logo">
              <Image src={FROQ_LOGO_SRC} alt="Froq" width={36} height={36} />
            </div>
            <span className="merchant-menu-brand-name">Froq</span>
          </div>
          <button type="button" className="merchant-menu-close" aria-label="Close menu" onClick={onClose}>
            <X size={20} strokeWidth={2.2} />
          </button>
        </div>

        <div className="merchant-menu-tabs" role="tablist" aria-label="Menu sections">
          <button
            type="button"
            role="tab"
            id="merchant-menu-tab-business"
            aria-selected={menuPanel === "business"}
            aria-controls="merchant-menu-panel-business"
            className={`merchant-menu-tab${menuPanel === "business" ? " active" : ""}`}
            onClick={() => setMenuPanel("business")}
          >
            My Business
          </button>
          <button
            type="button"
            role="tab"
            id="merchant-menu-tab-products"
            aria-selected={menuPanel === "products"}
            aria-controls="merchant-menu-panel-products"
            className={`merchant-menu-tab${menuPanel === "products" ? " active" : ""}`}
            onClick={() => setMenuPanel("products")}
          >
            Products
          </button>
        </div>

        <div className="merchant-menu-scroll">
          {menuPanel === "business" ? (
            <nav
              id="merchant-menu-panel-business"
              className="merchant-menu-group"
              role="tabpanel"
              aria-labelledby="merchant-menu-tab-business"
              aria-label="My Business"
            >
              {workspaceItems.map(renderNavItem)}
            </nav>
          ) : (
            <nav
              id="merchant-menu-panel-products"
              className="merchant-menu-group"
              role="tabpanel"
              aria-labelledby="merchant-menu-tab-products"
              aria-label="Products"
            >
              {comingSoonBeforeProducts().map((item) => {
                const Icon = item.Icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="merchant-menu-item merchant-menu-item--product"
                    onClick={() => {
                      onComingSoonProduct?.(item);
                      onClose();
                    }}
                  >
                    <span className="merchant-menu-item-icon">
                      <Icon size={19} strokeWidth={2} />
                    </span>
                    <span className="merchant-menu-item-stack">
                      <span>
                        {item.name}
                        <span className="merchant-menu-soon-pill">Coming soon</span>
                      </span>
                      <span className="merchant-menu-item-sub">{item.headline}</span>
                    </span>
                  </button>
                );
              })}
              {PRODUCTS.map(({ id, name, tagline, Icon }) => {
                const isActive = activeProduct === id;
                return (
                  <Fragment key={id}>
                    <Link
                      href={TAB_HREF[PRODUCT_DEFAULT_TAB[id]]}
                      prefetch
                      className={`merchant-menu-item merchant-menu-item--product${isActive ? " active" : ""}`}
                      aria-current={isActive ? "true" : undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        selectProduct(id);
                      }}
                    >
                      <span className="merchant-menu-item-icon">
                        <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
                      </span>
                      <span className="merchant-menu-item-stack">
                        <span>{name}</span>
                        <span className="merchant-menu-item-sub">{tagline}</span>
                      </span>
                    </Link>
                    {comingSoonAfterProduct(id).map((item) => {
                      const SoonIcon = item.Icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="merchant-menu-item merchant-menu-item--product"
                          onClick={() => {
                            onComingSoonProduct?.(item);
                            onClose();
                          }}
                        >
                          <span className="merchant-menu-item-icon">
                            <SoonIcon size={19} strokeWidth={2} />
                          </span>
                          <span className="merchant-menu-item-stack">
                            <span>
                              {item.name}
                              <span className="merchant-menu-soon-pill">Coming soon</span>
                            </span>
                            <span className="merchant-menu-item-sub">{item.headline}</span>
                          </span>
                        </button>
                      );
                    })}
                  </Fragment>
                );
              })}
            </nav>
          )}
        </div>

        <div className="merchant-menu-foot">
          <div className={`merchant-side-plan${enabled ? "" : " is-locked"}`}>
            <div className="merchant-side-plan-top">
              <span className="merchant-side-plan-name">
                {product.name}
                {summary.currentTier ? (
                  <span className="merchant-side-plan-tier">{summary.currentTier}</span>
                ) : null}
              </span>
              <span className={`merchant-side-plan-status${enabled ? " is-active" : ""}`}>
                {statusLabel}
              </span>
            </div>

            {/* No plan in force means no current price — the CTA carries one. */}
            {summary.currentPriceLabel ? (
              <div className="merchant-side-plan-price">
                {summary.currentPriceLabel}
                <span>{summary.currentCycleLabel}</span>
              </div>
            ) : null}

            {summary.nextPlan && summary.nextHighlights.length > 0 ? (
              <p className="merchant-side-plan-gain">
                {summary.currentTier ? `${summary.nextPlan.name}: ` : null}
                {summary.nextHighlights.join(" · ")}
              </p>
            ) : null}

            {canPurchase && summary.nextPlan ? (
              <button
                type="button"
                className="merchant-side-plan-cta"
                onClick={() => {
                  onUpgrade?.(activeProduct);
                  onClose();
                }}
              >
                <span>{summary.currentTier ? "Upgrade" : "Get started"}</span>
                <span className="merchant-side-plan-cta-price">
                  {summary.nextPlan.priceLabel}
                  {summary.currentCycleLabel}
                </span>
                <ArrowUpRight size={14} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            className="merchant-side-user"
            onClick={() => {
              onOpenAccount?.();
              onClose();
            }}
            aria-label="Account settings"
          >
            <span className="merchant-avatar merchant-side-user-avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="merchant-side-user-copy">
              <span className="merchant-side-user-name">{displayName}</span>
              <span className="merchant-side-user-role">{ROLE_LABELS[role]}</span>
            </span>
            <ChevronRight
              size={15}
              strokeWidth={2.4}
              className="merchant-side-user-chevron"
              aria-hidden="true"
            />
          </button>

          <Link href="/help" className="merchant-menu-item" onClick={onClose}>
            <span className="merchant-menu-item-icon">
              <LifeBuoy size={19} strokeWidth={2} />
            </span>
            <span>Help</span>
          </Link>

          {onLogout ? (
            <button
              type="button"
              className="merchant-menu-item"
              onClick={() => {
                onLogout();
                onClose();
              }}
            >
              <span className="merchant-menu-item-icon">
                <LogOut size={19} strokeWidth={2} />
              </span>
              <span>Log out</span>
            </button>
          ) : null}

          <p className="merchant-menu-copy">
            © 2026{" "}
            <a href="https://froq.io" target="_blank" rel="noreferrer">
              froq.io
            </a>
          </p>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
