import "server-only";

import { Resend } from "resend";

/** Resend segment for the marketing newsletter subscribe form. */
export const FROQ_NEWSLETTER_SEGMENT_ID =
  process.env.RESEND_NEWSLETTER_SEGMENT_ID?.trim() ||
  "f4c2475f-0ff2-4eb4-bffb-8d99af71b1e8";

export type NewsletterSubscribeResult =
  | { ok: true }
  | { ok: false; error: string };

function getResend() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

/**
 * Create (or upsert) a Resend contact and attach them to the newsletter segment.
 */
export async function subscribeToNewsletter(
  email: string,
): Promise<NewsletterSubscribeResult> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const resend = getResend();
  if (!resend) {
    return { ok: false, error: "Newsletter signup is temporarily unavailable." };
  }

  const { error } = await resend.contacts.create({
    email: normalized,
    unsubscribed: false,
    segments: [{ id: FROQ_NEWSLETTER_SEGMENT_ID }],
  });

  if (!error) return { ok: true };

  // Already on the list (or already in the segment) — treat as success.
  const message = error.message?.toLowerCase() ?? "";
  if (
    message.includes("already") ||
    message.includes("exists") ||
    message.includes("duplicate")
  ) {
    const add = await resend.contacts.segments.add({
      email: normalized,
      segmentId: FROQ_NEWSLETTER_SEGMENT_ID,
    });
    if (!add.error) return { ok: true };
    const addMsg = add.error.message?.toLowerCase() ?? "";
    if (addMsg.includes("already") || addMsg.includes("exists")) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    error: error.message || "Couldn’t subscribe right now. Try again shortly.",
  };
}
