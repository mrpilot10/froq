"use server";

import { requireMerchantContext } from "@/lib/merchant/server-context";
import { canViewCustomerData } from "@/lib/merchant/roles";
import { createAdminClient } from "@/lib/supabase/admin";

export type MenuCustomerRow = {
  key: string;
  customerId: string | null;
  name: string;
  phone: string;
  email: string | null;
  birthdate: string | null;
  visits: number;
  lastSeenMs: number;
  lastPartySize: number | null;
  lastTable: number | null;
  branchId: string | null;
};

export type MenuCustomerActivity = {
  id: string;
  openedAtMs: number;
  closedAtMs: number | null;
  partySize: number | null;
  tableNumber: number | null;
  tableLabel: string | null;
  status: string;
  notes: string | null;
  totalAmount: number;
  kind: "special_offers" | "dining" | "other";
  branchId: string | null;
  orderCount: number;
  dishNames: string[];
};

function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function labelKind(notes: string | null): MenuCustomerActivity["kind"] {
  if (notes === "special_offers_capture") return "special_offers";
  if (notes) return "other";
  return "dining";
}

/**
 * Guests who verified details on the digital menu or appeared
 * on a dining session with a name/phone.
 */
export async function fetchMenuCustomers(input?: {
  branchId?: string | null;
}): Promise<{ ok: boolean; customers?: MenuCustomerRow[]; error?: string }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!canViewCustomerData(ctx.role)) {
      return { ok: false, error: "You don’t have access to customer data." };
    }

    const admin = createAdminClient();
    let query = admin
      .from("menu_dining_sessions")
      .select(
        "id, customer_id, guest_name, guest_phone, party_size, table_number, branch_id, opened_at, notes",
      )
      .eq("merchant_id", ctx.merchantId)
      .or("customer_id.not.is.null,guest_phone.not.is.null")
      .order("opened_at", { ascending: false })
      .limit(2000);

    const branchId = input?.branchId ?? null;
    if (branchId) query = query.eq("branch_id", branchId);

    const { data: sessions, error } = await query;
    if (error) return { ok: false, error: error.message };

    const byKey = new Map<
      string,
      {
        customerId: string | null;
        name: string;
        phone: string;
        visits: number;
        lastSeenMs: number;
        lastPartySize: number | null;
        lastTable: number | null;
        branchId: string | null;
      }
    >();

    for (const row of sessions ?? []) {
      const phone = phoneKey(row.guest_phone);
      const key = row.customer_id
        ? `id:${row.customer_id}`
        : phone
          ? `ph:${phone}`
          : null;
      if (!key) continue;

      const openedAtMs = Date.parse(String(row.opened_at));
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          customerId: (row.customer_id as string | null) ?? null,
          name: (row.guest_name as string | null)?.trim() || "Guest",
          phone: (row.guest_phone as string | null) || phone,
          visits: 1,
          lastSeenMs: Number.isFinite(openedAtMs) ? openedAtMs : 0,
          lastPartySize: (row.party_size as number | null) ?? null,
          lastTable: (row.table_number as number | null) ?? null,
          branchId: (row.branch_id as string | null) ?? null,
        });
        continue;
      }
      existing.visits += 1;
      if (Number.isFinite(openedAtMs) && openedAtMs > existing.lastSeenMs) {
        existing.lastSeenMs = openedAtMs;
        existing.lastPartySize = (row.party_size as number | null) ?? existing.lastPartySize;
        existing.lastTable = (row.table_number as number | null) ?? existing.lastTable;
        existing.branchId = (row.branch_id as string | null) ?? existing.branchId;
        if (row.guest_name?.trim()) existing.name = row.guest_name.trim();
      }
      if (!existing.customerId && row.customer_id) {
        existing.customerId = row.customer_id as string;
      }
    }

    const customerIds = [...byKey.values()]
      .map((row) => row.customerId)
      .filter((id): id is string => Boolean(id));

    const contactById = new Map<
      string,
      { name: string; phone: string; email: string | null; birthdate: string | null }
    >();
    if (customerIds.length > 0) {
      const { data: customers } = await admin
        .from("customers")
        .select("id, name, phone, email, birthdate")
        .eq("merchant_id", ctx.merchantId)
        .in("id", customerIds);
      for (const c of customers ?? []) {
        contactById.set(c.id, {
          name: c.name?.trim() || "Guest",
          phone: c.phone ?? "",
          email: (c.email as string | null) ?? null,
          birthdate: (c.birthdate as string | null) ?? null,
        });
      }
    }

    const customers: MenuCustomerRow[] = [...byKey.entries()]
      .map(([key, row]) => {
        const contact = row.customerId ? contactById.get(row.customerId) : null;
        return {
          key,
          customerId: row.customerId,
          name: contact?.name || row.name,
          phone: contact?.phone || row.phone,
          email: contact?.email ?? null,
          birthdate: contact?.birthdate ?? null,
          visits: row.visits,
          lastSeenMs: row.lastSeenMs,
          lastPartySize: row.lastPartySize,
          lastTable: row.lastTable,
          branchId: row.branchId,
        };
      })
      .sort((a, b) => b.lastSeenMs - a.lastSeenMs);

    return { ok: true, customers };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load customers.",
    };
  }
}

export async function fetchMenuCustomerActivity(input: {
  customerId?: string | null;
  phone?: string | null;
  branchId?: string | null;
}): Promise<{
  ok: boolean;
  activity?: MenuCustomerActivity[];
  email?: string | null;
  birthdate?: string | null;
  merchantNotes?: string;
  customerId?: string | null;
  error?: string;
}> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (!canViewCustomerData(ctx.role)) {
      return { ok: false, error: "You don’t have access to customer data." };
    }

    const admin = createAdminClient();
    const phone = phoneKey(input.phone);
    const variants = phone
      ? [phone, `91${phone}`, `+91${phone}`, `+91 ${phone}`]
      : [];

    let sessionsQuery = admin
      .from("menu_dining_sessions")
      .select(
        "id, customer_id, guest_name, guest_phone, party_size, table_number, table_label, branch_id, opened_at, closed_at, status, notes, total_amount",
      )
      .eq("merchant_id", ctx.merchantId)
      .order("opened_at", { ascending: false })
      .limit(100);

    if (input.customerId) {
      sessionsQuery = sessionsQuery.eq("customer_id", input.customerId);
    } else if (variants.length > 0) {
      sessionsQuery = sessionsQuery.in("guest_phone", variants);
    } else {
      return { ok: true, activity: [], merchantNotes: "", customerId: null };
    }

    const branchId = input.branchId ?? null;
    if (branchId) sessionsQuery = sessionsQuery.eq("branch_id", branchId);

    const { data: sessions, error } = await sessionsQuery;
    if (error) return { ok: false, error: error.message };

    const sessionIds = (sessions ?? []).map((s) => s.id);
    const dishesBySession = new Map<string, string[]>();
    const orderCountBySession = new Map<string, number>();

    if (sessionIds.length > 0) {
      const { data: orders } = await admin
        .from("menu_orders")
        .select("id, session_id")
        .in("session_id", sessionIds);
      const orderIds = (orders ?? []).map((o) => o.id);
      for (const order of orders ?? []) {
        const sid = order.session_id as string;
        orderCountBySession.set(sid, (orderCountBySession.get(sid) ?? 0) + 1);
      }
      if (orderIds.length > 0) {
        const { data: items } = await admin
          .from("menu_order_items")
          .select("order_id, name")
          .in("order_id", orderIds);
        const orderToSession = new Map(
          (orders ?? []).map((o) => [o.id as string, o.session_id as string]),
        );
        for (const item of items ?? []) {
          const sid = orderToSession.get(item.order_id as string);
          if (!sid) continue;
          const list = dishesBySession.get(sid) ?? [];
          if (item.name && !list.includes(item.name)) list.push(item.name);
          dishesBySession.set(sid, list);
        }
      }
    }

    let customerId = input.customerId ?? null;
    let email: string | null = null;
    let birthdate: string | null = null;
    let merchantNotes = "";

    if (!customerId && sessions?.[0]?.customer_id) {
      customerId = sessions[0].customer_id as string;
    }

    if (customerId) {
      const { data: customer } = await admin
        .from("customers")
        .select("id, email, birthdate, merchant_notes")
        .eq("id", customerId)
        .eq("merchant_id", ctx.merchantId)
        .maybeSingle();
      if (customer) {
        email = (customer.email as string | null) ?? null;
        birthdate = (customer.birthdate as string | null) ?? null;
        merchantNotes = (customer.merchant_notes as string | null) ?? "";
      }
    }

    const activity: MenuCustomerActivity[] = (sessions ?? []).map((row) => ({
      id: row.id as string,
      openedAtMs: Date.parse(String(row.opened_at)) || 0,
      closedAtMs: row.closed_at ? Date.parse(String(row.closed_at)) : null,
      partySize: (row.party_size as number | null) ?? null,
      tableNumber: (row.table_number as number | null) ?? null,
      tableLabel: (row.table_label as string | null) ?? null,
      status: String(row.status ?? "open"),
      notes: (row.notes as string | null) ?? null,
      totalAmount: Number(row.total_amount) || 0,
      kind: labelKind((row.notes as string | null) ?? null),
      branchId: (row.branch_id as string | null) ?? null,
      orderCount: orderCountBySession.get(row.id as string) ?? 0,
      dishNames: dishesBySession.get(row.id as string) ?? [],
    }));

    return {
      ok: true,
      activity,
      email,
      birthdate,
      merchantNotes,
      customerId,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load activity.",
    };
  }
}
