"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Clock, Mail, Minus, Phone, Plus, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { formatPhoneDisplay, isValidEmail, isValidPhone } from "@/lib/auth/format";
import { useBrandTheme } from "@/lib/loyalty/use-brand-theme";
import { FroqFooter } from "@/components/shared/froq-footer";

interface QueueJoinScreenProps {
  slug: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  banner?: string;
  bannerLink?: string;
}

interface Ticket {
  token: string;
  name: string;
  phone: string;
  party: number;
  ahead: number;
  waitMinutes: number;
  joinedAt: number;
}

const MINUTES_PER_PARTY = 8;

function makeToken() {
  const n = Math.floor(Math.random() * 60) + 12;
  return `A${n}`;
}

export function QueueJoinScreen({
  slug,
  businessName,
  brandColor,
  logoUrl,
  banner,
  bannerLink,
}: QueueJoinScreenProps) {
  useBrandTheme(brandColor);

  const storageKey = `froq.queue.ticket.${slug}`;

  const [ready, setReady] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [party, setParty] = useState(2);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);

  // Restore an existing ticket (so a refresh keeps the customer in line).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setTicket(JSON.parse(raw) as Ticket);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [storageKey]);

  const join = useCallback(() => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!isValidPhone(phone)) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    if (email.trim() && !isValidEmail(email)) {
      setError("Enter a valid email address, or leave it blank.");
      return;
    }
    setError("");
    setJoining(true);

    const ahead = Math.floor(Math.random() * 5) + 1;
    const next: Ticket = {
      token: makeToken(),
      name: name.trim(),
      phone: `+91${phone}`,
      party,
      ahead,
      waitMinutes: ahead * MINUTES_PER_PARTY,
      joinedAt: Date.now(),
    };

    window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      setTicket(next);
      setJoining(false);
      toast.success(`You're in line at ${businessName}!`);
    }, 500);
  }, [name, phone, email, party, storageKey, businessName]);

  const leaveQueue = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setTicket(null);
    setName("");
    setPhone("");
    setEmail("");
    setParty(2);
    toast("You've left the queue.");
  }, [storageKey]);

  return (
    <div className="loyalty-page">
      <div className="loyalty-screen auth-screen">
        <header className="merchant-auth-head">
          <div className="merchant-auth-logo" style={{ background: brandColor }}>
            {logoUrl ? (
              <Image src={logoUrl} alt={businessName} width={56} height={56} unoptimized />
            ) : (
              <Clock size={26} strokeWidth={2} color="#fff" />
            )}
          </div>
          <h1 className="merchant-auth-brand">{businessName}</h1>
          <p className="merchant-auth-tag qjoin-live">
            <span className="qjoin-live-dot" aria-hidden="true" />
            Live waitlist
          </p>
        </header>

        {(!ready || !ticket) && (
        <div className="auth-card">
          {!ready && (
            <div className="auth-loading" aria-busy="true">
              <div className="processing-spinner" aria-hidden="true" />
              <p className="processing-title">Just a moment…</p>
            </div>
          )}

          {ready && !ticket && (
            <>
              <div className="auth-head">
                <div className="auth-badge" aria-hidden="true">
                  <Users size={24} strokeWidth={2} color="#fff" />
                </div>
                <h2 className="auth-title">Join the queue</h2>
                <p className="auth-sub">
                  Join the waitlist at {businessName}. We&apos;ll text you when your table is ready.
                </p>
              </div>

              <label className="auth-field">
                <span className="auth-label">Full name</span>
                <input
                  className="auth-input"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setError("");
                  }}
                />
              </label>

              <label className="auth-field">
                <span className="auth-label">Mobile number</span>
                <div className="auth-phone-row">
                  <span className="auth-phone-prefix">+91</span>
                  <input
                    className="auth-input auth-input-phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                      setError("");
                    }}
                  />
                </div>
              </label>

              <label className="auth-field">
                <span className="auth-label">Email (optional)</span>
                <div className="auth-input-with-icon">
                  <Mail size={18} strokeWidth={2} aria-hidden="true" />
                  <input
                    className="auth-input"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                  />
                </div>
              </label>

              <div className="auth-field">
                <span className="auth-label">Party size</span>
                <div className="queue-party-row qjoin-party">
                  <div className="queue-party-copy">
                    <span className="queue-party-label">Number of persons</span>
                    <span className="queue-party-hint">How many in your party?</span>
                  </div>
                  <div className="queue-stepper">
                    <button
                      type="button"
                      className="queue-stepper-btn"
                      aria-label="Decrease party size"
                      onClick={() => setParty((n) => Math.max(1, n - 1))}
                      disabled={party <= 1}
                    >
                      <Minus size={16} strokeWidth={2.4} />
                    </button>
                    <span className="queue-stepper-value">{party}</span>
                    <button
                      type="button"
                      className="queue-stepper-btn"
                      aria-label="Increase party size"
                      onClick={() => setParty((n) => Math.min(20, n + 1))}
                      disabled={party >= 20}
                    >
                      <Plus size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="button"
                className="cta-btn auth-submit"
                disabled={joining}
                onClick={join}
              >
                {joining ? "Joining…" : "Join waitlist"}
              </button>
            </>
          )}
        </div>
        )}

        {ready && ticket && (
          <div className="qjoin-ticket-view">
            <div className="pass-stack">
              <div className="pass-shadow-card s2" />
              <div className="pass-shadow-card s1" />

              <div className="pass qpass">
                <div className="qpass-head">
                  <span className="qpass-eyebrow">Waitlist ticket</span>
                  <span className="qpass-status">
                    <span className="qpass-status-dot" aria-hidden="true" />
                    In line
                  </span>
                </div>

                <div className="qpass-token">
                  <span className="qpass-token-label">Your number</span>
                  <span className="qpass-token-value">{ticket.token}</span>
                  <span className="qpass-token-name">
                    <UserRound size={13} strokeWidth={2.3} />
                    {ticket.name}
                    {ticket.party > 1 ? ` +${ticket.party - 1}` : ""}
                  </span>
                </div>

                <div className="pass-divider" />

                <div className="qpass-stats">
                  <div className="qpass-stat">
                    <span className="qpass-stat-value">{ticket.ahead}</span>
                    <span className="qpass-stat-label">Ahead of you</span>
                  </div>
                  <div className="qpass-stat">
                    <span className="qpass-stat-value">
                      ~{ticket.waitMinutes}
                      <i>min</i>
                    </span>
                    <span className="qpass-stat-label">Est. wait</span>
                  </div>
                  <div className="qpass-stat">
                    <span className="qpass-stat-value">{ticket.party}</span>
                    <span className="qpass-stat-label">Party size</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="qjoin-under">
              <p className="qjoin-hint">
                <Phone size={15} strokeWidth={2.2} />
                We&apos;ll text {formatPhoneDisplay(ticket.phone.replace("+91", ""))} when your
                table is ready. Keep this page handy.
              </p>

              {banner && banner.trim() && (
                bannerLink && bannerLink.trim() ? (
                  <a
                    className="qjoin-banner"
                    href={bannerLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Image
                      src={banner}
                      alt={`${businessName} announcement`}
                      width={800}
                      height={450}
                      unoptimized
                      className="qjoin-banner-img"
                    />
                  </a>
                ) : (
                  <div className="qjoin-banner">
                    <Image
                      src={banner}
                      alt={`${businessName} announcement`}
                      width={800}
                      height={450}
                      unoptimized
                      className="qjoin-banner-img"
                    />
                  </div>
                )
              )}

              <button type="button" className="qjoin-leave" onClick={leaveQueue}>
                Leave the queue
              </button>
            </div>
          </div>
        )}

        <FroqFooter />
      </div>
    </div>
  );
}
