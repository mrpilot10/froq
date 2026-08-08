"use server";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCanonicalPhone, toSupabaseAuthPhone } from "@/lib/auth/otp/phone";
import { isValidPhone } from "@/lib/auth/format";
import { callAcceptDeadlineMs } from "@/lib/merchant/queue-settings";
import { checkQueueCapacity } from "@/lib/queue/capacity";
import {
  getOpenQueueSession,
  liveQueuePosition,
  resolveJoinBranchId,
  sessionTicketNumber,
} from "@/lib/queue/live-board";
import { resolveGuestSocialLinks } from "@/lib/merchant/guest-social-links";
import { verifyTurnstileToken } from "@/lib/turnstile/verify";

export type PublicQueueTicketStatus = "waiting" | "called" | "seated" | "left";

export type PublicQueueTicket = {
  entryId: string;
  status: PublicQueueTicketStatus;
  name: string;
  partySize: number;
  /**
   * Stable session ticket # (join order among all entries this session).
   * Not place-in-line — seated/left guests ahead still bump this.
   */
  tokenLabel: string;
  /**
   * Live rank among held + waiting + called (recalculated on seat/leave).
   * Guest “#N in queue” / est. wait must use this, not tokenLabel.
   */
  queuePosition: number;
  /** Customer public token for AI Menu CTA when Queue integration is on. */
  publicToken?: string;
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

    let branchId = await resolveJoinBranchId(
      merchant.id,
      input.branchSlug,
    );

    const open = await getOpenQueueSession(merchant.id, branchId);
    if (!open) {
      return {
        ok: false,
        error: "This queue isn't open right now. Please check with the restaurant.",
      };
    }
    // Prefer the session's branch so entries stay aligned with the live board.
    if (open.branch_id) branchId = open.branch_id;
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
        "id, name, phone, email, public_token, whatsapp_available, preferred_notification_channel",
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
          "id, name, phone, email, public_token, whatsapp_available, preferred_notification_channel",
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

    // Prevent duplicate active waiting/called/held for same phone in this session.
    const { data: alreadyIn } = await admin
      .from("queue_entries")
      .select("id, status")
      .eq("session_id", open.id)
      .eq("phone", customer.phone)
      .in("status", ["held", "waiting", "called"])
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

    // tokenLabel = session join #; queuePosition = live rank (held+waiting+called).
    const [tokenNumber, queuePosition] = await Promise.all([
      sessionTicketNumber(open.id, entry.joined_at),
      liveQueuePosition(open.id, entry.joined_at),
    ]);
    const estimatedWaitMinutes = queuePosition * 8;
    const businessName =
      (merchant.business_name ?? "the store").trim() || "the store";

    // Capture template values before return — never re-query inside after().
    const notifyCustomer = {
      phone: customer.phone,
      name,
      email: (customer.email as string | null) ?? null,
      publicToken: customer.public_token as string,
      whatsappAvailable: true as const,
      preferredNotificationChannel: "whatsapp" as const,
    };
    const notifyData = {
      businessName,
      bookingSize: partySize,
      queuePosition,
      estimatedWaitMinutes,
      menuSlug: slug,
    };
    const entryId = entry.id;

    // Resolve the template before `after()` — same pattern as merchant
    // queue-actions — so the AI Menu gate isn't re-run in a detatched context.
    const { queueJoinNotifyTemplate } = await import("@/lib/queue/ai-menu");
    const joinTemplate = await queueJoinNotifyTemplate(merchant.id);

    // TODO(queue-notify-recovery): If `after()` dies mid-send (isolate kill /
    // timeout after the response returns), the guest stays in the queue with
    // `notified_joined_at` still null and nothing retries `queue_first_notify`.
    // Unlike `queue_call_now`, there is no cron catch-up for join. Lower stakes
    // than a missing call message — add a null-`notified_joined_at` recovery
    // pass later if join confirms start dropping in production.
    after(async () => {
      try {
        const { sendCustomerNotification } = await import("@/lib/notifications");
        const notify = await sendCustomerNotification({
          customer: notifyCustomer,
          template: joinTemplate,
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
      tokenLabel: String(tokenNumber),
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
      .select("id, status, name, party_size, joined_at, called_at, session_id, customer_id")
      .eq("id", entryId)
      .eq("merchant_id", merchant.id)
      .maybeSingle();
    if (!entry) return { ok: false, error: "Ticket not found." };

    let publicToken: string | undefined;
    if (entry.customer_id) {
      const { data: customer } = await admin
        .from("customers")
        .select("public_token")
        .eq("id", entry.customer_id)
        .maybeSingle();
      if (customer?.public_token) publicToken = customer.public_token;
    }

    const status = (
      entry.status === "held" ? "waiting" : entry.status
    ) as PublicQueueTicketStatus;
    const calledAtMs = entry.called_at
      ? new Date(entry.called_at).getTime()
      : undefined;
    const acceptByMs =
      calledAtMs != null && Number.isFinite(calledAtMs)
        ? callAcceptDeadlineMs(calledAtMs)
        : undefined;

    const tokenNumber = await sessionTicketNumber(
      entry.session_id,
      entry.joined_at,
    );

    // Live place-in-line while still on the board (held + waiting + called).
    const queuePosition =
      entry.status === "waiting" ||
      entry.status === "called" ||
      entry.status === "held"
        ? await liveQueuePosition(entry.session_id, entry.joined_at)
        : tokenNumber;

    return {
      ok: true,
      ticket: {
        entryId: entry.id,
        status,
        name: entry.name,
        partySize: entry.party_size,
        tokenLabel: String(tokenNumber),
        queuePosition,
        publicToken,
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

export type QueuePageSocialLinks = {
  instagram?: string;
  whatsapp?: string;
  facebook?: string;
  website?: string;
  googleReviews?: string;
};

/** Whether new guests can join — drives dedicated closed/paused chrome. */
export type QueueJoinGate = "open" | "closed" | "paused" | "unavailable";

export type QueuePageMerchant = {
  slug: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  banner: string;
  bannerLink: string;
  /** Store phone for tel: contact icon (optional). */
  phone?: string;
  address?: string;
  googleMapsUrl?: string;
  socialLinks: QueuePageSocialLinks;
  joinGate: QueueJoinGate;
  /** Queue ↔ AI Menu integration — waitlist shows "View our AI menu". */
  aiMenuEnabled: boolean;
};

const QUEUE_MERCHANT_SELECT =
  "id, slug, business_name, brand_color, logo_url, queue_banner, queue_banner_link, phone, address, google_maps_url, website_url, instagram_url, facebook_url, google_business_url, google_place_id";

const QUEUE_BRANCH_CONTACT_SELECT =
  "phone, address, google_maps_url, website_url, instagram_url, facebook_url, google_business_url, google_place_id";

type QueueMerchantRow = {
  id: string;
  slug: string;
  business_name: string;
  brand_color: string;
  logo_url: string | null;
  queue_banner: string | null;
  queue_banner_link: string | null;
  phone: string | null;
  address: string | null;
  google_maps_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  google_business_url: string | null;
  google_place_id: string | null;
};

type QueueBranchContact = {
  phone: string | null;
  address: string | null;
  google_maps_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  google_business_url: string | null;
  google_place_id: string | null;
};

/**
 * Prefer the open queue session’s branch (when set), else the merchant default.
 * Guests on a branch-scoped session should see that branch’s socials/contact.
 */
async function loadQueueBranchContact(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
  branchId?: string | null,
): Promise<QueueBranchContact | null> {
  if (branchId) {
    const { data } = await admin
      .from("branches")
      .select(QUEUE_BRANCH_CONTACT_SELECT)
      .eq("id", branchId)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (data) return data as QueueBranchContact;
  }
  const { data } = await admin
    .from("branches")
    .select(QUEUE_BRANCH_CONTACT_SELECT)
    .eq("merchant_id", merchantId)
    .eq("is_default", true)
    .maybeSingle();
  return (data as QueueBranchContact | null) ?? null;
}

async function resolveJoinGate(
  merchantId: string,
  branchId?: string | null,
): Promise<QueueJoinGate> {
  const open = await getOpenQueueSession(merchantId, branchId);
  if (!open) return "closed";
  if (open.status === "paused") return "paused";
  const capacity = await checkQueueCapacity(merchantId);
  if (!capacity.ok) return "unavailable";
  return "open";
}

/** Branch contact wins; merchant row is the fallback (same as loyalty). */
function toQueuePageMerchant(
  row: QueueMerchantRow,
  branch: QueueBranchContact | null | undefined,
  joinGate: QueueJoinGate,
  aiMenuEnabled: boolean,
): QueuePageMerchant {
  const pick = (branchValue: string | null | undefined, merchantValue: string | null | undefined) =>
    branchValue?.trim() || merchantValue?.trim() || undefined;

  return {
    slug: row.slug,
    businessName: row.business_name,
    brandColor: row.brand_color,
    logoUrl: row.logo_url,
    banner: row.queue_banner ?? "",
    bannerLink: row.queue_banner_link ?? "",
    phone: pick(branch?.phone, row.phone),
    address: pick(branch?.address, row.address) ?? "",
    googleMapsUrl: pick(branch?.google_maps_url, row.google_maps_url),
    socialLinks: resolveGuestSocialLinks(branch, row),
    joinGate,
    aiMenuEnabled,
  };
}

export type QueuePageInitialTicket = {
  entryId: string;
  /** Live place in line — shown as #N on the guest ticket. */
  token: string;
  /** Stable session ticket # (join order); optional for older clients. */
  ticketNumber?: string;
  /** Customer public token for AI Menu deep links when integration is on. */
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
 * Optional `branchSlug` (`?b=`) scopes the join gate and contact to that branch;
 * otherwise the merchant default branch is used.
 */
export async function resolveQueuePage(
  slugOrToken: string,
  branchSlug?: string | null,
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
        .select(QUEUE_MERCHANT_SELECT)
        .eq("id", customer.merchant_id)
        .maybeSingle();
      if (!merchantRow?.slug) return { ok: false };

      const branchId = await resolveJoinBranchId(
        customer.merchant_id,
        branchSlug,
      );
      const open = await getOpenQueueSession(customer.merchant_id, branchId);
      const branch = await loadQueueBranchContact(
        admin,
        customer.merchant_id,
        open?.branch_id ?? branchId,
      );
      const joinGate = await resolveJoinGate(customer.merchant_id, branchId);
      const { isQueueAiMenuEnabled } = await import("@/lib/queue/ai-menu");
      const aiMenuEnabled = await isQueueAiMenuEnabled(customer.merchant_id);
      const merchant = toQueuePageMerchant(
        merchantRow as QueueMerchantRow,
        branch,
        joinGate,
        aiMenuEnabled,
      );

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
          // Place in line (not session ticket #) — see PublicQueueTicket docs.
          token: String(remote.queuePosition),
          ticketNumber: remote.tokenLabel,
          publicToken: remote.publicToken || raw,
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
      .select(QUEUE_MERCHANT_SELECT)
      .eq("slug", raw)
      .maybeSingle();
    if (!merchantRow?.slug) return { ok: false };

    const row = merchantRow as QueueMerchantRow;
    const branchId = await resolveJoinBranchId(row.id, branchSlug);
    const open = await getOpenQueueSession(row.id, branchId);
    const branch = await loadQueueBranchContact(
      admin,
      row.id,
      open?.branch_id ?? branchId,
    );
    const joinGate = await resolveJoinGate(row.id, branchId);
    const { isQueueAiMenuEnabled } = await import("@/lib/queue/ai-menu");
    const aiMenuEnabled = await isQueueAiMenuEnabled(row.id);

    return {
      ok: true,
      merchant: toQueuePageMerchant(row, branch, joinGate, aiMenuEnabled),
    };
  } catch {
    return { ok: false };
  }
}

/** @deprecated Prefer joinLiveQueue */
export const notifyQueueJoinedPublic = joinLiveQueue;
