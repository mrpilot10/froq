"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Check,
  Mail,
  Minus,
  Phone,
  Plus,
  Timer,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatPhoneDisplay, isValidEmail, isValidPhone } from "@/lib/auth/format";
import { CALL_ACCEPT_MINUTES } from "@/lib/merchant/queue-settings";
import { waitSegments } from "@/lib/queue/format";
import { useBrandTheme } from "@/lib/loyalty/use-brand-theme";
import { FroqFooter } from "@/components/shared/froq-footer";
import {
  getLiveQueueTicket,
  joinLiveQueue,
  type PublicQueueTicketStatus,
  type QueuePageInitialTicket,
} from "@/app/queue/actions";
import { TurnstileField } from "@/components/turnstile/turnstile-field";
import { useTurnstile } from "@/lib/turnstile/use-turnstile";

interface QueueJoinScreenProps {
  slug: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  banner?: string;
  bannerLink?: string;
  /** From /queue/frq_… WhatsApp links — restores live ticket without localStorage. */
  initialTicket?: QueuePageInitialTicket;
}

interface Ticket {
  entryId?: string;
  /** Queue position number only (e.g. "1") — UI prefixes with #. */
  token: string;
  name: string;
  phone: string;
  party: number;
  waitMinutes: number;
  joinedAt: number;
  status?: PublicQueueTicketStatus;
  calledAtMs?: number;
  acceptByMs?: number;
}

function queueNumberLabel(token: string | number | undefined, fallback = 1): string {
  const digits = String(token ?? fallback).replace(/\D/g, "");
  return digits || String(fallback);
}

/** Logo stand-in when the merchant hasn't uploaded one. */
function brandInitial(businessName: string) {
  const match = businessName.match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? "?").toUpperCase();
}

function formatCountdown(msLeft: number) {
  const totalSec = Math.max(0, Math.ceil(msLeft / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function QueueJoinScreen({
  slug,
  businessName,
  brandColor,
  logoUrl,
  banner,
  bannerLink,
  initialTicket,
}: QueueJoinScreenProps) {
  useBrandTheme(brandColor);

  const storageKey = `froq.queue.ticket.${slug}`;

  const [ready, setReady] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [party, setParty] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const captcha = useTurnstile({ action: "queue-join" });

  const persistTicket = useCallback(
    (next: Ticket | null) => {
      try {
        if (next) window.localStorage.setItem(storageKey, JSON.stringify(next));
        else window.localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      setTicket(next);
    },
    [storageKey],
  );

  // Restore ticket: WhatsApp deep link (server) beats localStorage (same device).
  useEffect(() => {
    if (initialTicket) {
      persistTicket(initialTicket);
      setReady(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setTicket(JSON.parse(raw) as Ticket);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [storageKey, initialTicket, persistTicket]);

  // Poll live status while the guest still has a ticket.
  useEffect(() => {
    if (!ready || !ticket?.entryId) return;

    let cancelled = false;
    const sync = async () => {
      const result = await getLiveQueueTicket({
        slug,
        entryId: ticket.entryId!,
      });
      if (cancelled || !result.ok || !result.ticket) return;
      const remote = result.ticket;
      setTicket((prev) => {
        if (!prev) return prev;
        const next: Ticket = {
          ...prev,
          status: remote.status,
          name: remote.name || prev.name,
          party: remote.partySize || prev.party,
          token: queueNumberLabel(remote.tokenLabel, Number(prev.token) || 1),
          calledAtMs: remote.calledAtMs,
          acceptByMs: remote.acceptByMs,
        };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    };

    void sync();
    const id = window.setInterval(() => void sync(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready, ticket?.entryId, slug, storageKey]);

  // Tick the arrive countdown while called.
  useEffect(() => {
    if (ticket?.status !== "called") return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticket?.status]);

  const join = useCallback(async () => {
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (party == null || party < 1) {
      setError("Select number of persons.");
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
    if (!captcha.ready) {
      setError(captcha.blockedMessage);
      return;
    }
    setError("");
    setJoining(true);

    try {
      const result = await joinLiveQueue({
        slug,
        name: name.trim(),
        phone,
        partySize: party,
        email: email.trim() || undefined,
        captchaToken: captcha.token ?? undefined,
      });
      captcha.reset();

      if (!result.ok || !result.entryId) {
        setError(result.error ?? "Couldn't join the queue.");
        return;
      }

      const position = result.queuePosition ?? 1;
      const next: Ticket = {
        entryId: result.entryId,
        token: queueNumberLabel(result.tokenLabel ?? position, position),
        name: name.trim(),
        phone: `+91${phone}`,
        party,
        waitMinutes: result.estimatedWaitMinutes ?? position * 8,
        joinedAt: Date.now(),
        status: "waiting",
      };

      persistTicket(next);
      toast.success(`You're in line at ${businessName}!`);
      if (result.error) toast.error(result.error);
    } catch {
      setError("Couldn't join the queue. Try again.");
    } finally {
      setJoining(false);
    }
  }, [name, phone, email, party, persistTicket, businessName, slug, captcha]);

  const leaveQueue = useCallback(() => {
    persistTicket(null);
    setName("");
    setPhone("");
    setEmail("");
    setParty(null);
    toast("You've left the queue.");
  }, [persistTicket]);

  const status: PublicQueueTicketStatus = ticket?.status ?? "waiting";
  const deadlineMs =
    ticket?.acceptByMs ??
    (ticket?.calledAtMs != null
      ? ticket.calledAtMs + CALL_ACCEPT_MINUTES * 60_000
      : undefined);
  const msLeft = deadlineMs != null ? deadlineMs - now : 0;
  const timerUrgent = status === "called" && msLeft < 60_000;

  const statusMeta: Record<
    PublicQueueTicketStatus,
    { label: string; cls: string }
  > = {
    waiting: { label: "In line", cls: "waiting" },
    called: { label: "Table ready", cls: "called" },
    seated: { label: "Seated", cls: "seated" },
    left: { label: "Left queue", cls: "left" },
  };

  return (
    <div className="loyalty-page">
      <div className="loyalty-screen auth-screen">
        <header className="merchant-auth-head">
          <div className="merchant-auth-logo" style={{ background: brandColor }}>
            {logoUrl ? (
              <Image src={logoUrl} alt={businessName} width={56} height={56} unoptimized />
            ) : (
              <span className="merchant-auth-logo-letter" aria-hidden="true">
                {brandInitial(businessName)}
              </span>
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
            // A saved ticket is restored from localStorage, so we don't yet know
            // whether this guest sees the form or their place in line. Shape the
            // placeholder like the form — the common case for a fresh scan.
            <div aria-busy="true">
              <span className="sr-only">Loading the waitlist</span>
              <div className="auth-head">
                <div className="sk sk-circle" style={{ width: 52, height: 52, margin: "0 auto" }} />
                <div
                  className="sk sk-line"
                  style={{ width: 150, height: 18, margin: "14px auto 0" }}
                />
                <div className="sk sk-line" style={{ width: 230, margin: "10px auto 0" }} />
              </div>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} style={{ marginTop: 18 }}>
                  <div className="sk sk-line" style={{ width: 88 }} />
                  <div
                    className="sk"
                    style={{ width: "100%", height: 48, borderRadius: 14, marginTop: 8 }}
                  />
                </div>
              ))}
              <div
                className="sk"
                style={{ width: "100%", height: 52, borderRadius: 16, marginTop: 22 }}
              />
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
                <div className="queue-party-row qjoin-party">
                  <span className="auth-label">Number of persons</span>
                  <div className="queue-stepper">
                    <button
                      type="button"
                      className="queue-stepper-btn"
                      aria-label="Decrease party size"
                      onClick={() => setParty((n) => Math.max(1, (n ?? 1) - 1))}
                      disabled={party == null || party <= 1}
                    >
                      <Minus size={16} strokeWidth={2.4} />
                    </button>
                    <span className="queue-stepper-value">{party ?? "—"}</span>
                    <button
                      type="button"
                      className="queue-stepper-btn"
                      aria-label="Increase party size"
                      onClick={() =>
                        setParty((n) => Math.min(20, n == null ? 1 : n + 1))
                      }
                      disabled={party != null && party >= 20}
                    >
                      <Plus size={16} strokeWidth={2.4} />
                    </button>
                  </div>
                </div>
              </div>

              <TurnstileField {...captcha.fieldProps} />

              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="button"
                className="cta-btn auth-submit"
                disabled={joining || !captcha.ready}
                onClick={() => void join()}
              >
                {joining ? "Joining…" : "Join waitlist"}
              </button>
            </>
          )}
        </div>
        )}

        {ready && ticket && (
          <div className={`qjoin-ticket-view qjoin-ticket-view--${status}`}>
            <div className="pass-stack">
              <div className="pass-shadow-card s2" />
              <div className="pass-shadow-card s1" />

              <div className={`pass qpass qpass--${status}`}>
                <div className="qpass-head">
                  <span className="qpass-eyebrow">Waitlist ticket</span>
                  <span className={`qpass-status qpass-status--${statusMeta[status].cls}`}>
                    <span className="qpass-status-dot" aria-hidden="true" />
                    {statusMeta[status].label}
                  </span>
                </div>

                {status === "waiting" && (
                  <>
                    <div className="qpass-token">
                      <span className="qpass-token-label">Your number</span>
                      <span className="qpass-token-value">
                        <span className="qpass-token-hash" aria-hidden="true">
                          #
                        </span>
                        <span>{queueNumberLabel(ticket.token)}</span>
                      </span>
                      <span className="qpass-token-name">
                        <UserRound size={13} strokeWidth={2.3} />
                        {ticket.name}
                        {ticket.party > 1 ? ` +${ticket.party - 1}` : ""}
                      </span>
                    </div>

                    <div className="pass-divider" />

                    <div className="qpass-stats qpass-stats-2">
                      <div className="qpass-stat">
                        <span className="qpass-stat-value">
                          ~
                          {waitSegments(ticket.waitMinutes).map((part) => (
                            <Fragment key={part.unit}>
                              {part.value}
                              <i>{part.unit}</i>
                            </Fragment>
                          ))}
                        </span>
                        <span className="qpass-stat-label">Est. wait</span>
                      </div>
                      <div className="qpass-stat">
                        <span className="qpass-stat-value">{ticket.party}</span>
                        <span className="qpass-stat-label">Party size</span>
                      </div>
                    </div>
                  </>
                )}

                {status === "called" && (
                  <>
                    <div className="qpass-token qpass-token--compact">
                      <span className="qpass-token-label">Your number</span>
                      <span className="qpass-token-value qpass-token-value--sm">
                        <span className="qpass-token-hash" aria-hidden="true">
                          #
                        </span>
                        <span>{queueNumberLabel(ticket.token)}</span>
                      </span>
                      <span className="qpass-token-name">
                        <UserRound size={13} strokeWidth={2.3} />
                        {ticket.name}
                        {ticket.party > 1 ? ` · party of ${ticket.party}` : ""}
                      </span>
                    </div>

                    <div className="pass-divider" />

                    <div
                      className={`qpass-arrive${timerUrgent ? " is-urgent" : ""}`}
                      aria-live="polite"
                    >
                      <div className="qpass-arrive-label">
                        <Timer size={15} strokeWidth={2.4} aria-hidden="true" />
                        Time to arrive
                      </div>
                      <div className="qpass-arrive-timer">
                        {formatCountdown(msLeft)}
                      </div>
                      <p className="qpass-arrive-copy">
                        Please reach {businessName} within{" "}
                        <strong>{CALL_ACCEPT_MINUTES} minutes</strong>.
                      </p>
                    </div>
                  </>
                )}

                {status === "seated" && (
                  <div className="qpass-outcome">
                    <div className="qpass-outcome-icon qpass-outcome-icon--ok" aria-hidden="true">
                      <Check size={28} strokeWidth={2.6} />
                    </div>
                    <h2 className="qpass-outcome-title">You&apos;re seated</h2>
                    <span className="qpass-token-name">
                      <UserRound size={13} strokeWidth={2.3} />
                      #{queueNumberLabel(ticket.token)} · {ticket.name}
                    </span>
                  </div>
                )}

                {status === "left" && (
                  <div className="qpass-outcome">
                    <div className="qpass-outcome-icon qpass-outcome-icon--left" aria-hidden="true">
                      <X size={26} strokeWidth={2.4} />
                    </div>
                    <h2 className="qpass-outcome-title">No longer in the queue</h2>
                    <p className="qpass-outcome-copy">
                      Your spot at {businessName} has been released.
                    </p>
                    <span className="qpass-token-name">
                      <UserRound size={13} strokeWidth={2.3} />
                      Was #{queueNumberLabel(ticket.token)} · {ticket.name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="qjoin-under">
              {status === "waiting" && (
                <>
                  <p className="qjoin-arrive-note">
                    Once called, please reach within {CALL_ACCEPT_MINUTES} minutes.
                  </p>
                  <p className="qjoin-hint">
                    <Phone size={15} strokeWidth={2.2} />
                    We&apos;ll text {formatPhoneDisplay(ticket.phone.replace("+91", ""))} when
                    your table is ready. Keep this page handy.
                  </p>
                </>
              )}

              {status === "called" && (
                <p className="qjoin-hint qjoin-hint--call">
                  <Timer size={15} strokeWidth={2.2} />
                  Your table is ready. Head over now — the timer above shows how long you
                  have to arrive.
                </p>
              )}

              {status === "left" && (
                <p className="qjoin-hint">
                  If you still need a table, you can join the waitlist again below.
                </p>
              )}

              {banner && banner.trim() && (status === "waiting" || status === "called") && (
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

              {status === "waiting" && (
                <button type="button" className="qjoin-leave" onClick={leaveQueue}>
                  Leave the queue
                </button>
              )}

              {(status === "seated" || status === "left") && (
                <button
                  type="button"
                  className="qjoin-again"
                  onClick={() => {
                    persistTicket(null);
                    setName("");
                    setPhone("");
                    setEmail("");
                    setParty(null);
                  }}
                >
                  {status === "left" ? "Join again" : "Done"}
                </button>
              )}
            </div>
          </div>
        )}

        <FroqFooter />
      </div>
    </div>
  );
}
