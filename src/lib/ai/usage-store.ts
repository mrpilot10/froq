import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AiFeature, AiUsage } from "@/lib/ai/gemini";

/**
 * Mirrors the ai_usage log line into a table so AI spend can be charted per
 * restaurant.
 *
 * The stdout line in gemini.ts stays as it is: it covers every call including
 * the ones with no merchant in scope, and it is the record that survives a
 * database outage. This is the queryable half — a log drain can tell you what
 * the platform cost last night, but not what this restaurant cost last month.
 *
 * Best-effort by design. Metering must never be the reason a guest's question
 * goes unanswered, so a failed write is logged and swallowed.
 */
export async function persistAiUsage(event: {
  kind: "text" | "image";
  feature: AiFeature;
  model: string;
  merchantId?: string | null;
  usage: AiUsage;
}): Promise<void> {
  // Calls outside a merchant context (scripts, probes) stay stdout-only —
  // a row nobody can filter by tenant is noise in a table this size.
  if (!event.merchantId) return;
  try {
    const admin = createAdminClient();
    await admin.from("ai_usage").insert({
      merchant_id: event.merchantId,
      feature: event.feature,
      kind: event.kind,
      model: event.model,
      prompt_tokens: event.usage.promptTokens,
      response_tokens: event.usage.responseTokens,
      thoughts_tokens: event.usage.thoughtsTokens,
      cached_tokens: event.usage.cachedTokens,
      total_tokens: event.usage.totalTokens,
    });
  } catch (error) {
    console.error("ai usage write failed", error);
  }
}
