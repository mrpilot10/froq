"use client";

import { FROQ_LOGO_SRC } from "@/lib/brand";

import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  LifeBuoy,
  LogOut,
  Settings,
  ContactRound,
  type LucideIcon,
} from "lucide-react";
import {
  PRODUCT_DEFAULT_TAB,
  PRODUCTS,
  TAB_HREF,
  comingSoonAfterProduct,
  comingSoonBeforeProducts,
} from "@/lib/merchant/nav";
import type { MerchantProduct, MerchantTab } from "@/lib/merchant/types";
import type { ComingSoonProduct } from "@/lib/merchant/nav";

interface ProductRailProps {
  activeProduct: MerchantProduct;
  activeTab: MerchantTab;
  isOwner?: boolean;
  /** Products this teammate may switch to. Defaults to the full catalog. */
  allowedProducts?: MerchantProduct[];
  /** When true, show icon + name labels instead of icon-only. */
  expanded?: boolean;
  onToggleExpand?: () => void;
  onProductChange: (product: MerchantProduct) => void;
  onComingSoonProduct?: (product: ComingSoonProduct) => void;
  onTabChange: (tab: MerchantTab) => void;
  pendingCount?: number;
  onLogout?: () => void;
}

type RailItem = { id: MerchantTab; label: string; Icon: LucideIcon; ownerOnly?: boolean };

const SHARED_ITEMS: RailItem[] = [
  { id: "customers", label: "All customers", Icon: ContactRound, ownerOnly: true },
  { id: "analytics", label: "Analytics", Icon: BarChart3 },
];

export function ProductRail({
  activeProduct,
  activeTab,
  isOwner = false,
  allowedProducts,
  expanded = false,
  onToggleExpand,
  onProductChange,
  onComingSoonProduct,
  onTabChange,
  pendingCount = 0,
  onLogout,
}: ProductRailProps) {
  const sharedItems = SHARED_ITEMS.filter((item) => isOwner || !item.ownerOnly);
  // Keep the last product lit on workspace pages (analytics, all customers, etc.).
  const highlightedProduct = activeProduct;
  const visibleProducts =
    allowedProducts && allowedProducts.length > 0
      ? PRODUCTS.filter((p) => allowedProducts.includes(p.id))
      : PRODUCTS;
  const tip = (label: string) => (expanded ? undefined : label);

  return (
    <aside
      className={`merchant-rail${expanded ? " is-expanded" : ""}`}
      aria-label="Products"
    >
      {onToggleExpand ? (
        <button
          type="button"
          className="merchant-rail-collapse"
          aria-label={expanded ? "Show icons only" : "Show product names"}
          aria-expanded={expanded}
          data-tip={tip(expanded ? "Collapse" : "Expand")}
          onClick={onToggleExpand}
        >
          {expanded ? (
            <ChevronLeft size={14} strokeWidth={2.6} />
          ) : (
            <ChevronRight size={14} strokeWidth={2.6} />
          )}
        </button>
      ) : null}

      {/* Head + divider sit outside the scroll area so they share the
          same vertical rhythm as the contextual sidebar. */}
      <div className="merchant-rail-brand">
        <div className="merchant-rail-logo">
          <Image src={FROQ_LOGO_SRC} alt="Froq" width={36} height={36} priority />
        </div>
        <span className="merchant-rail-brand-name">Froq</span>
      </div>

      <span className="merchant-rail-divider merchant-rail-divider--head" aria-hidden="true" />

      <div className="merchant-rail-inner">
        <nav className="merchant-rail-nav" aria-label="Switch product">
          {comingSoonBeforeProducts().map((product) => {
            const Icon = product.Icon;
            return (
              <button
                key={product.id}
                type="button"
                className="merchant-rail-item"
                aria-label={`${product.name} — Coming soon`}
                data-tip={tip(`${product.name} · Coming soon`)}
                onClick={() => onComingSoonProduct?.(product)}
              >
                <span className="merchant-rail-icon">
                  <Icon size={22} strokeWidth={2} />
                </span>
                <span className="merchant-rail-label">{product.name}</span>
              </button>
            );
          })}
          {visibleProducts.map(({ id, name, Icon }) => {
            const isActive = highlightedProduct === id;
            const showBadge = id === "loyalty" && pendingCount > 0;
            return (
              <Fragment key={id}>
                <Link
                  href={TAB_HREF[PRODUCT_DEFAULT_TAB[id]]}
                  prefetch
                  className={`merchant-rail-item${isActive ? " active" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  aria-label={name}
                  data-tip={tip(name)}
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
                  <span className="merchant-rail-label">{name}</span>
                </Link>
                {comingSoonAfterProduct(id).map((product) => {
                  const SoonIcon = product.Icon;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      className="merchant-rail-item"
                      aria-label={`${product.name} — Coming soon`}
                      data-tip={tip(`${product.name} · Coming soon`)}
                      onClick={() => onComingSoonProduct?.(product)}
                    >
                      <span className="merchant-rail-icon">
                        <SoonIcon size={22} strokeWidth={2} />
                      </span>
                      <span className="merchant-rail-label">{product.name}</span>
                    </button>
                  );
                })}
              </Fragment>
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
                    data-tip={tip(label)}
                    onClick={(event) => {
                      event.preventDefault();
                      onTabChange(id);
                    }}
                  >
                    <span className="merchant-rail-icon">
                      <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    <span className="merchant-rail-label">{label}</span>
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
            data-tip={tip("Business settings")}
            onClick={(event) => {
              event.preventDefault();
              onTabChange("profile");
            }}
          >
            <span className="merchant-rail-icon">
              <Settings size={20} strokeWidth={2} />
            </span>
            <span className="merchant-rail-label">Settings</span>
          </Link>
          <Link
            href="/help"
            className="merchant-rail-item merchant-rail-item--ghost"
            aria-label="Help"
            data-tip={tip("Help")}
          >
            <span className="merchant-rail-icon">
              <LifeBuoy size={20} strokeWidth={2} />
            </span>
            <span className="merchant-rail-label">Help</span>
          </Link>
          {onLogout && (
            <button
              type="button"
              className="merchant-rail-item merchant-rail-item--ghost"
              aria-label="Log out"
              data-tip={tip("Log out")}
              onClick={onLogout}
            >
              <span className="merchant-rail-icon">
                <LogOut size={20} strokeWidth={2} />
              </span>
              <span className="merchant-rail-label">Log out</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
