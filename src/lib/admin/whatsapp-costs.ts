import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  WHATSAPP_CATEGORY_LABEL,
  type WhatsAppTemplateCategory,
} from "@/lib/whatsapp/templates/categories";
import {
  WHATSAPP_INDIA_RATE_INR,
  WHATSAPP_INDIA_RATE_UPDATED_AT,
} from "@/lib/whatsapp/pricing";

export type WhatsAppCostByCategory = {
  category: WhatsAppTemplateCategory | "UNKNOWN";
  label: string;
  rateInr: number;
  sent: number;
  failed: number;
  costInr: number;
};

export type WhatsAppMessageRow = {
  id: string;
  at: string;
  templateName: string;
  category: string;
  status: string;
  costInr: number;
  phoneLast4: string | null;
  source: string;
};

export type WhatsAppCostAnalytics = {
  generatedAt: string;
  windowDays: number;
  ratesUpdatedAt: string;
  totals: {
    sent: number;
    failed: number;
    costInr: number;
  };
  byCategory: WhatsAppCostByCategory[];
  byTemplate: Array<{
    templateName: string;
    category: string;
    sent: number;
    failed: number;
    costInr: number;
  }>;
  recent: WhatsAppMessageRow[];
};

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function getWhatsAppCostAnalytics(
  windowDays = 30,
): Promise<WhatsAppCostAnalytics> {
  const admin = createAdminClient();
  const since = daysAgoIso(windowDays);

  const { data, error } = await admin
    .from("whatsapp_message_log")
    .select(
      "id, template_name, category, cost_inr, status, phone_last4, source, created_at",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20_000);

  if (error) {
    console.error(
      JSON.stringify({
        scope: "admin",
        event: "whatsapp_cost_query_failed",
        message: error.message,
        at: new Date().toISOString(),
      }),
    );
  }

  const rows = data ?? [];

  const categoryMap = new Map<
    string,
    { sent: number; failed: number; costInr: number }
  >();
  const templateMap = new Map<
    string,
    { category: string; sent: number; failed: number; costInr: number }
  >();

  let sent = 0;
  let failed = 0;
  let costInr = 0;

  for (const row of rows) {
    const category = (row.category as string) || "UNKNOWN";
    const isSent = row.status === "sent";
    const rowCost = Number(row.cost_inr) || 0;

    if (isSent) {
      sent += 1;
      costInr += rowCost;
    } else {
      failed += 1;
    }

    const cCur = categoryMap.get(category) ?? { sent: 0, failed: 0, costInr: 0 };
    if (isSent) {
      cCur.sent += 1;
      cCur.costInr += rowCost;
    } else {
      cCur.failed += 1;
    }
    categoryMap.set(category, cCur);

    const tName = row.template_name as string;
    const tCur = templateMap.get(tName) ?? {
      category,
      sent: 0,
      failed: 0,
      costInr: 0,
    };
    if (isSent) {
      tCur.sent += 1;
      tCur.costInr += rowCost;
    } else {
      tCur.failed += 1;
    }
    templateMap.set(tName, tCur);
  }

  const categoryOrder: Array<WhatsAppTemplateCategory | "UNKNOWN"> = [
    "AUTHENTICATION",
    "UTILITY",
    "MARKETING",
    "UNKNOWN",
  ];

  const byCategory: WhatsAppCostByCategory[] = categoryOrder.map((category) => {
    const cur = categoryMap.get(category) ?? { sent: 0, failed: 0, costInr: 0 };
    const rate =
      category === "UNKNOWN"
        ? 0
        : WHATSAPP_INDIA_RATE_INR[category as WhatsAppTemplateCategory];
    return {
      category,
      label:
        category === "UNKNOWN"
          ? "Unknown"
          : WHATSAPP_CATEGORY_LABEL[category as WhatsAppTemplateCategory],
      rateInr: rate,
      sent: cur.sent,
      failed: cur.failed,
      costInr: cur.costInr,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    ratesUpdatedAt: WHATSAPP_INDIA_RATE_UPDATED_AT,
    totals: { sent, failed, costInr },
    byCategory,
    byTemplate: [...templateMap.entries()]
      .map(([templateName, v]) => ({
        templateName,
        category: v.category,
        sent: v.sent,
        failed: v.failed,
        costInr: v.costInr,
      }))
      .sort((a, b) => b.costInr - a.costInr || b.sent - a.sent),
    recent: rows.slice(0, 40).map((row) => ({
      id: row.id as string,
      at: row.created_at as string,
      templateName: row.template_name as string,
      category: row.category as string,
      status: row.status as string,
      costInr: Number(row.cost_inr) || 0,
      phoneLast4: (row.phone_last4 as string | null) ?? null,
      source: (row.source as string) || "sendWA",
    })),
  };
}
