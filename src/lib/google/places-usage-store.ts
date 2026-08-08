import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  costUsdForPlacesKind,
  type GooglePlacesKind,
} from "@/lib/google/places-pricing";

/**
 * Best-effort Places usage insert. Never throws — metering must not break search.
 */
export async function persistGooglePlacesUsage(event: {
  kind: GooglePlacesKind;
  path: "worker" | "direct";
  status: "ok" | "failed";
  merchantId?: string | null;
  queryChars?: number | null;
  resultCount?: number | null;
  httpStatus?: number | null;
  errorCode?: string | null;
}): Promise<void> {
  try {
    const costUsd =
      event.status === "ok" ? costUsdForPlacesKind(event.kind) : 0;
    const admin = createAdminClient();
    const { error } = await admin.from("google_places_usage").insert({
      merchant_id: event.merchantId ?? null,
      kind: event.kind,
      path: event.path,
      status: event.status,
      cost_usd: costUsd,
      query_chars: event.queryChars ?? null,
      result_count: event.resultCount ?? null,
      http_status: event.httpStatus ?? null,
      error_code: event.errorCode ?? null,
    });
    if (error) {
      console.error(
        JSON.stringify({
          scope: "google_places",
          event: "usage_write_failed",
          message: error.message,
          at: new Date().toISOString(),
        }),
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "google_places",
        event: "usage_write_failed",
        message: error instanceof Error ? error.message : "unknown",
        at: new Date().toISOString(),
      }),
    );
  }
}
