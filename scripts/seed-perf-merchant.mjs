#!/usr/bin/env node
/**
 * Seed a synthetic merchant for performance testing.
 *
 * Re-runnable / idempotent for THIS merchant only — deletes the fixed
 * merchant_id (cascade) and its owner auth user, then recreates. Does not
 * touch other merchants.
 *
 * Usage (from froq/):
 *   node --env-file=.env.local scripts/seed-perf-merchant.mjs
 *
 * Fixed IDs:
 *   merchant  a1111111-1111-4111-a111-111111111111
 *   branch    b2222222-2222-4222-a222-222222222222
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const MERCHANT_ID = "a1111111-1111-4111-a111-111111111111";
const BRANCH_ID = "b2222222-2222-4222-a222-222222222222";
const OWNER_EMAIL = "perf-seed-merchant@froq.local";
const SLUG = "perf-seed-cafe";

const CUSTOMER_COUNT = 2000;
const VISIT_COUNT = 40_000;
const REDEMPTION_COUNT = 3000;
const TOTAL_STAMPS = 8;
const BATCH = 500;

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

const rng = mulberry32(0x0f0fcafe);

function pick(arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Weighted visit timestamp over ~18 months, weekday evenings heavier (IST-ish). */
function randomVisitAt(nowMs) {
  const daysBack = Math.floor(rng() * 548); // ~18 months
  const day = new Date(nowMs - daysBack * 86_400_000);
  // Prefer weekdays: resample weekend 60% of the time
  let dow = day.getUTCDay();
  if ((dow === 0 || dow === 6) && rng() < 0.6) {
    day.setUTCDate(day.getUTCDate() - (dow === 0 ? 2 : 1));
    dow = day.getUTCDay();
  }
  // Hour weights (UTC+5:30 ≈ evening 17–21 local → ~11:30–15:30 UTC; use local-ish via IST offset)
  // Generate in IST by using UTC hours shifted: IST = UTC+5:30.
  const hourWeights = [
    // 0–23 IST
    1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 7, 10, 14, 18, 20, 16, 10, 5, 2,
  ];
  const totalW = hourWeights.reduce((a, b) => a + b, 0);
  let roll = rng() * totalW;
  let hour = 0;
  for (; hour < 24; hour += 1) {
    roll -= hourWeights[hour];
    if (roll <= 0) break;
  }
  const minute = Math.floor(rng() * 60);
  const second = Math.floor(rng() * 60);
  // Interpret hour as IST → convert to UTC for timestamptz storage
  const istAsUtc = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    hour,
    minute,
    second,
  );
  return new Date(istAsUtc - (5.5 * 60 * 60 * 1000)).toISOString();
}

async function insertBatches(table, rows) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await admin.from(table).insert(chunk);
    if (error) throw new Error(`${table} insert failed @${i}: ${error.message}`);
    process.stdout.write(`  ${table}: ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log("Seeding perf merchant", MERCHANT_ID);

  // ── Tear down previous seed (this merchant only) ──────────────────────────
  const { data: existing } = await admin
    .from("merchants")
    .select("id, owner_user_id")
    .eq("id", MERCHANT_ID)
    .maybeSingle();

  // Always clear this merchant id (and any orphaned children) before recreate.
  console.log("Deleting previous seed merchant (cascade)…");
  {
    const { error } = await admin.from("merchants").delete().eq("id", MERCHANT_ID);
    if (error) throw new Error(`delete merchant: ${error.message}`);
  }
  // Belt-and-suspenders if cascade was ever incomplete on a prior failed run.
  await admin.from("customers").delete().eq("merchant_id", MERCHANT_ID);

  // Remove prior owner auth user by email (ignore if missing)
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const prior = listed.data?.users?.find((u) => u.email === OWNER_EMAIL);
  if (prior) {
    await admin.auth.admin.deleteUser(prior.id);
  }
  if (existing?.owner_user_id && existing.owner_user_id !== prior?.id) {
    try {
      await admin.auth.admin.deleteUser(existing.owner_user_id);
    } catch {
      /* ignore */
    }
  }

  // ── Owner auth user ───────────────────────────────────────────────────────
  const password = `PerfSeed-${randomUUID().slice(0, 8)}!`;
  const created = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Perf Seed Owner" },
    app_metadata: { merchant_onboarding: true, onboarding_product: "loyalty" },
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser: ${created.error?.message ?? "no user"}`);
  }
  const ownerId = created.data.user.id;
  console.log("Owner user:", ownerId, `(${OWNER_EMAIL} / ${password})`);

  // ── Merchant + branch + membership + product ──────────────────────────────
  const { error: mErr } = await admin.from("merchants").insert({
    id: MERCHANT_ID,
    owner_user_id: ownerId,
    business_name: "Perf Seed Cafe",
    short_name: "Perf Seed Cafe",
    slug: SLUG,
    email: OWNER_EMAIL,
    brand_color: "#2b6f5c",
    reward_title: "Free coffee",
    reward_name: "Free coffee",
    total_stamps: TOTAL_STAMPS,
    avg_order_value: 220,
  });
  if (mErr) throw new Error(`merchants: ${mErr.message}`);

  const { error: bErr } = await admin.from("branches").insert({
    id: BRANCH_ID,
    merchant_id: MERCHANT_ID,
    name: "Main branch",
    slug: `${SLUG}-main`,
    is_default: true,
  });
  if (bErr) throw new Error(`branches: ${bErr.message}`);

  const { error: mmErr } = await admin.from("merchant_members").insert({
    merchant_id: MERCHANT_ID,
    user_id: ownerId,
    role: "owner",
    name: "Perf Seed Owner",
    email: OWNER_EMAIL,
    accepted_at: new Date().toISOString(),
    branch_ids: [],
  });
  if (mmErr) throw new Error(`merchant_members: ${mmErr.message}`);

  const { error: pErr } = await admin.from("merchant_products").insert({
    merchant_id: MERCHANT_ID,
    product: "loyalty",
    plan_id: "growth",
    status: "active",
    onboarded_at: new Date().toISOString(),
    purchased_at: new Date().toISOString(),
  });
  if (pErr) throw new Error(`merchant_products: ${pErr.message}`);

  // ── Customers + loyalty cards ─────────────────────────────────────────────
  console.log(`Creating ${CUSTOMER_COUNT} customers…`);
  const customerIds = [];
  const customerRows = [];
  const cardRows = [];
  for (let i = 0; i < CUSTOMER_COUNT; i += 1) {
    const id = randomUUID();
    customerIds.push(id);
    const stamps = Math.floor(rng() * TOTAL_STAMPS);
    const status =
      stamps >= TOTAL_STAMPS - 1 && rng() < 0.15
        ? "reward_ready"
        : "active";
    customerRows.push({
      id,
      merchant_id: MERCHANT_ID,
      branch_id: BRANCH_ID,
      name: `Customer ${String(i + 1).padStart(4, "0")}`,
      phone: `9${String(i).padStart(9, "0")}`,
      email: `c${i}@perf-seed.invalid`,
      banned: false,
      member_since: new Date(Date.now() - Math.floor(rng() * 548) * 86_400_000).toISOString(),
    });
    cardRows.push({
      customer_id: id,
      merchant_id: MERCHANT_ID,
      branch_id: BRANCH_ID,
      stamps: status === "reward_ready" ? TOTAL_STAMPS : stamps,
      status,
    });
  }
  await insertBatches("customers", customerRows);
  await insertBatches("loyalty_cards", cardRows);

  // ── Visits ────────────────────────────────────────────────────────────────
  console.log(`Creating ${VISIT_COUNT} visits…`);
  const now = Date.now();
  const visitRows = [];
  for (let i = 0; i < VISIT_COUNT; i += 1) {
    visitRows.push({
      customer_id: pick(customerIds),
      merchant_id: MERCHANT_ID,
      branch_id: BRANCH_ID,
      amount: 150 + Math.floor(rng() * 400),
      created_at: randomVisitAt(now),
    });
  }
  await insertBatches("visits", visitRows);

  // ── Redemptions ───────────────────────────────────────────────────────────
  console.log(`Creating ${REDEMPTION_COUNT} redemptions…`);
  const redemptionRows = [];
  const used = new Set();
  for (let i = 0; i < REDEMPTION_COUNT; i += 1) {
    let code = `PERF-${i.toString(36).toUpperCase()}-${Math.floor(rng() * 1e6).toString(36).toUpperCase()}`;
    while (used.has(code)) {
      code = `PERF-${i}-${randomUUID().slice(0, 6).toUpperCase()}`;
    }
    used.add(code);
    redemptionRows.push({
      merchant_id: MERCHANT_ID,
      branch_id: BRANCH_ID,
      customer_id: pick(customerIds),
      code,
      redeemed_at: randomVisitAt(now),
    });
  }
  await insertBatches("redemptions", redemptionRows);

  console.log("\nDone.");
  console.log("  merchant_id:", MERCHANT_ID);
  console.log("  branch_id:  ", BRANCH_ID);
  console.log("  slug:       ", SLUG);
  console.log("  login:      ", OWNER_EMAIL, "/", password);
  console.log("Delete later: delete from merchants where id = '" + MERCHANT_ID + "';");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
