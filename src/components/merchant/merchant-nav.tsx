"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ContactRound,
  History,
  LayoutGrid,
  ScanLine,
  SlidersHorizontal,
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

interface MerchantNavProps {
  activeProduct: MerchantProduct;
  activeTab: MerchantTab;
  isOwner?: boolean;
  onTabChange: (tab: MerchantTab) => void;
  onProductChange: (product: MerchantProduct) => void;
  onComingSoonProduct?: (product: ComingSoonProduct) => void;
  /** Opens redeem/scan sheet (loyalty primary action). */
  onScan?: () => void;
  pendingCount?: number;
}

interface MobileNavItem {
  id: MerchantTab | "scan-action";
  label: string;
  Icon: LucideIcon;
  primary?: boolean;
}

const LOYALTY_NAV: MobileNavItem[] = [
  { id: "dashboard", label: "Home", Icon: LayoutGrid },
  { id: "loyalty-customers", label: "Customers", Icon: ContactRound },
  { id: "scan-action", label: "Scan", Icon: ScanLine, primary: true },
  { id: "loyalty-history", label: "History", Icon: History },
  { id: "loyalty-settings", label: "Settings", Icon: SlidersHorizontal },
];

const QUEUE_NAV: MobileNavItem[] = [
  { id: "queue-home", label: "Home", Icon: LayoutGrid },
  { id: "queue-customers", label: "Customers", Icon: ContactRound },
  { id: "queue-history", label: "History", Icon: History },
  { id: "queue-settings", label: "Settings", Icon: SlidersHorizontal },
];

const RESERVATION_NAV: MobileNavItem[] = [
  { id: "reservations-home", label: "Home", Icon: LayoutGrid },
  { id: "reservations-customers", label: "Customers", Icon: ContactRound },
  { id: "reservations-history", label: "History", Icon: History },
  { id: "reservations-settings", label: "Settings", Icon: SlidersHorizontal },
];

const MENU_NAV: MobileNavItem[] = [
  { id: "menu-home", label: "Home", Icon: LayoutGrid },
  { id: "menu-items", label: "Menu", Icon: BookOpen },
  { id: "menu-customers", label: "Customers", Icon: ContactRound },
  { id: "menu-settings", label: "Settings", Icon: SlidersHorizontal },
];

const PRODUCT_MOBILE_NAV: Record<MerchantProduct, MobileNavItem[]> = {
  loyalty: LOYALTY_NAV,
  queue: QUEUE_NAV,
  reservation: RESERVATION_NAV,
  menu: MENU_NAV,
};

export function MerchantNav({
  activeProduct,
  activeTab,
  onTabChange,
  onProductChange,
  onComingSoonProduct,
  onScan,
  pendingCount = 0,
}: MerchantNavProps) {
  const items = PRODUCT_MOBILE_NAV[activeProduct] ?? LOYALTY_NAV;
  const [switchVisible, setSwitchVisible] = useState(true);

  // Reveal when switching products; hide while scrolling down, show on scroll up / top.
  useEffect(() => {
    setSwitchVisible(true);
  }, [activeProduct]);

  useEffect(() => {
    let lastY = typeof window !== "undefined" ? window.scrollY : 0;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        if (y < 56) {
          setSwitchVisible(true);
        } else if (delta > 8) {
          setSwitchVisible(false);
        } else if (delta < -8) {
          setSwitchVisible(true);
        }
        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="nav-dock">
      <div
        className={`merchant-nav-switch${switchVisible ? "" : " is-hidden"}`}
        role="tablist"
        aria-label="Switch product"
        aria-hidden={!switchVisible}
        inert={!switchVisible ? true : undefined}
      >
        {comingSoonBeforeProducts().map((product) => {
          const Icon = product.Icon;
          return (
            <button
              key={product.id}
              type="button"
              role="tab"
              aria-selected={false}
              aria-label={`${product.name} — Coming soon`}
              title={`${product.name} · Coming soon`}
              className="merchant-nav-switch-btn merchant-nav-switch-btn--soon"
              onClick={() => onComingSoonProduct?.(product)}
            >
              <Icon size={18} strokeWidth={2.2} />
            </button>
          );
        })}
        {PRODUCTS.map(({ id, name, Icon }) => (
          <Fragment key={id}>
            <Link
              href={TAB_HREF[PRODUCT_DEFAULT_TAB[id]]}
              prefetch
              role="tab"
              aria-selected={activeProduct === id}
              aria-label={name}
              title={name}
              className={`merchant-nav-switch-btn${activeProduct === id ? " active" : ""}`}
              onClick={(event) => {
                event.preventDefault();
                onProductChange(id);
              }}
            >
              <Icon size={18} strokeWidth={activeProduct === id ? 2.4 : 2.2} />
            </Link>
            {comingSoonAfterProduct(id).map((product) => {
              const SoonIcon = product.Icon;
              return (
                <button
                  key={product.id}
                  type="button"
                  role="tab"
                  aria-selected={false}
                  aria-label={`${product.name} — Coming soon`}
                  title={`${product.name} · Coming soon`}
                  className="merchant-nav-switch-btn merchant-nav-switch-btn--soon"
                  onClick={() => onComingSoonProduct?.(product)}
                >
                  <SoonIcon size={18} strokeWidth={2.2} />
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <nav className="nav-bar merchant-nav-bar" aria-label="Merchant navigation">
        {items.map(({ id, label, Icon, primary }) => {
          const isActive = id !== "scan-action" && activeTab === id;
          const showBadge = id === "dashboard" && pendingCount > 0;

          if (primary) {
            return (
              <button
                key={id}
                type="button"
                className="merchant-scan-btn"
                aria-label={label}
                onClick={() => onScan?.()}
              >
                <Icon size={22} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </button>
            );
          }

          const tab = id as MerchantTab;
          return (
            <Link
              key={id}
              href={TAB_HREF[tab]}
              prefetch
              className={`nav-item${isActive ? " active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                onTabChange(tab);
              }}
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
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
