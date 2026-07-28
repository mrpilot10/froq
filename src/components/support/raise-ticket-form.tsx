"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Lightbulb } from "lucide-react";
import { submitSupportTicket } from "@/app/help/actions";
import { TICKET_CATEGORIES, suggestArticles } from "@/lib/support/help-content";
import { TurnstileField } from "@/components/turnstile/turnstile-field";
import { useTurnstile } from "@/lib/turnstile/use-turnstile";

interface RaiseTicketFormProps {
  defaultName?: string;
  defaultEmail?: string;
  businessName?: string | null;
}

export function RaiseTicketForm({
  defaultName = "",
  defaultEmail = "",
  businessName = null,
}: RaiseTicketFormProps) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [category, setCategory] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const captcha = useTurnstile({ action: "support-ticket" });

  // Suggestions follow the subject line — most people describe the problem
  // there first, and an article may save them the wait for a reply.
  const suggestions = useMemo(() => suggestArticles(subject), [subject]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!captcha.ready) {
      setError(captcha.blockedMessage);
      return;
    }

    startTransition(async () => {
      const result = await submitSupportTicket({
        name,
        email,
        category,
        subject,
        message,
        captchaToken: captcha.token ?? undefined,
      });
      captcha.reset();

      if (result.ok) {
        setReference(result.reference);
        setSubject("");
        setMessage("");
        setCategory("");
      } else {
        setError(result.error);
      }
    });
  }

  if (reference) {
    return (
      <section className="ticket-done">
        <CheckCircle2 size={32} strokeWidth={2.2} />
        <h1>Ticket raised</h1>
        <p>
          Your reference is <strong>{reference}</strong>. We&apos;ve emailed a copy to {email}{" "}
          and we usually reply within one business day.
        </p>
        <div className="ticket-done-actions">
          <button type="button" className="lp-btn lp-btn--accent" onClick={() => setReference(null)}>
            Raise another ticket
          </button>
          <Link href="/help" className="ticket-done-link">
            Back to documentation
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="ticket-form-wrap">
      <header className="docs-head">
        <span className="docs-kicker">Support</span>
        <h1>Raise a ticket</h1>
        <p className="docs-lead">
          Tell us what&apos;s happening and we&apos;ll reply by email, usually within one
          business day.
          {businessName ? ` We'll attach this to ${businessName}.` : ""}
        </p>
      </header>

      <form className="ticket-form" onSubmit={handleSubmit}>
        <div className="ticket-form-row">
          <label className="ticket-field">
            <span>Your name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>

          <label className="ticket-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
        </div>

        <label className="ticket-field">
          <span>What&apos;s it about?</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            required
          >
            <option value="" disabled>
              Choose a topic
            </option>
            {TICKET_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="ticket-field">
          <span>Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Guests aren't receiving WhatsApp alerts"
            required
          />
        </label>

        {suggestions.length > 0 ? (
          <div className="ticket-suggest" aria-live="polite">
            <p className="ticket-suggest-head">
              <Lightbulb size={14} strokeWidth={2.4} />
              These articles might answer it already
            </p>
            <ul>
              {suggestions.map((hit) => (
                <li key={hit.articleId}>
                  <Link href={hit.href} target="_blank" className="ticket-suggest-link">
                    <span>{hit.question}</span>
                    <small>{hit.categoryLabel}</small>
                    <ArrowUpRight size={14} strokeWidth={2.4} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <label className="ticket-field">
          <span>Describe the issue</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={7}
            placeholder="What were you doing, what did you expect, and what happened instead? Include a branch name or time if it helps us find it."
            required
          />
          <small className="ticket-hint">
            The more detail you give us, the faster we can fix it.
          </small>
        </label>

        <TurnstileField {...captcha.fieldProps} />

        {error ? (
          <p className="ticket-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="lp-btn lp-btn--accent ticket-submit"
          disabled={pending || !captcha.ready}
        >
          {pending ? "Sending…" : "Raise ticket"}
        </button>
      </form>
    </section>
  );
}
