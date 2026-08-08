"use client";

import { FROQ_LOGO_SRC } from "@/lib/brand";

import { Fragment, useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, LifeBuoy, LogOut, QrCode, X } from "lucide-react";
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

interface MerchantMobileMenuProps {
  open: boolean;
  activeTab: MerchantTab;
  activeProduct: MerchantProduct;
  role: MemberRole;
  entitlements: Entitlements;
  canPurchase?: boolean;
  planUsage?: MerchantSidePlanUsage;
  userName?: string;
  onTabChange: (tab: MerchantTab) => void;
  onProductChange: (product: MerchantProduct) => void;
  onComingSoonProduct?: (product: ComingSoonProduct) => void;
  onUpgrade?: (product: MerchantProduct) => void;
  onOpenAccount?: () => void;
  /** Opens the one QR that points at the merchant's public landing page. */
  onShowHubQr?: () => void;
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
  planUsage,
  userName = "",
  onTabChange,
  onProductChange,
  onComingSoonProduct,
  onUpgrade,
  onOpenAccount,
  onShowHubQr,
  onLogout,
  onClose,
}: MerchantMobileMenuProps) {
  const [mounted, setMounted] = useState(false);
  const [menuPanel, setMenuPanel] = useState<"business" | "products">("business");
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
          <MerchantSidePlanCard
            product={activeProduct}
            entitlements={entitlements}
            canPurchase={canPurchase}
            usage={planUsage}
            onAction={(productId) => {
              onUpgrade?.(productId);
              onClose();
            }}
          />

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

          {onShowHubQr ? (
            <button
              type="button"
              className="merchant-menu-item"
              onClick={() => {
                onShowHubQr();
                onClose();
              }}
            >
              <span className="merchant-menu-item-icon">
                <QrCode size={19} strokeWidth={2} />
              </span>
              <span>Your QR</span>
            </button>
          ) : null}

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
