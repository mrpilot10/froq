#!/usr/bin/env node
/**
 * Occupy some of a branch's tables so the table picker can be checked with
 * every tile state on screen at once: free, suggested, in use, booked, and
 * too small.
 *
 * Usage (from froq/):
 *   node --env-file=.env.local scripts/seed-table-occupancy.mjs
 *   node --env-file=.env.local scripts/seed-table-occupancy.mjs --branch=<uuid>
 *   node --env-file=.env.local scripts/seed-table-occupancy.mjs --time=19:30
 *   node --env-file=.env.local scripts/seed-table-occupancy.mjs --clean
 *
 * With no --branch it picks the branch that currently has a live queue session,
 * which is the one you'd be looking at.
 *
 * Everything it writes is named "Seed …" so --clean can find it again.
 */

import { createClient } from "@supabase/supabase-js";

const SEED_PREFIX = "Seed";
/** Enough tiles to show a mix of states, with one too small for most parties. */
const MIN_TABLES = 6;
const SEED_SEATS = [2, 4, 4, 6, 8, 8];

const args = new Map(
  process.argv.slice(2).map((raw) => {
    const [key, value] = raw.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Next half hour, so the slot is plausible against today's opening hours. */
function nextHalfHour() {
  const now = new Date();
  now.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

async function resolveBranch() {
  if (typeof args.get("branch") === "string") {
    const { data } = await admin
      .from("branches")
      .select("id, name, merchant_id")
      .eq("id", args.get("branch"))
      .maybeSingle();
    if (!data) throw new Error(`No branch ${args.get("branch")}`);
    return data;
  }

  const { data: sessions } = await admin
    .from("queue_sessions")
    .select("branch_id")
    .in("status", ["live", "paused"])
    .not("branch_id", "is", null);

  const branchIds = [...new Set((sessions ?? []).map((s) => s.branch_id))];
  if (branchIds.length === 1) {
    const { data } = await admin
      .from("branches")
      .select("id, name, merchant_id")
      .eq("id", branchIds[0])
      .maybeSingle();
    if (data) return data;
  }

  const { data: branches } = await admin
    .from("branches")
    .select("id, name, merchants (business_name)")
    .order("created_at", { ascending: false })
    .limit(20);

  console.error(
    branchIds.length > 1
      ? "Several branches have a live queue. Pass one with --branch=<uuid>:"
      : "No live queue session found. Pass a branch with --branch=<uuid>:",
  );
  for (const b of branches ?? []) {
    console.error(`  ${b.id}  ${b.merchants?.business_name ?? "?"} — ${b.name}`);
  }
  process.exit(1);
}

async function clean(branch) {
  const { data: entries } = await admin
    .from("queue_entries")
    .select("id")
    .eq("branch_id", branch.id)
    .like("name", `${SEED_PREFIX} %`);
  if (entries?.length) {
    await admin
      .from("queue_entries")
      .delete()
      .in("id", entries.map((e) => e.id));
  }

  const { data: bookings } = await admin
    .from("reservations")
    .select("id")
    .eq("branch_id", branch.id)
    .like("customer_name", `${SEED_PREFIX} %`);
  if (bookings?.length) {
    await admin
      .from("reservations")
      .delete()
      .in("id", bookings.map((b) => b.id));
  }

  console.log(
    `Removed ${entries?.length ?? 0} seeded queue entries and ${
      bookings?.length ?? 0
    } seeded bookings from ${branch.name}.`,
  );
  console.log("Seeded tables were left in place — delete them in Settings.");
}

async function ensureTables(branch) {
  const { data: existing } = await admin
    .from("dining_tables")
    .select("id, table_number, seats, status")
    .eq("branch_id", branch.id)
    .eq("status", "active")
    .order("table_number", { ascending: true });

  const tables = existing ?? [];
  if (tables.length >= MIN_TABLES) return tables;

  const maxNumber = tables.reduce((n, t) => Math.max(n, t.table_number), 0);
  const additions = [];
  for (let i = tables.length; i < MIN_TABLES; i += 1) {
    additions.push({
      merchant_id: branch.merchant_id,
      branch_id: branch.id,
      table_number: maxNumber + additions.length + 1,
      // Indexed by what we're adding, not by the branch's total, so the small
      // table always gets created however many tables already exist.
      seats: SEED_SEATS[additions.length % SEED_SEATS.length],
      sort_order: i,
      status: "active",
    });
  }

  const { data: inserted, error } = await admin
    .from("dining_tables")
    .insert(additions)
    .select("id, table_number, seats, status");
  if (error) throw new Error(`dining_tables: ${error.message}`);

  console.log(`Added ${inserted.length} tables to reach ${MIN_TABLES}.`);
  return [...tables, ...inserted].sort((a, b) => a.table_number - b.table_number);
}

/** "Too small" needs a table that a normal party won't fit on. */
async function ensureSmallTable(branch, tables) {
  if (tables.some((t) => t.seats <= 2)) return tables;

  const target = tables[tables.length - 1];
  const { error } = await admin
    .from("dining_tables")
    .update({ seats: 2 })
    .eq("id", target.id);
  if (error) throw new Error(`dining_tables seats: ${error.message}`);

  console.log(`Shrank Table ${target.table_number} to 2 seats.`);
  return tables.map((t) => (t.id === target.id ? { ...t, seats: 2 } : t));
}

async function ensureLiveSession(branch) {
  const { data: open } = await admin
    .from("queue_sessions")
    .select("id, number")
    .eq("branch_id", branch.id)
    .in("status", ["live", "paused"])
    .limit(1)
    .maybeSingle();
  if (open) return open;

  const { data: last } = await admin
    .from("queue_sessions")
    .select("number")
    .eq("merchant_id", branch.merchant_id)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: session, error } = await admin
    .from("queue_sessions")
    .insert({
      merchant_id: branch.merchant_id,
      branch_id: branch.id,
      number: Math.max(0, Number(last?.number) || 0) + 1,
      status: "live",
      started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    .select("id, number")
    .single();
  if (error) throw new Error(`queue_sessions: ${error.message}`);

  console.log(`Opened queue session #${session.number}.`);
  return session;
}

async function main() {
  const branch = await resolveBranch();
  console.log(`Branch: ${branch.name} (${branch.id})`);

  if (args.has("clean")) {
    await clean(branch);
    return;
  }

  let tables = await ensureTables(branch);
  if (tables.length < 3) {
    throw new Error("Need at least 3 tables to demonstrate occupancy.");
  }
  tables = await ensureSmallTable(branch, tables);

  const session = await ensureLiveSession(branch);
  const now = Date.now();
  const date = todayIso();
  const time =
    typeof args.get("time") === "string" ? args.get("time") : nextHalfHour();

  // A seated and a called guest each hold a table on the queue board, which is
  // what the call / seat pickers read.
  const seatedTable = tables[0];
  const calledTable = tables[1];
  const calledAt = now - 4 * 60_000;

  const { error: entryError } = await admin.from("queue_entries").insert([
    {
      merchant_id: branch.merchant_id,
      session_id: session.id,
      branch_id: branch.id,
      name: `${SEED_PREFIX} Seated Guest`,
      phone: "9800000001",
      party_size: 2,
      kind: "walkin",
      status: "seated",
      dining_table_id: seatedTable.id,
      table_number: seatedTable.table_number,
      joined_at: new Date(now - 50 * 60_000).toISOString(),
      called_at: new Date(now - 35 * 60_000).toISOString(),
      seated_at: new Date(now - 30 * 60_000).toISOString(),
    },
    {
      merchant_id: branch.merchant_id,
      session_id: session.id,
      branch_id: branch.id,
      name: `${SEED_PREFIX} Called Guest`,
      phone: "9800000002",
      party_size: 2,
      kind: "walkin",
      status: "called",
      dining_table_id: calledTable.id,
      table_number: calledTable.table_number,
      joined_at: new Date(now - 20 * 60_000).toISOString(),
      called_at: new Date(calledAt).toISOString(),
      accept_by: new Date(calledAt + 10 * 60_000).toISOString(),
    },
  ]);
  if (entryError) throw new Error(`queue_entries: ${entryError.message}`);

  // A confirmed booking holds a table for its slot. The pending one beside it
  // is what you open to see that table come back as "Booked".
  const bookedTable = tables[2];
  const { error: bookingError } = await admin.from("reservations").insert([
    {
      merchant_id: branch.merchant_id,
      branch_id: branch.id,
      customer_name: `${SEED_PREFIX} Booked Guest`,
      customer_phone: "9800000003",
      party_size: 2,
      reservation_date: date,
      reservation_time: time,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      dining_table_id: bookedTable.id,
      table_number: bookedTable.table_number,
    },
    {
      merchant_id: branch.merchant_id,
      branch_id: branch.id,
      customer_name: `${SEED_PREFIX} Pending Guest`,
      customer_phone: "9800000004",
      party_size: 2,
      reservation_date: date,
      reservation_time: time,
      status: "pending",
    },
  ]);
  if (bookingError) throw new Error(`reservations: ${bookingError.message}`);

  console.log("\nOccupied:");
  console.log(
    `  Table ${seatedTable.table_number} (${seatedTable.seats} seats) — seated guest, shows "In use"`,
  );
  console.log(
    `  Table ${calledTable.table_number} (${calledTable.seats} seats) — called guest, shows "In use"`,
  );
  console.log(
    `  Table ${bookedTable.table_number} (${bookedTable.seats} seats) — confirmed ${date} ${time}, shows "Booked"`,
  );
  console.log(
    `  Free: ${tables
      .slice(3)
      .map((t) => `Table ${t.table_number} (${t.seats} seats)`)
      .join(", ")}`,
  );

  console.log("\nCheck it:");
  console.log("  Queue → call a waiting guest → two tiles read In use.");
  console.log(
    `  Reservations → open "${SEED_PREFIX} Pending Guest" → Table → one tile reads Booked.`,
  );
  console.log(
    "  Any party of 3+ → the 2-seat table reads Too small.",
  );
  console.log("\nUndo with: --clean");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
