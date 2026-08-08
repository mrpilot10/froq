import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveJoinBranchId } from "@/lib/queue/live-board";
import { MENU_LANG_CODES } from "@/lib/menu/languages";

/**
 * Guest activity on the AI menu.
 *
 * The menu is a public slug with no login, so every write here arrives from an
 * anonymous caller and none of it can be trusted on the way in. Names, ids and
 * languages are all resolved against the merchant's own catalogue before they
 * reach the table — an event that doesn't match a real dish is stored without
 * an id rather than rejected, so a renamed dish mid-visit still counts.
 *
 * Recording is always best-effort. A guest looking at a menu must never see a
 * slower page or a failed action because analytics had a bad day, so every
 * function here swallows its errors and returns.
 */

/** The actions worth reporting on. Anything else is dropped at the door. */
export const MENU_EVENTS = [
  "menu_opened",
  "dish_viewed",
  "chat_asked",
  "chat_answered",
  "cart_add",
  "cart_remove",
  "rec_added",
  "offer_viewed",
  "insights_viewed",
  "lang_changed",
] as const;

export type MenuEventName = (typeof MENU_EVENTS)[number];

const EVENT_SET = new Set<string>(MENU_EVENTS);

/** One beacon carries a visit's worth of actions, not a whole session. */
const MAX_BATCH = 20;

/** Long enough for a real question, short enough that nobody pastes an essay. */
const DETAIL_MAX = 300;
const NAME_MAX = 120;

export interface MenuEventInput {
  event: MenuEventName;
  /** English dish name — resolved to a menu_items id when one matches. */
  itemName?: string | null;
  lang?: string | null;
  detail?: string | null;
  sessionKey?: string | null;
}

function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/**
 * Session keys are minted by the page and never read back, so the only thing
 * that matters is that a hostile one can't smuggle anything into the column.
 */
function cleanSessionKey(value: unknown): string | null {
  const raw = clean(value, 40);
  if (!raw) return null;
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "");
  return safe.length >= 6 ? safe : null;
}

function cleanLang(value: unknown): string | null {
  const raw = clean(value, 4);
  if (!raw) return null;
  const upper = raw.toUpperCase();
  return (MENU_LANG_CODES as readonly string[]).includes(upper) ? upper : null;
}

/**
 * Reads a beacon body into events we are willing to store. Unknown event names,
 * oversized batches and junk fields are dropped rather than failing the request:
 * a stale page from a previous deploy should degrade, not error.
 */
export function readMenuEvents(raw: unknown): MenuEventInput[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuEventInput[] = [];
  for (const entry of raw.slice(0, MAX_BATCH)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.event === "string" ? row.event : "";
    if (!EVENT_SET.has(name)) continue;
    out.push({
      event: name as MenuEventName,
      itemName: clean(row.itemName, NAME_MAX),
      lang: cleanLang(row.lang),
      detail: clean(row.detail, DETAIL_MAX),
      sessionKey: cleanSessionKey(row.sessionKey),
    });
  }
  return out;
}

export interface MenuEventTarget {
  merchantId: string;
  branchId: string | null;
}

/**
 * Slug to tenant, without paying for a whole menu page.
 *
 * The beacon fires on every scan, so it deliberately does not call
 * resolveMenuPage() — that reads the catalogue, offers, products and order
 * history to render a page nobody is rendering here.
 */
export async function resolveMenuEventTarget(
  slug: string,
  branchSlug: string | null,
): Promise<MenuEventTarget | null> {
  const raw = slug.trim();
  if (!raw) return null;
  try {
    const admin = createAdminClient();
    const { data: merchant } = await admin
      .from("merchants")
      .select("id")
      .eq("slug", raw)
      .maybeSingle();
    if (!merchant?.id) return null;
    const branchId = await resolveJoinBranchId(merchant.id, branchSlug);
    return { merchantId: merchant.id, branchId: branchId ?? null };
  } catch {
    return null;
  }
}

/**
 * Dish name to menu_items id for the rows that name one.
 *
 * Doubles as validation: a name that matches nothing on this merchant's menu
 * still gets stored (the merchant may have just deleted the dish) but without
 * an id, so it can never point at another tenant's row.
 */
async function resolveItemIds(
  admin: ReturnType<typeof createAdminClient>,
  merchantId: string,
  names: string[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  if (!names.length) return ids;
  const { data } = await admin
    .from("menu_items")
    .select("id, name")
    .eq("merchant_id", merchantId)
    .in("name", names);
  for (const row of data ?? []) {
    const name = typeof row.name === "string" ? row.name : "";
    if (name) ids.set(name.toLowerCase(), row.id as string);
  }
  return ids;
}

/** Writes a batch of guest actions. Never throws — analytics is not the product. */
export async function recordMenuEvents(
  target: MenuEventTarget,
  events: MenuEventInput[],
): Promise<void> {
  if (!events.length) return;
  try {
    const admin = createAdminClient();
    const names = [
      ...new Set(events.map((event) => event.itemName).filter((name): name is string => !!name)),
    ];
    const ids = await resolveItemIds(admin, target.merchantId, names);

    await admin.from("menu_events").insert(
      events.map((event) => ({
        merchant_id: target.merchantId,
        branch_id: target.branchId,
        event: event.event,
        item_id: event.itemName ? (ids.get(event.itemName.toLowerCase()) ?? null) : null,
        item_name: event.itemName ?? null,
        lang: event.lang ?? null,
        detail: event.detail ?? null,
        session_key: event.sessionKey ?? null,
      })),
    );
  } catch (error) {
    console.error("menu event write failed", error);
  }
}
