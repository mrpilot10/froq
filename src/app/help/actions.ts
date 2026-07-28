"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidEmail, normalizeEmail } from "@/lib/auth/format";
import { sendSupportTicketEmails } from "@/lib/email/resend";
import { TICKET_CATEGORIES } from "@/lib/support/help-content";
import { verifyTurnstileToken } from "@/lib/turnstile/verify";

const MAX_PER_WINDOW = 3;
const WINDOW_MS = 10 * 60 * 1000;

export interface SupportTicketInput {
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  captchaToken?: string;
}

export type SupportTicketResult =
  | { ok: true; reference: string }
  | { ok: false; error: string };

/** Short, readable code the sender can quote back at us. */
function newReference() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `FRQ-${suffix}`;
}

/**
 * Tickets are merchant-only, so this both authorises the request and gives us
 * the business to quote in the inbox copy.
 */
async function senderContext() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: owned } = await supabase
      .from("merchants")
      .select("id, business_name")
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (owned) {
      return { userId: user.id, merchantId: owned.id, businessName: owned.business_name };
    }

    const { data: membership } = await supabase
      .from("merchant_members")
      .select("merchant_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return { userId: user.id, merchantId: null, businessName: null };

    const { data: merchant } = await supabase
      .from("merchants")
      .select("business_name")
      .eq("id", membership.merchant_id)
      .maybeSingle();

    return {
      userId: user.id,
      merchantId: membership.merchant_id,
      businessName: merchant?.business_name ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Turnstile applies even though this needs a session: each ticket sends two
 * emails through Resend, and the only throttle is a per-email count that a
 * scripted client could still ride up to on every window.
 */
export async function submitSupportTicket(
  input: SupportTicketInput,
): Promise<SupportTicketResult> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email ?? "");
  const category = input.category.trim();
  const subject = input.subject.trim();
  const message = input.message.trim();

  if (!name) return { ok: false, error: "Please tell us your name." };
  if (!isValidEmail(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!TICKET_CATEGORIES.includes(category as (typeof TICKET_CATEGORIES)[number])) {
    return { ok: false, error: "Please choose what your request is about." };
  }
  if (subject.length < 3) return { ok: false, error: "Please add a short subject." };
  if (message.length < 20) {
    return { ok: false, error: "Please describe the issue in a little more detail." };
  }
  if (message.length > 5000) {
    return { ok: false, error: "That message is too long. Please keep it under 5000 characters." };
  }

  try {
    const captcha = await verifyTurnstileToken(input.captchaToken);
    if (!captcha.ok) return { ok: false, error: captcha.error };

    const sender = await senderContext();
    if (!sender) {
      return { ok: false, error: "Please log in to raise a ticket." };
    }

    const admin = createAdminClient();

    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count } = await admin
      .from("support_tickets")
      .select("*", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);

    if ((count ?? 0) >= MAX_PER_WINDOW) {
      return {
        ok: false,
        error:
          "You've raised a few tickets just now. Please give us a little time to reply before sending another.",
      };
    }

    const reference = newReference();

    const { error } = await admin.from("support_tickets").insert({
      reference,
      merchant_id: sender.merchantId,
      user_id: sender.userId,
      name,
      email,
      category,
      subject,
      message,
    });
    if (error) return { ok: false, error: "Could not record your ticket. Please try again." };

    // The ticket is saved either way; a mail failure is worth surfacing so the
    // sender knows to expect a reply by another route.
    const mail = await sendSupportTicketEmails({
      reference,
      name,
      email,
      category,
      subject,
      message,
      businessName: sender.businessName,
    });
    if (!mail.ok) {
      return {
        ok: false,
        error: `We saved your request (${reference}) but couldn't send the confirmation email. We'll still get back to you.`,
      };
    }

    return { ok: true, reference };
  } catch {
    return { ok: false, error: "Something went wrong. Please try again in a moment." };
  }
}
