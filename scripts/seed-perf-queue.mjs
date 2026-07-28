#!/usr/bin/env node
/**
 * Seed a live queue board for the perf merchant (does NOT wipe loyalty data).
 *
 * Usage (from froq/):
 *   node --env-file=.env.local scripts/seed-perf-queue.mjs
 *
 * Fixed IDs (same as seed-perf-merchant.mjs):
 *   merchant  a1111111-1111-4111-a111-111111111111
 *   branch    b2222222-2222-4222-a222-222222222222
 *
 * Creates:
 *   1 live queue_sessions row
 *   200 waiting + 2 called + 5 seated + 5 left entries
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const MERCHANT_ID = "a1111111-1111-4111-a111-111111111111";
const BRANCH_ID = "b2222222-2222-4222-a222-222222222222";

const WAITING = 200;
const CALLED = 2;
const SEATED = 5;
const LEFT = 5;
const BATCH = 100;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0x9e3779b9);

async function insertBatches(table, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await admin.from(table).insert(chunk);
    if (error) throw new Error(`${table} insert @${i}: ${error.message}`);
    process.stdout.write(`  ${table}: ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write("\n");
}

async function main() {
  const { data: merchant, error: mErr } = await admin
    .from("merchants")
    .select("id")
    .eq("id", MERCHANT_ID)
    .maybeSingle();
  if (mErr || !merchant) {
    throw new Error("Perf merchant missing — run scripts/seed-perf-merchant.mjs first");
  }

  // Queue UI requires an active queue product entitlement.
  const { error: prodErr } = await admin.from("merchant_products").upsert(
    {
      merchant_id: MERCHANT_ID,
      product: "queue",
      plan_id: "growth",
      status: "active",
      onboarded_at: new Date().toISOString(),
      purchased_at: new Date().toISOString(),
    },
    { onConflict: "merchant_id,product" },
  );
  if (prodErr) throw new Error(`merchant_products queue: ${prodErr.message}`);

  console.log("Closing any open queue sessions for seed merchant/branch…");
  const { data: openSessions } = await admin
    .from("queue_sessions")
    .select("id")
    .eq("merchant_id", MERCHANT_ID)
    .eq("branch_id", BRANCH_ID)
    .in("status", ["live", "paused"]);
  for (const s of openSessions ?? []) {
    await admin
      .from("queue_sessions")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", s.id);
  }

  const { data: last } = await admin
    .from("queue_sessions")
    .select("number")
    .eq("merchant_id", MERCHANT_ID)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const number = Math.max(0, Number(last?.number) || 0) + 1;

  const { data: session, error: sErr } = await admin
    .from("queue_sessions")
    .insert({
      merchant_id: MERCHANT_ID,
      branch_id: BRANCH_ID,
      number,
      status: "live",
      started_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    })
    .select("id, number")
    .single();
  if (sErr || !session) throw new Error(`queue_sessions: ${sErr?.message ?? "no row"}`);
  console.log(`Live session #${session.number} (${session.id})`);

  const now = Date.now();
  const twoHours = 2 * 60 * 60 * 1000;
  const entries = [];

  // Waiting: joined_at spread over last ~2 hours (oldest first).
  for (let i = 0; i < WAITING; i += 1) {
    const ageMs = Math.floor(((i + 1) / (WAITING + 1)) * twoHours + rng() * 20_000);
    entries.push({
      id: randomUUID(),
      merchant_id: MERCHANT_ID,
      session_id: session.id,
      branch_id: BRANCH_ID,
      name: `Wait Guest ${String(i + 1).padStart(3, "0")}`,
      phone: `98${String(10000000 + i).slice(-8)}`,
      party_size: 1 + Math.floor(rng() * 6),
      kind: "walkin",
      status: "waiting",
      joined_at: new Date(now - ageMs).toISOString(),
    });
  }

  // Called: recent join, called a few minutes ago (activates 1s tick).
  for (let i = 0; i < CALLED; i += 1) {
    const calledAt = now - (3 + i) * 60_000 - Math.floor(rng() * 20_000);
    const joinedAt = calledAt - (10 + Math.floor(rng() * 20)) * 60_000;
    entries.push({
      id: randomUUID(),
      merchant_id: MERCHANT_ID,
      session_id: session.id,
      branch_id: BRANCH_ID,
      name: `Called Guest ${i + 1}`,
      phone: `97${String(20000000 + i).slice(-8)}`,
      party_size: 2 + i,
      kind: "walkin",
      status: "called",
      joined_at: new Date(joinedAt).toISOString(),
      called_at: new Date(calledAt).toISOString(),
      accept_by: new Date(calledAt + 10 * 60_000).toISOString(),
    });
  }

  for (let i = 0; i < SEATED; i += 1) {
    const seatedAt = now - (30 + i * 5) * 60_000;
    const joinedAt = seatedAt - (15 + Math.floor(rng() * 25)) * 60_000;
    entries.push({
      id: randomUUID(),
      merchant_id: MERCHANT_ID,
      session_id: session.id,
      branch_id: BRANCH_ID,
      name: `Seated Guest ${i + 1}`,
      phone: `96${String(30000000 + i).slice(-8)}`,
      party_size: 2,
      kind: "walkin",
      status: "seated",
      joined_at: new Date(joinedAt).toISOString(),
      called_at: new Date(seatedAt - 5 * 60_000).toISOString(),
      seated_at: new Date(seatedAt).toISOString(),
    });
  }

  for (let i = 0; i < LEFT; i += 1) {
    const leftAt = now - (40 + i * 5) * 60_000;
    const joinedAt = leftAt - (10 + Math.floor(rng() * 30)) * 60_000;
    entries.push({
      id: randomUUID(),
      merchant_id: MERCHANT_ID,
      session_id: session.id,
      branch_id: BRANCH_ID,
      name: `Left Guest ${i + 1}`,
      phone: `95${String(40000000 + i).slice(-8)}`,
      party_size: 3,
      kind: "walkin",
      status: "left",
      joined_at: new Date(joinedAt).toISOString(),
      left_at: new Date(leftAt).toISOString(),
    });
  }

  console.log(
    `Inserting ${entries.length} entries (${WAITING} waiting, ${CALLED} called, ${SEATED} seated, ${LEFT} left)…`,
  );
  await insertBatches("queue_entries", entries);

  const { count } = await admin
    .from("queue_entries")
    .select("*", { count: "exact", head: true })
    .eq("session_id", session.id);

  console.log("Done.");
  console.log(`  session: #${session.number} live`);
  console.log(`  entries in session: ${count}`);
  console.log("Open /merchant/queue with the perf seed merchant to profile.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
