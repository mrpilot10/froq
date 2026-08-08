import "server-only";

import {
  APITXT_LOW_BALANCE,
  formatApitxtBalance,
  getApitxtBalance,
  isApitxtBalanceLow,
  type ApitxtBalance,
} from "@/lib/admin/apitxt-balance";
import {
  getResendQuota,
  noteResendQuotaHeaders,
  type ResendQuota,
} from "@/lib/admin/resend-quota";
import { isTransactionalSmsConfigured } from "@/lib/notifications/sms";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";

export type ChannelStatus = "ready" | "partial" | "missing";

export type CommsChannel = {
  id: "whatsapp" | "sms" | "email";
  label: string;
  href: string;
  provider: string;
  status: ChannelStatus;
  detail: string;
};

export type ResendEmailRow = {
  id: string;
  subject: string;
  to: string;
  from: string;
  lastEvent: string;
  createdAt: string;
};

export type CommunicationOverview = {
  generatedAt: string;
  apitxt: ApitxtBalance;
  apitxtLabel: string;
  apitxtLow: boolean;
  resendQuota: ResendQuota;
  channels: CommsChannel[];
  otp: {
    activeRows: number;
    byChannel: Array<{ channel: string; count: number }>;
  };
  billingNotices30d: number;
  recentEmails: ResendEmailRow[];
  emailError: string | null;
  pending: string[];
};

function whatsappConfigured(): boolean {
  return Boolean(
    process.env.APITXT_AUTH_KEY?.trim() &&
      process.env.APITXT_PROJECT_REF_ID?.trim(),
  );
}

function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function maskRecipient(value: string): string {
  const v = value.trim();
  const at = v.indexOf("@");
  if (at > 0) {
    const local = v.slice(0, at);
    const domain = v.slice(at + 1);
    const keep = local.slice(0, Math.min(2, local.length));
    return `${keep}…@${domain}`;
  }
  if (v.length <= 4) return "••••";
  return `${v.slice(0, 2)}••••${v.slice(-2)}`;
}

async function listRecentResendEmails(limit = 25): Promise<{
  emails: ResendEmailRow[];
  error: string | null;
}> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return { emails: [], error: "RESEND_API_KEY not configured" };
  }

  try {
    const resend = new Resend(key);
    const result = await resend.emails.list({ limit });
    noteResendQuotaHeaders(result.headers);
    if (result.error) {
      return { emails: [], error: result.error.message };
    }
    const rows = result.data?.data ?? [];
    return {
      emails: rows.map((row) => ({
        id: row.id,
        subject: row.subject || "(no subject)",
        to: maskRecipient(
          Array.isArray(row.to) ? String(row.to[0] ?? "") : String(row.to ?? ""),
        ),
        from: row.from || "",
        lastEvent: row.last_event || "unknown",
        createdAt: row.created_at,
      })),
      error: null,
    };
  } catch (err) {
    return {
      emails: [],
      error: err instanceof Error ? err.message : "Resend list failed",
    };
  }
}

export async function getCommunicationOverview(): Promise<CommunicationOverview> {
  const admin = createAdminClient();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [apitxt, emailsResult, otpRes, billingRes, resendQuota] = await Promise.all([
    getApitxtBalance(),
    listRecentResendEmails(30),
    admin
      .from("otp_codes")
      .select("channel, created_at")
      .gte("created_at", since30)
      .limit(5_000),
    admin
      .from("billing_notice_log")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", since30),
    getResendQuota(),
  ]);

  const otpRows = otpRes.data ?? [];
  const byChannelMap = new Map<string, number>();
  for (const row of otpRows) {
    const channel = (row.channel as string) || "sms";
    byChannelMap.set(channel, (byChannelMap.get(channel) ?? 0) + 1);
  }

  const waReady = whatsappConfigured();
  const smsReady = isTransactionalSmsConfigured();
  const emailReady = emailConfigured();

  const channels: CommsChannel[] = [
    {
      id: "whatsapp",
      label: "WhatsApp",
      href: "/admin/communication/whatsapp",
      provider: "API TXT",
      status: waReady ? "ready" : "missing",
      detail: waReady
        ? "Templates + OTP via API TXT"
        : "Needs APITXT_AUTH_KEY + APITXT_PROJECT_REF_ID",
    },
    {
      id: "sms",
      label: "SMS",
      href: "/admin/communication/sms",
      provider: "API TXT",
      status: smsReady ? "ready" : process.env.APITXT_AUTH_KEY?.trim() ? "partial" : "missing",
      detail: smsReady
        ? `Sender ${process.env.APITXT_SMS_SENDER?.trim()}`
        : "Needs APITXT_SMS_SENDER + APITXT_SMS_PE_ID",
    },
    {
      id: "email",
      label: "Email",
      href: "/admin/communication/email",
      provider: "Resend",
      status: emailReady ? "ready" : "missing",
      detail: emailReady
        ? process.env.RESEND_FROM_EMAIL?.trim() || "Froq <hello@froq.io>"
        : "Needs RESEND_API_KEY",
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    apitxt,
    apitxtLabel: formatApitxtBalance(apitxt),
    apitxtLow: isApitxtBalanceLow(apitxt),
    resendQuota,
    channels,
    otp: {
      activeRows: otpRows.length,
      byChannel: [...byChannelMap.entries()]
        .map(([channel, count]) => ({ channel, count }))
        .sort((a, b) => b.count - a.count),
    },
    billingNotices30d: billingRes.count ?? 0,
    recentEmails: emailsResult.emails,
    emailError: emailsResult.error,
    pending: [
      "Persist API TXT SMS delivery receipts",
      "Resend webhooks → opens / bounces in Supabase",
      "Per-channel SMS cost ingestion",
    ],
  };
}

export { APITXT_LOW_BALANCE };
