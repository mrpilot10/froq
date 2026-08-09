"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Heart,
  Stamp,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { FROQ_LOGO_SRC } from "@/lib/brand";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Contact us", href: "/contact" },
  { label: "Help", href: "/help" },
] as const;

const PRODUCT_LINKS: ReadonlyArray<{
  label: string;
  href: string;
  Icon: LucideIcon;
}> = [
  { label: "Loyalty Stamps", href: "/loyalty-stamps", Icon: Stamp },
  { label: "Smart Queue", href: "/queue-management", Icon: Users },
  { label: "AI Digital Menu", href: "/ai-digital-menu", Icon: UtensilsCrossed },
  { label: "Reservations", href: "/merchant", Icon: CalendarDays },
];

const POLICY_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Refund Policy", href: "/refund-policy" },
] as const;

function SocialGlyph({
  name,
  size = 16,
}: {
  name: "instagram" | "linkedin" | "x";
  size?: number;
}) {
  if (name === "instagram") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="5"
          stroke="currentColor"
          strokeWidth="1.9"
        />
        <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.9" />
        <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
      </svg>
    );
  }
  if (name === "linkedin") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="3"
          stroke="currentColor"
          strokeWidth="1.9"
        />
        <path
          d="M8 10.5V16.5M8 7.8v.1M12 16.5v-3.6c0-1.5.9-2.4 2.2-2.4 1.2 0 1.8.8 1.8 2.3v3.7"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4l11.5 16H20L8.5 4H4z" />
      <path d="M12.5 11.5L20 20" />
      <path d="M4 4l6.5 6.5" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/froq.io",
    glyph: "instagram" as const,
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/froq",
    glyph: "linkedin" as const,
  },
  {
    label: "X",
    href: "https://x.com/froqio",
    glyph: "x" as const,
  },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const company = String(data.get("company") ?? "");

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/marketing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, company }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setStatus("error");
        setMessage(json.error || "Couldn’t subscribe. Try again.");
        return;
      }
      setStatus("done");
      setMessage("You're on the list — thanks for joining.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Couldn’t subscribe. Try again.");
    }
  }

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <Link href="/" className="site-footer-logo">
              <Image src={FROQ_LOGO_SRC} alt="Froq" width={32} height={32} />
              <span>Froq</span>
            </Link>
            <p>
              Tools that help restaurants fill the room, serve the table, and bring guests back —
              without another app for your customers.
            </p>
            <div className="site-footer-social" aria-label="Follow us">
              <span className="site-footer-social-label">Follow us</span>
              <div className="site-footer-social-links">
                {SOCIAL_LINKS.map(({ label, href, glyph }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="site-footer-social-btn"
                  >
                    <SocialGlyph name={glyph} />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <nav className="site-footer-col" aria-label="Company">
            <h3>Nav</h3>
            <ul>
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="site-footer-col" aria-label="Products">
            <h3>Products</h3>
            <ul>
              {PRODUCT_LINKS.map(({ label, href, Icon }) => (
                <li key={href}>
                  <Link href={href} className="site-footer-product-link">
                    <Icon size={15} strokeWidth={2.2} aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav className="site-footer-col" aria-label="Policies">
            <h3>Policies</h3>
            <ul>
              {POLICY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="site-footer-col site-footer-subscribe">
            <h3>Subscribe</h3>
            <p>Product updates and restaurant tips. No spam.</p>
            <form className="site-footer-form" onSubmit={onSubscribe}>
              <label className="sr-only" htmlFor="site-footer-email">
                Email address
              </label>
              <input
                id="site-footer-email"
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@restaurant.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (status !== "idle" && status !== "loading") setStatus("idle");
                }}
                disabled={status === "loading"}
              />
              {/* Honeypot */}
              <input
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="site-footer-honeypot"
              />
              <button type="submit" className="lp-btn lp-btn--accent" disabled={status === "loading"}>
                {status === "loading" ? "Joining…" : "Subscribe"}
                <ArrowRight size={15} strokeWidth={2.4} />
              </button>
            </form>
            {message ? (
              <p
                className={`site-footer-form-msg${status === "error" ? " is-error" : ""}`}
                role="status"
              >
                {message}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="site-footer-bar">
        <div className="site-footer-bar-inner">
          <p className="site-footer-made">
            Made in India{" "}
            <Heart size={13} strokeWidth={2.4} fill="currentColor" aria-hidden="true" />
          </p>
          <p className="site-footer-copy">© {year} Froq. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
