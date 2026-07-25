"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { toCanonicalPhone, toSupabaseAuthPhone } from "@/lib/auth/otp/phone";
import { isValidPhone } from "@/lib/auth/format";
import { getOpenQueueSession } from "@/lib/queue/live-board";

/**
 * Public QR join: insert into the merchant's live session + send queue_first_notify.
 */
export async function joinLiveQueue(input: {
  slug: string;
  name: string;
  phone: string;
  partySize: number;
  email?: string;
  branchSlug?: string | null;
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

    const { sendCustomerNotification } = await import("@/lib/notifications");
    const notify = await sendCustomerNotification({
      customer: {
        phone: customer.phone,
        name: customer.name || name,
        publicToken: customer.public_token,
        whatsappAvailable: true,
        preferredNotificationChannel: "whatsapp",
      },
      template: "queue_first_notify",
      data: {
        businessName,
        bookingSize: partySize,
        queuePosition,
        estimatedWaitMinutes,
      },
    });

    if (notify.ok) {
      await admin
        .from("queue_entries")
        .update({ notified_joined_at: new Date().toISOString() })
        .eq("id", entry.id);
    } else {
      console.error("joinLiveQueue notify failed", notify.error);
      // Guest is still in the queue — surface the notify error separately.
      return {
        ok: true,
        entryId: entry.id,
        publicToken: customer.public_token,
        queuePosition,
        estimatedWaitMinutes,
        tokenLabel: String(queuePosition),
        error: notify.error
          ? `Joined, but notification failed: ${notify.error}`
          : "Joined, but notification failed.",
      };
    }

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

/** @deprecated Prefer joinLiveQueue */
export const notifyQueueJoinedPublic = joinLiveQueue;
