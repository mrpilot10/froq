"use server";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCanonicalPhone, toSupabaseAuthPhone } from "@/lib/auth/otp/phone";
import { isValidPhone } from "@/lib/auth/format";
import { callAcceptDeadlineMs } from "@/lib/merchant/queue-settings";
import { checkQueueCapacity } from "@/lib/queue/capacity";
import { getOpenQueueSession } from "@/lib/queue/live-board";
import { verifyTurnstileToken } from "@/lib/turnstile/verify";

export type PublicQueueTicketStatus = "waiting" | "called" | "seated" | "left";

export type PublicQueueTicket = {
  entryId: string;
  status: PublicQueueTicketStatus;
  name: string;
  partySize: number;
  /** Display number only (e.g. "3") — UI prefixes with #. */
  tokenLabel: string;
  queuePosition: number;
  calledAtMs?: number;
  acceptByMs?: number;
};

/**
 * Public QR join: insert into the merchant's live session + send queue_first_notify.
 *
 * Fully anonymous and it messages the phone number it is handed, so it is both a
 * spam vector against the merchant's live board and a way to send unsolicited
 * WhatsApp/SMS at our cost. No GoTrue endpoint is involved, so the Turnstile
 * token is checked against Cloudflare here.
 */
export async function joinLiveQueue(input: {
  slug: string;
  name: string;
  phone: string;
  partySize: number;
  email?: string;
  branchSlug?: string | null;
  captchaToken?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  entryId?: string;
  publicToken?: string;
  queuePosition?: number;
  estimatedWaitMinutes?: number;
  tokenLabel?: string;
}> {
  try {
    const slug = input.slug.trim();
    const name = input.name.trim();
    const partySize = Math.max(1, Math.round(input.partySize));
    const email = input.email?.trim() || null;

    if (!slug) return { ok: false, error: "Invalid queue link." };
    if (!name) return { ok: false, error: "Please enter your name." };

    const captcha = await verifyTurnstileToken(input.captchaToken);
    if (!captcha.ok) return { ok: false, error: captcha.error };

    const digits = input.phone.replace(/\D/g, "").slice(-10);
    if (!isValidPhone(digits)) {
      return { ok: false, error: "Enter a valid 10-digit mobile number." };
    }
    const canonical = toCanonicalPhone(digits);
    const phoneE164 = canonical ? toSupabaseAuthPhone(canonical) : null;
    if (!phoneE164) {
      return { ok: false, error: "Enter a valid 10-digit mobile number." };
    }

    const admin = createAdminClient();
    const { data: merchant } = await admin
      .from("merchants")
      .select("id, business_name")
      .eq("slug", slug)
      .maybeSingle();
    if (!merchant?.id) return { ok: false, error: "Shop not found." };

    let branchId: string | null = null;
    if (input.branchSlug?.trim()) {
      const { data: branch } = await admin
        .from("branches")
        .select("id")
        .eq("merchant_id", merchant.id)
        .eq("slug", input.branchSlug.trim())
        .maybeSingle();
      branchId = branch?.id ?? null;
    }

    const open = await getOpenQueueSession(merchant.id, branchId);
    if (!open) {
      return {
        ok: false,
        error: "This queue isn't live right now. Ask the restaurant to start it.",
      };
    }
    if (open.status === "paused") {
      return {
        ok: false,
        error: "The queue is paused. Please try again in a few minutes.",
      };
    }

    // Guests never see the merchant's billing state, just that it's closed.
    const capacity = await checkQueueCapacity(merchant.id);
    if (!capacity.ok) {
      return {
        ok: false,
        error: "This queue isn't taking new guests right now. Please ask the staff.",
      };
    }

    const national = phoneE164.replace(/\D/g, "").slice(-10);
    const variants = [phoneE164, national, `91${national}`, `+91${national}`];

    const { data: existing } = await admin
      .from("customers")
      .select(
        "id, name, phone, public_token, whatsapp_available, preferred_notification_channel",
      )
      .eq("merchant_id", merchant.id)
      .in("phone", variants)
      .limit(1)
      .maybeSingle();

    let customer = existing;
    if (!customer?.public_token) {
      const { data: inserted, error } = await admin
        .from("customers")
        .insert({
          merchant_id: merchant.id,
          branch_id: branchId,
          name,
          phone: phoneE164,
          email,
        })
        .select(
          "id, name, phone, public_token, whatsapp_available, preferred_notification_channel",
        )
        .single();
      if (error || !inserted?.public_token) {
        console.error("joinLiveQueue customer insert failed", error?.message);
        return { ok: false, error: "Couldn't join the queue. Try again." };
      }
      await admin.from("loyalty_cards").upsert(
        {
          customer_id: inserted.id,
          merchant_id: merchant.id,
          branch_id: branchId,
          stamps: 0,
          status: "active",
        },
        { onConflict: "customer_id", ignoreDuplicates: true },
      );
      customer = inserted;
    } else if (name !== customer.name) {
      // The name typed on the join form wins over whatever is on file, so a
      // shared or recycled number doesn't greet this guest by someone else's
      // name in every WhatsApp message.
      await admin.from("customers").update({ name }).eq("id", customer.id);
    }

    // Prevent duplicate active waiting/called for same phone in this session.
    const { data: alreadyIn } = await admin
      .from("queue_entries")
      .select("id, status")
      .eq("session_id", open.id)
      .eq("phone", customer.phone)
      .in("status", ["waiting", "called"])
      .limit(1)
      .maybeSingle();
    if (alreadyIn) {
      return {
        ok: false,
        error: "You're already in this queue.",
        entryId: alreadyIn.id,
        publicToken: customer.public_token,
      };
    }

    const { data: entry, error: entryError } = await admin
      .from("queue_entries")
      .insert({
        merchant_id: merchant.id,
        session_id: open.id,
        branch_id: branchId,
        customer_id: customer.id,
        name,
        phone: customer.phone,
        email,
        party_size: partySize,
        kind: "walkin",
        status: "waiting",
      })
      .select("*")
      .single();

    if (entryError || !entry) {
      console.error("joinLiveQueue entry insert failed", entryError?.message);
      return { ok: false, error: "Couldn't join the queue. Try again." };
    }

    const { data: waitingRows } = await admin
      .from("queue_entries")
      .select("id")
      .eq("session_id", open.id)
      .eq("status", "waiting")
      .lte("joined_at", entry.joined_at);

    const queuePosition = waitingRows?.length ?? 1;
    const estimatedWaitMinutes = queuePosition * 8;
    const businessName =
      (merchant.business_name ?? "the store").trim() || "the store";

    // Capture template values before return — never re-query inside after().
    const notifyCustomer = {
      phone: customer.phone,
      name,
      publicToken: customer.public_token as string,
      whatsappAvailable: true as const,
      preferredNotificationChannel: "whatsapp" as const,
    };
    const notifyData = {
      businessName,
      bookingSize: partySize,
      queuePosition,
      estimatedWaitMinutes,
    };
    const entryId = entry.id;

    // TODO(queue-notify-recovery): If `after()` dies mid-send (isolate kill /
    // timeout after the response returns), the guest stays in the queue with
    // `notified_joined_at` still null and nothing retries `queue_first_notify`.
    // Unlike `queue_call_now`, there is no cron catch-up for join. Lower stakes
    // than a missing call message — add a null-`notified_joined_at` recovery
    // pass later if join confirms start dropping in production.
    after(async () => {
      try {
        const { sendCustomerNotification } = await import("@/lib/notifications");
        const { queueJoinNotifyTemplate } = await import("@/lib/queue/ai-menu");
        const notify = await sendCustomerNotification({
          customer: notifyCustomer,
          template: await queueJoinNotifyTemplate(merchant.id),
          data: notifyData,
        });
        if (!notify.ok) {
          console.error(
            JSON.stringify({
              scope: "queue_whatsapp_after",
              event: "joinLiveQueue_send_failed",
              entryId,
              error: notify.error,
              at: new Date().toISOString(),
            }),
          );
          return;
        }
        await admin
          .from("queue_entries")
          .update({ notified_joined_at: new Date().toISOString() })
          .eq("id", entryId);
      } catch (err) {
        console.error(
          JSON.stringify({
            scope: "queue_whatsapp_after",
            event: "joinLiveQueue_after_unhandled",
            entryId,
            error: err instanceof Error ? err.message : "unknown",
            at: new Date().toISOString(),
          }),
        );
      }
    });

    return {
      ok: true,
      entryId: entry.id,
      publicToken: customer.public_token,
      queuePosition,
      estimatedWaitMinutes,
      tokenLabel: String(queuePosition),
    };
  } catch (error) {
    console.error("joinLiveQueue exception", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't join the queue.",
    };
  }
}

/**
 * Public ticket poll — status for a guest's own queue entry (by id + shop slug).
 */
export async function getLiveQueueTicket(input: {
  slug: string;
  entryId: string;
}): Promise<{ ok: boolean; error?: string; ticket?: PublicQueueTicket }> {
  try {
    const slug = input.slug.trim();
    const entryId = input.entryId.trim();
    if (!slug || !entryId) {
      return { ok: false, error: "Invalid ticket." };
    }

    const admin = createAdminClient();
    const { data: merchant } = await admin
      .from("merchants")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!merchant?.id) return { ok: false, error: "Shop not found." };

    const { data: entry } = await admin
      .from("queue_entries")
      .select("id, status, name, party_size, joined_at, called_at, session_id")
      .eq("id", entryId)
      .eq("merchant_id", merchant.id)
      .maybeSingle();
    if (!entry) return { ok: false, error: "Ticket not found." };

    const status = entry.status as PublicQueueTicketStatus;
    const calledAtMs = entry.called_at
      ? new Date(entry.called_at).getTime()
      : undefined;
    const acceptByMs =
      calledAtMs != null && Number.isFinite(calledAtMs)
        ? callAcceptDeadlineMs(calledAtMs)
        : undefined;

    // Stable session number by join order (does not shrink when others leave).
    const { count: joinOrder } = await admin
      .from("queue_entries")
      .select("id", { count: "exact", head: true })
      .eq("session_id", entry.session_id)
      .lte("joined_at", entry.joined_at);
    const tokenNumber = Math.max(1, joinOrder ?? 1);

    let queuePosition = tokenNumber;
    if (status === "waiting") {
      const { count } = await admin
        .from("queue_entries")
        .select("id", { count: "exact", head: true })
        .eq("session_id", entry.session_id)
        .eq("status", "waiting")
        .lte("joined_at", entry.joined_at);
      queuePosition = Math.max(1, count ?? 1);
    }

    return {
      ok: true,
      ticket: {
        entryId: entry.id,
        status,
        name: entry.name,
        partySize: entry.party_size,
        tokenLabel: String(tokenNumber),
        queuePosition,
        calledAtMs: Number.isFinite(calledAtMs) ? calledAtMs : undefined,
        acceptByMs,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't load ticket.",
    };
  }
}

export type QueuePageMerchant = {
  slug: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  banner: string;
  bannerLink: string;
  /** Queue ↔ AI Menu — waitlist shows View our AI menu. */
  aiMenuEnabled: boolean;
};

export type QueuePageInitialTicket = {
  entryId: string;
  token: string;
  /** Customer public token for AI Menu deep links. */
  publicToken?: string;
  name: string;
  phone: string;
  party: number;
  waitMinutes: number;
  joinedAt: number;
  status: PublicQueueTicketStatus;
  calledAtMs?: number;
  acceptByMs?: number;
};

/**
 * Resolve /queue/{slug} (merchant join QR) or /queue/{frq_…} (WhatsApp deep link).
 */
export async function resolveQueuePage(
  slugOrToken: string,
): Promise<
  | { ok: true; merchant: QueuePageMerchant; initialTicket?: QueuePageInitialTicket }
  | { ok: false }
> {
  try {
    const raw = slugOrToken.trim();
    if (!raw) return { ok: false };

    const admin = createAdminClient();

    if (/^frq_/i.test(raw)) {
      const { data: customer } = await admin
        .from("customers")
        .select("id, name, phone, merchant_id")
        .eq("public_token", raw)
        .maybeSingle();
      if (!customer?.merchant_id) return { ok: false };

      const { data: merchantRow } = await admin
        .from("merchants")
        .select(
          "slug, business_name, brand_color, logo_url, queue_banner, queue_banner_link",
        )
        .eq("id", customer.merchant_id)
        .maybeSingle();
      if (!merchantRow?.slug) return { ok: false };

      const { isQueueAiMenuEnabled } = await import("@/lib/queue/ai-menu");
      const aiMenuEnabled = await isQueueAiMenuEnabled(customer.merchant_id);
      const merchant: QueuePageMerchant = {
        slug: merchantRow.slug,
        businessName: merchantRow.business_name,
        brandColor: merchantRow.brand_color,
        logoUrl: merchantRow.logo_url,
        banner: merchantRow.queue_banner ?? "",
        bannerLink: merchantRow.queue_banner_link ?? "",
        aiMenuEnabled,
      };

      const { data: entry } = await admin
        .from("queue_entries")
        .select("id, status, joined_at, called_at")
        .eq("customer_id", customer.id)
        .eq("merchant_id", customer.merchant_id)
        .in("status", ["waiting", "called"])
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!entry?.id) {
        return { ok: true, merchant };
      }

      const ticketResult = await getLiveQueueTicket({
        slug: merchant.slug,
        entryId: entry.id,
      });
      if (!ticketResult.ok || !ticketResult.ticket) {
        return { ok: true, merchant };
      }

      const remote = ticketResult.ticket;
      const joinedAt = entry.joined_at
        ? new Date(entry.joined_at).getTime()
        : Date.now();

      return {
        ok: true,
        merchant,
        initialTicket: {
          entryId: remote.entryId,
          token: remote.tokenLabel,
          publicToken: raw,
          name: remote.name,
          phone: customer.phone ?? "",
          party: remote.partySize,
          waitMinutes: Math.max(1, remote.queuePosition) * 8,
          joinedAt,
          status: remote.status,
          calledAtMs: remote.calledAtMs,
          acceptByMs: remote.acceptByMs,
        },
      };
    }

    const { data: merchantRow } = await admin
      .from("merchants")
      .select(
        "id, slug, business_name, brand_color, logo_url, queue_banner, queue_banner_link",
      )
      .eq("slug", raw)
      .maybeSingle();
    if (!merchantRow?.slug) return { ok: false };

    const { isQueueAiMenuEnabled } = await import("@/lib/queue/ai-menu");
    const aiMenuEnabled = await isQueueAiMenuEnabled(merchantRow.id);

    return {
      ok: true,
      merchant: {
        slug: merchantRow.slug,
        businessName: merchantRow.business_name,
        brandColor: merchantRow.brand_color,
        logoUrl: merchantRow.logo_url,
        banner: merchantRow.queue_banner ?? "",
        bannerLink: merchantRow.queue_banner_link ?? "",
        aiMenuEnabled,
      },
    };
  } catch {
    return { ok: false };
  }
}

/** @deprecated Prefer joinLiveQueue */
export const notifyQueueJoinedPublic = joinLiveQueue;
