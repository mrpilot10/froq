"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  requireMerchantContext,
  type MerchantContext,
} from "@/lib/merchant/server-context";
import { resolveBranchFilterForUser } from "@/lib/merchant/branch-access";
import {
  DEFAULT_TABLE_TURN_MINUTES,
  expandLayoutToTables,
  layoutFromTables,
  parseTableLayout,
  pickBestTable,
  timesOverlap,
  addMinutesToTime,
  validateDiningTableDraft,
  validateTableLayout,
  type DiningTable,
  type TableLayoutRow,
} from "@/lib/merchant/dining-tables";
import { formatTimeForInput } from "@/lib/merchant/queue-hours";

function mapDiningTable(row: {
  id: string;
  branch_id: string;
  table_number: number;
  seats: number;
  label: string | null;
  status: string;
  sort_order: number;
}): DiningTable {
  return {
    id: row.id,
    branchId: row.branch_id,
    number: row.table_number,
    seats: row.seats,
    label: row.label,
    status: row.status === "inactive" ? "inactive" : "active",
    sortOrder: row.sort_order,
  };
}

async function scopedBranchId(
  ctx: Extract<MerchantContext, { ok: true }>,
  requested: string | null | undefined,
): Promise<string | null> {
  const supabase = await createClient();
  return resolveBranchFilterForUser(
    supabase,
    ctx.merchantId,
    ctx.userId,
    requested ?? null,
  );
}

export async function fetchBranchTableLayout(input: {
  branchId: string;
}): Promise<{
  ok: boolean;
  error?: string;
  layout: TableLayoutRow[];
  tables: DiningTable[];
}> {
  const empty = { layout: [] as TableLayoutRow[], tables: [] as DiningTable[] };
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, ...empty };

    const branchId = await scopedBranchId(ctx, input.branchId);
    if (!branchId) return { ok: false, error: "Pick a branch first.", ...empty };

    const admin = createAdminClient();
    const [{ data: branch }, { data: rows }] = await Promise.all([
      admin
        .from("branches")
        .select("table_layout")
        .eq("id", branchId)
        .eq("merchant_id", ctx.merchantId)
        .maybeSingle(),
      admin
        .from("dining_tables")
        .select("id, branch_id, table_number, seats, label, status, sort_order")
        .eq("branch_id", branchId)
        .eq("merchant_id", ctx.merchantId)
        .order("sort_order", { ascending: true })
        .order("table_number", { ascending: true }),
    ]);

    return {
      ok: true,
      layout: parseTableLayout(branch?.table_layout),
      tables: (rows ?? []).map(mapDiningTable),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not load tables.",
      ...empty,
    };
  }
}

/**
 * Replace the branch inventory with an explicit numbered table list.
 * Numbers are merchant-editable; we also store a seats×qty summary on the branch.
 */
export async function saveBranchDiningTables(input: {
  branchId: string;
  tables: Array<{ number: number; seats: number }>;
}): Promise<{
  ok: boolean;
  error?: string;
  layout?: TableLayoutRow[];
  tables?: DiningTable[];
}> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };
    if (ctx.role === "staff") {
      return { ok: false, error: "Only owners and managers can edit tables." };
    }

    const branchId = await scopedBranchId(ctx, input.branchId);
    if (!branchId) return { ok: false, error: "Pick a branch first." };

    const tables = input.tables.map((t) => ({
      number: Math.round(Number(t.number)),
      seats: Math.round(Number(t.seats)),
    }));

    const validation = validateDiningTableDraft(tables);
    if (validation) return { ok: false, error: validation };

    const layout = layoutFromTables(tables);
    const sorted = [...tables].sort((a, b) => a.number - b.number);
    const admin = createAdminClient();

    const { error: layoutError } = await admin
      .from("branches")
      .update({ table_layout: layout })
      .eq("id", branchId)
      .eq("merchant_id", ctx.merchantId);
    if (layoutError) return { ok: false, error: layoutError.message };

    const { error: delError } = await admin
      .from("dining_tables")
      .delete()
      .eq("branch_id", branchId)
      .eq("merchant_id", ctx.merchantId);
    if (delError) return { ok: false, error: delError.message };

    if (sorted.length === 0) {
      return { ok: true, layout, tables: [] };
    }

    const { data: inserted, error: insError } = await admin
      .from("dining_tables")
      .insert(
        sorted.map((t, index) => ({
          merchant_id: ctx.merchantId,
          branch_id: branchId,
          table_number: t.number,
          seats: t.seats,
          sort_order: index,
          status: "active",
        })),
      )
      .select("id, branch_id, table_number, seats, label, status, sort_order");
    if (insError) return { ok: false, error: insError.message };

    return {
      ok: true,
      layout,
      tables: (inserted ?? []).map(mapDiningTable),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save tables.",
    };
  }
}

/**
 * Replace the branch layout and regenerate numbered tables 1…N.
 * Prefer {@link saveBranchDiningTables} when numbers are custom.
 */
export async function saveBranchTableLayout(input: {
  branchId: string;
  layout: TableLayoutRow[];
}): Promise<{
  ok: boolean;
  error?: string;
  layout?: TableLayoutRow[];
  tables?: DiningTable[];
}> {
  const layout = input.layout
    .map((row) => ({
      seats: Math.round(Number(row.seats)),
      quantity: Math.round(Number(row.quantity)),
    }))
    .filter((row) => row.seats >= 1 && row.quantity >= 1);

  const validation = validateTableLayout(layout);
  if (validation) return { ok: false, error: validation };

  return saveBranchDiningTables({
    branchId: input.branchId,
    tables: expandLayoutToTables(layout),
  });
}

export async function listBranchDiningTables(input: {
  branchId: string;
}): Promise<{ ok: boolean; error?: string; tables: DiningTable[] }> {
  const result = await fetchBranchTableLayout(input);
  return {
    ok: result.ok,
    error: result.error,
    tables: result.tables.filter((t) => t.status === "active"),
  };
}

export async function findOccupiedTableIds(input: {
  branchId: string;
  date?: string | null;
  time?: string | null;
  turnMinutes?: number;
  ignoreReservationId?: string | null;
  ignoreQueueEntryId?: string | null;
}): Promise<{ ok: boolean; error?: string; occupiedIds: string[] }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error, occupiedIds: [] };

    const admin = createAdminClient();
    const occupied = new Set<string>();

    const { data: seated } = await admin
      .from("queue_entries")
      .select("id, dining_table_id, status")
      .eq("merchant_id", ctx.merchantId)
      .eq("branch_id", input.branchId)
      .in("status", ["called", "seated"])
      .not("dining_table_id", "is", null);

    for (const row of seated ?? []) {
      if (input.ignoreQueueEntryId && row.id === input.ignoreQueueEntryId) continue;
      if (row.dining_table_id) occupied.add(row.dining_table_id);
    }

    if (input.date && input.time) {
      const turn = input.turnMinutes ?? DEFAULT_TABLE_TURN_MINUTES;
      const startMin = addMinutesToTime(input.time, 0);
      const endMin = startMin + turn;

      const { data: bookings } = await admin
        .from("reservations")
        .select("id, dining_table_id, reservation_time, status")
        .eq("merchant_id", ctx.merchantId)
        .eq("branch_id", input.branchId)
        .eq("reservation_date", input.date)
        .eq("status", "confirmed")
        .not("dining_table_id", "is", null);

      for (const row of bookings ?? []) {
        if (input.ignoreReservationId && row.id === input.ignoreReservationId) continue;
        if (!row.dining_table_id) continue;
        const otherStart = addMinutesToTime(
          formatTimeForInput(row.reservation_time),
          0,
        );
        const otherEnd = otherStart + turn;
        if (timesOverlap(startMin, endMin, otherStart, otherEnd)) {
          occupied.add(row.dining_table_id);
        }
      }
    }

    return { ok: true, occupiedIds: [...occupied] };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not check tables.",
      occupiedIds: [],
    };
  }
}

export async function suggestTableForParty(input: {
  branchId: string;
  partySize: number;
  date?: string | null;
  time?: string | null;
  ignoreReservationId?: string | null;
  ignoreQueueEntryId?: string | null;
}): Promise<{
  ok: boolean;
  error?: string;
  table: DiningTable | null;
  tables: DiningTable[];
  occupiedIds: string[];
}> {
  const empty = {
    table: null as DiningTable | null,
    tables: [] as DiningTable[],
    occupiedIds: [] as string[],
  };
  const listed = await listBranchDiningTables({ branchId: input.branchId });
  if (!listed.ok) return { ok: false, error: listed.error, ...empty };

  const occupied = await findOccupiedTableIds({
    branchId: input.branchId,
    date: input.date,
    time: input.time,
    ignoreReservationId: input.ignoreReservationId,
    ignoreQueueEntryId: input.ignoreQueueEntryId,
  });
  if (!occupied.ok) return { ok: false, error: occupied.error, ...empty };

  const occupiedSet = new Set(occupied.occupiedIds);
  const table = pickBestTable(listed.tables, input.partySize, occupiedSet);
  return {
    ok: true,
    table,
    tables: listed.tables,
    occupiedIds: occupied.occupiedIds,
  };
}

export async function assignReservationTable(input: {
  reservationId: string;
  tableId: string | null;
}): Promise<{ ok: boolean; error?: string; tableNumber?: number | null }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const admin = createAdminClient();
    const { data: reservation } = await admin
      .from("reservations")
      .select(
        "id, branch_id, party_size, reservation_date, reservation_time, status, dining_table_id",
      )
      .eq("id", input.reservationId)
      .eq("merchant_id", ctx.merchantId)
      .maybeSingle();
    if (!reservation) return { ok: false, error: "Reservation not found." };

    if (!input.tableId) {
      const { error } = await admin
        .from("reservations")
        .update({ dining_table_id: null, table_number: null })
        .eq("id", reservation.id)
        .eq("merchant_id", ctx.merchantId);
      if (error) return { ok: false, error: error.message };
      return { ok: true, tableNumber: null };
    }

    const { data: table } = await admin
      .from("dining_tables")
      .select("id, branch_id, table_number, seats, status")
      .eq("id", input.tableId)
      .eq("merchant_id", ctx.merchantId)
      .maybeSingle();
    if (!table || table.status !== "active") {
      return { ok: false, error: "Table not found." };
    }
    if (reservation.branch_id && table.branch_id !== reservation.branch_id) {
      return { ok: false, error: "Table belongs to another branch." };
    }
    if (table.seats < reservation.party_size) {
      return { ok: false, error: "That table is too small for this party." };
    }

    if (reservation.branch_id) {
      const occupied = await findOccupiedTableIds({
        branchId: reservation.branch_id,
        date: reservation.reservation_date,
        time: formatTimeForInput(reservation.reservation_time),
        ignoreReservationId: reservation.id,
      });
      if (occupied.occupiedIds.includes(table.id)) {
        return { ok: false, error: "That table is already booked for this time." };
      }
    }

    const { error } = await admin
      .from("reservations")
      .update({
        dining_table_id: table.id,
        table_number: table.table_number,
      })
      .eq("id", reservation.id)
      .eq("merchant_id", ctx.merchantId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, tableNumber: table.table_number };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not assign table.",
    };
  }
}

export async function autoAssignTableForReservation(input: {
  reservationId: string;
}): Promise<{ ok: boolean; error?: string; tableNumber?: number | null }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const admin = createAdminClient();
    const { data: reservation } = await admin
      .from("reservations")
      .select(
        "id, branch_id, party_size, reservation_date, reservation_time, dining_table_id",
      )
      .eq("id", input.reservationId)
      .eq("merchant_id", ctx.merchantId)
      .maybeSingle();
    if (!reservation) return { ok: false, error: "Reservation not found." };
    if (!reservation.branch_id) {
      return { ok: false, error: "Reservation has no branch." };
    }
    if (reservation.dining_table_id) {
      const { data: existing } = await admin
        .from("dining_tables")
        .select("table_number")
        .eq("id", reservation.dining_table_id)
        .maybeSingle();
      return { ok: true, tableNumber: existing?.table_number ?? null };
    }

    const suggestion = await suggestTableForParty({
      branchId: reservation.branch_id,
      partySize: reservation.party_size,
      date: reservation.reservation_date,
      time: formatTimeForInput(reservation.reservation_time),
      ignoreReservationId: reservation.id,
    });
    if (!suggestion.ok) return { ok: false, error: suggestion.error };
    if (!suggestion.table) {
      return { ok: false, error: "No free table fits this party." };
    }

    return assignReservationTable({
      reservationId: reservation.id,
      tableId: suggestion.table.id,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not auto-assign.",
    };
  }
}

/** Onboarding helper — write numbered tables onto the merchant's default branch. */
export async function saveMainBranchDiningTables(input: {
  tables: Array<{ number: number; seats: number }>;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireMerchantContext();
    if (!ctx.ok) return { ok: false, error: ctx.error };

    const admin = createAdminClient();
    const { data: branch } = await admin
      .from("branches")
      .select("id")
      .eq("merchant_id", ctx.merchantId)
      .eq("is_default", true)
      .maybeSingle();
    if (!branch) return { ok: false, error: "Main branch not found." };

    return saveBranchDiningTables({ branchId: branch.id, tables: input.tables });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save tables.",
    };
  }
}

/** @deprecated Prefer {@link saveMainBranchDiningTables} when numbers are set. */
export async function saveMainBranchTableLayout(input: {
  layout: TableLayoutRow[];
}): Promise<{ ok: boolean; error?: string }> {
  return saveMainBranchDiningTables({
    tables: expandLayoutToTables(input.layout),
  });
}
