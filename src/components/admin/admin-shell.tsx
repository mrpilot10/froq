"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Moon, Sun, X } from "lucide-react";
import { FROQ_LOGO_SRC } from "@/lib/brand";
import { ADMIN_NAV, adminPageTitle } from "@/lib/admin/nav";

function NavLink({
  href,
  label,
  icon: Icon,
  stub,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  stub?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/admin" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={[
        "admin-nav-link",
        active ? "admin-nav-link--active" : "",
      ].join(" ")}
    >
      <Icon className="admin-nav-icon" strokeWidth={1.75} />
      <span className="admin-nav-label">{label}</span>
      {stub ? <span className="admin-nav-stub">Soon</span> : null}
    </Link>
  );
}

export function AdminShell({
  email,
  apitxtBalanceLabel,
  apitxtBalanceError,
  apitxtBalanceLow = false,
  resendQuotaLabel,
  resendQuotaError,
  resendQuotaLow = false,
  children,
}: {
  email: string;
  apitxtBalanceLabel: string;
  apitxtBalanceError?: string | null;
  apitxtBalanceLow?: boolean;
  resendQuotaLabel?: string;
  resendQuotaError?: string | null;
  resendQuotaLow?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [lowNoticeDismissed, setLowNoticeDismissed] = useState(false);
  const [resendNoticeDismissed, setResendNoticeDismissed] = useState(false);
  const title = adminPageTitle(pathname);
  const showLowNotice = apitxtBalanceLow && !lowNoticeDismissed;
  const showResendNotice = resendQuotaLow && !resendNoticeDismissed;

  return (
    <div className={`admin-app ${dark ? "admin-app--dark" : ""}`}>
      <aside className={`admin-sidebar ${open ? "admin-sidebar--open" : ""}`}>
        <div className="admin-sidebar-brand">
          <img src={FROQ_LOGO_SRC} alt="" width={28} height={28} />
          <div>
            <div className="admin-sidebar-brand-name">Froq</div>
            <div className="admin-sidebar-brand-sub">Super Admin</div>
          </div>
          <button
            type="button"
            className="admin-icon-btn admin-sidebar-close"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          {ADMIN_NAV.map((section) => (
            <div key={section.id} className="admin-nav-section">
              <div className="admin-nav-section-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  {...item}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-email">{email}</div>
          <form action="/admin/logout" method="post">
            <button type="submit" className="admin-text-btn">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          className="admin-backdrop"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-icon-btn admin-menu-btn"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="admin-topbar-title">{title}</div>
          <div className="admin-topbar-actions">
            <Link
              href="/admin/communication"
              className={[
                "admin-balance-chip",
                apitxtBalanceError || apitxtBalanceLow
                  ? "admin-balance-chip--warn"
                  : "",
              ].join(" ")}
              title={
                apitxtBalanceError
                  ? `API TXT: ${apitxtBalanceError}`
                  : apitxtBalanceLow
                    ? "API TXT credit is below ₹1,000 — top up soon"
                    : "API TXT account credit (SMS / WhatsApp / OTP)"
              }
            >
              <span className="admin-balance-chip-label">API TXT</span>
              <span className="admin-balance-chip-value">{apitxtBalanceLabel}</span>
            </Link>
            <Link
              href="/admin/communication/email"
              className={[
                "admin-balance-chip",
                resendQuotaError || resendQuotaLow
                  ? "admin-balance-chip--warn"
                  : "",
              ].join(" ")}
              title={
                resendQuotaError
                  ? `Resend: ${resendQuotaError}`
                  : resendQuotaLow
                    ? "Resend monthly quota is above 80%"
                    : "Resend Pro monthly email quota"
              }
            >
              <span className="admin-balance-chip-label">Resend</span>
              <span className="admin-balance-chip-value">
                {resendQuotaLabel ?? "—"}
              </span>
            </Link>
            <button
              type="button"
              className="admin-icon-btn"
              onClick={() => setDark((v) => !v)}
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>
        {showLowNotice ? (
          <div className="admin-balance-notice" role="status">
            <div className="admin-balance-notice-body">
              <strong>Low API TXT balance</strong>
              <span>
                Credit is {apitxtBalanceLabel} (below ₹1,000). Top up to keep SMS,
                WhatsApp, and OTP delivery running.
              </span>
            </div>
            <div className="admin-balance-notice-actions">
              <Link href="/admin/communication" className="admin-balance-notice-link">
                Communication
              </Link>
              <button
                type="button"
                className="admin-text-btn"
                onClick={() => setLowNoticeDismissed(true)}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
        {showResendNotice ? (
          <div className="admin-balance-notice" role="status">
            <div className="admin-balance-notice-body">
              <strong>Resend monthly quota high</strong>
              <span>
                Usage is {resendQuotaLabel ?? "—"} of the 50,000 Pro cap. Check
                Communication → Email before sends start failing.
              </span>
            </div>
            <div className="admin-balance-notice-actions">
              <Link
                href="/admin/communication/email"
                className="admin-balance-notice-link"
              >
                Email quotas
              </Link>
              <button
                type="button"
                className="admin-text-btn"
                onClick={() => setResendNoticeDismissed(true)}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
