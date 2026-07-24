"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  BarChart3,
  LifeBuoy,
  LogOut,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { MerchantTab } from "@/lib/merchant/types";

interface MerchantMobileMenuProps {
  open: boolean;
  activeTab: MerchantTab;
  onTabChange: (tab: MerchantTab) => void;
  onLogout?: () => void;
  onClose: () => void;
}

const SHARED_ITEMS: Array<{ id: MerchantTab; label: string; Icon: LucideIcon }> = [
  { id: "customers", label: "Customers", Icon: Users },
  { id: "dashboard", label: "Analytics", Icon: BarChart3 },
  { id: "profile", label: "Business settings", Icon: Settings },
];

export function MerchantMobileMenu({
  open,
  activeTab,
  onTabChange,
  onLogout,
  onClose,
}: MerchantMobileMenuProps) {
  const [mounted, setMounted] = useState(false);

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
              <Image src="/froq-logo.png" alt="Froq" width={36} height={36} />
            </div>
            <span className="merchant-menu-brand-name">Froq</span>
          </div>
          <button type="button" className="merchant-menu-close" aria-label="Close menu" onClick={onClose}>
            <X size={20} strokeWidth={2.2} />
          </button>
        </div>

        <div className="merchant-menu-scroll">
          <div className="merchant-menu-group">
            <span className="merchant-menu-label">Workspace</span>
            {SHARED_ITEMS.map(({ id, label, Icon }) => {
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
            })}
          </div>
        </div>

        <div className="merchant-menu-foot">
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
          {onLogout && (
            <button type="button" className="merchant-menu-item" onClick={onLogout}>
              <span className="merchant-menu-item-icon">
                <LogOut size={19} strokeWidth={2} />
              </span>
              <span>Log out</span>
            </button>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
