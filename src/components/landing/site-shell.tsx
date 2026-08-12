"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, LayoutDashboard, LifeBuoy, LogOut } from "lucide-react";
import { FROQ_LOGO_SRC } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";
import { SiteFooter } from "./site-footer";

/** Shared across homepage, product landings, and /help. */
const SITE_NAV = [
  { label: "Home", href: "/" },
  { label: "Loyalty Stamps", href: "/loyalty-stamps" },
  { label: "Smart Queue", href: "/queue-management" },
  { label: "AI Digital Menu", href: "/ai-digital-menu" },
  { label: "Help", href: "/help" },
] as const;

interface HeaderUser {
  name: string;
  initials: string;
}

function initialsFrom(name: string, email?: string | null) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0].length > 0) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const local = email?.split("@")[0]?.trim();
  return local ? local.slice(0, 2).toUpperCase() : "?";
}

function navIsActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function headerUserFromAuth(authUser: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): HeaderUser {
  const meta = authUser.user_metadata ?? {};
  const fromMeta =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    [meta.first_name, meta.last_name].filter((v) => typeof v === "string" && v.trim()).join(" ") ||
    "";
  const name = fromMeta || authUser.email?.split("@")[0] || "Account";
  return { name, initials: initialsFrom(name, authUser.email) };
}

function NavAccountMenu({ user }: { user: HeaderUser }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onDocClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
  }

  return (
    <div className="lp-nav-account" ref={rootRef}>
      <button
        type="button"
        className={`lp-nav-avatar${open ? " is-open" : ""}`}
        aria-label={`Account menu for ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={user.name}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="lp-nav-avatar-mark" aria-hidden="true">
          {user.initials}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2.4}
          className="lp-nav-avatar-caret"
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div id={menuId} role="menu" className="lp-nav-account-menu" aria-label="Account">
          <div className="lp-nav-account-head">
            <span className="lp-nav-account-name">{user.name}</span>
            <span className="lp-nav-account-sub">Signed in</span>
          </div>

          <Link
            href="/merchant"
            role="menuitem"
            className="lp-nav-account-item"
            onClick={() => setOpen(false)}
          >
            <LayoutDashboard size={15} strokeWidth={2.2} aria-hidden="true" />
            Dashboard
          </Link>
          <Link
            href="/help"
            role="menuitem"
            className="lp-nav-account-item"
            onClick={() => setOpen(false)}
          >
            <LifeBuoy size={15} strokeWidth={2.2} aria-hidden="true" />
            Help
          </Link>
          <button
            type="button"
            role="menuitem"
            className="lp-nav-account-item lp-nav-account-item--danger"
            onClick={() => void handleLogout()}
          >
            <LogOut size={15} strokeWidth={2.2} aria-hidden="true" />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Marketing header shared by the homepage, product landings and help.
 * Logged-out: Log in + Get started. Logged-in: avatar menu with dashboard + logout.
 */
export function SiteHeader() {
  const pathname = usePathname() || "/";
  const [user, setUser] = useState<HeaderUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!authUser) {
        setUser(null);
        setReady(true);
        return;
      }

      setUser(headerUserFromAuth(authUser));
      setReady(true);
    }

    void load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const authUser = session?.user;
      if (!authUser) {
        setUser(null);
        setReady(true);
        return;
      }
      setUser(headerUserFromAuth(authUser));
      setReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <header className="lp-nav">
      <div className="lp-nav-inner">
        <Link href="/" className="lp-nav-brand">
          <Image src={FROQ_LOGO_SRC} alt="Froq" width={32} height={32} priority />
          <span>Froq</span>
        </Link>

        <nav className="lp-nav-links" aria-label="Primary">
          {SITE_NAV.map((link) => {
            const active = navIsActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`lp-nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="lp-nav-actions">
          {ready && user ? (
            <NavAccountMenu user={user} />
          ) : (
            <>
              <Link href="/merchant" className="lp-nav-login">
                Log in
              </Link>
              <Link href="/loyalty-stamps#pricing" className="lp-btn lp-btn--accent lp-nav-cta">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

interface SiteShellProps {
  children: ReactNode;
}

/** Page frame for marketing routes: shared header, content, shared footer. */
export function SiteShell({ children }: SiteShellProps) {
  return (
    <div className="lp merchant-theme">
      <SiteHeader />
      <main className="lp-main">{children}</main>
      <SiteFooter />
    </div>
  );
}
