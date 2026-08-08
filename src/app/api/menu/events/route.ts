import { readMenuEvents, recordMenuEvents, resolveMenuEventTarget } from "@/lib/menu/events";
import { callerKey, EVENTS_LIMIT, throttle } from "@/lib/menu/guest-throttle";

/**
 * Analytics beacon for the guest menu.
 *
 * The page batches what a guest did and posts it here, usually through
 * navigator.sendBeacon on the way out. Nothing about the caller is trusted:
 * the slug picks the tenant, the dish names are matched against that tenant's
 * own catalogue, and anything unrecognised is dropped.
 *
 * Always answers 204, including for junk. A beacon has no UI behind it, so
 * there is no one to tell about a bad request — and reporting back which
 * payloads were rejected would only help someone probing the endpoint.
 */

export const runtime = "nodejs";

function noContent() {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  // sendBeacon posts a Blob, so the content type is whatever the page set —
  // read the body as text and parse it here rather than trusting the header.
  let payload: unknown;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return noContent();
  }

  const body = (payload ?? {}) as { slug?: unknown; branch?: unknown; events?: unknown };
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const branch = typeof body.branch === "string" && body.branch ? body.branch : null;
  if (!slug) return noContent();

  const events = readMenuEvents(body.events);
  if (!events.length) return noContent();

  if (!throttle(callerKey(request, "menu-events"), EVENTS_LIMIT).ok) return noContent();

  const target = await resolveMenuEventTarget(slug, branch);
  if (!target) return noContent();

  await recordMenuEvents(target, events);
  return noContent();
}
