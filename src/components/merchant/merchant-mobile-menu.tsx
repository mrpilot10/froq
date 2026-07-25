"use client";

import { FROQ_LOGO_SRC } from "@/lib/brand";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ArrowUpRight, LifeBuoy, LogOut, X } from "lucide-react";
import { MERCHANT_PLANS } from "@/lib/merchant/constants";
import {
  PRODUCT_NAV,
  PRODUCTS,
  workspaceNavForRole,
  type NavItem,
} from "@/lib/merchant/nav";
import type { MemberRole, MerchantProduct, MerchantTab } from "@/lib/merchant/types";
import { isProductEnabled, type Entitlements } from "@/lib/merchant/entitlements";

interface MerchantMobileMenuProps {
  open: boolean;
  activeTab: MerchantTab;
  activeProduct: MerchantProduct;
  role: MemberRole;
  entitlements: Entitlements;
  canPurchase?: boolean;
  onTabChange: (tab: MerchantTab) => void;
  onProductChange: (product: MerchantProduct) => void;
  onUpgrade?: (product: MerchantProduct) => void;
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
  onTabChange,
  onProductChange,
  onUpgrade,
  onLogout,
  onClose,
}: MerchantMobileMenuProps) {
  const [mounted, setMounted] = useState(false);
  const product = PRODUCTS.find((p) => p.id === activeProduct) ?? PRODUCTS[0];
  const catalog = MERCHANT_PLANS[activeProduct];
  const enabled = isProductEnabled(entitlements, activeProduct);
  const plan = { ...catalog, enabled };
  const workspaceItems = workspaceNavForRole(role === "owner");

  useEffect(() => setMounted(true), []);

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
      <button
        key={id}
        type="button"
        className={`merchant-menu-item${isActive ? " active" : ""}`}
        aria-current={isActive ? "page" : undefined}
        onClick={() => selectTab(id)}
      >
        <span className="merchant-menu-item-icon">
          <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
        </span>
        <span>{label}</span>
      </button>
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

        <div className="merchant-menu-scroll">
          <nav className="merchant-menu-group" aria-label="Products">
            <span className="merchant-menu-label">Products</span>
            {PRODUCTS.map(({ id, name, tagline, Icon }) => {
              const isActive = activeProduct === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`merchant-menu-item merchant-menu-item--product${isActive ? " active" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => selectProduct(id)}
                >
                  <span className="merchant-menu-item-icon">
                    <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span className="merchant-menu-item-stack">
                    <span>{name}</span>
                    <span className="merchant-menu-item-sub">{tagline}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <nav className="merchant-menu-group" aria-label={product.name}>
            <span className="merchant-menu-label">{product.name}</span>
            {PRODUCT_NAV[activeProduct].map(renderNavItem)}
          </nav>

          <nav className="merchant-menu-group" aria-label="Workspace">
            <span className="merchant-menu-label">Workspace</span>
            {workspaceItems.map(renderNavItem)}
          </nav>
        </div>

        <div className="merchant-menu-foot">
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
                onClick={() => {
                  onUpgrade?.(activeProduct);
                  onClose();
                }}
              >
                Upgrade
                <ArrowUpRight size={14} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>

          <a
            href="https://froq.io/help"
            target="_blank"
            rel="noreferrer"
            className="merchant-menu-item"
            onClick={onClose}
          >
            <span className="merchant-menu-item-icon">
              <LifeBuoy size={19} strokeWidth={2} />
            </span>
            <span>Help</span>
          </a>

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
