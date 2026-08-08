import "server-only";

import { maskPhone, toCanonicalPhone } from "@/lib/auth/otp/phone";
import { persistSmsSend } from "@/lib/notifications/sms-log";

const APITXT_SEND_MSG_URL = "https://www.apitxt.com/api/sendMsg";

export interface SendTransactionalSmsResult {
  ok: boolean;
  requestId?: string;
  message: string;
}

function smsLog(
  level: "info" | "error" | "warn",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = {
    scope: "sms",
    level,
    event,
    ...fields,
    at: new Date().toISOString(),
  };
  const payload = JSON.stringify(line);
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export function isTransactionalSmsConfigured(): boolean {
  return Boolean(
    process.env.APITXT_AUTH_KEY?.trim() &&
      process.env.APITXT_SMS_SENDER?.trim() &&
      process.env.APITXT_SMS_PE_ID?.trim(),
  );
}

/**
 * Sends a transactional SMS via APITxT sendMsg.
 * Requires APITXT_AUTH_KEY + APITXT_SMS_SENDER + APITXT_SMS_PE_ID.
 * Optional APITXT_SMS_TEMPLATE_ID (DLT) and APITXT_SMS_ROUTE (default 4).
 */
export async function sendTransactionalSms(input: {
  mobile: string;
  message: string;
  /** Override DLT content template id for this send. */
  templateId?: string;
}): Promise<SendTransactionalSmsResult> {
  const authkey = process.env.APITXT_AUTH_KEY?.trim();
  const sender = process.env.APITXT_SMS_SENDER?.trim();
  const peId = process.env.APITXT_SMS_PE_ID?.trim();
  const route = process.env.APITXT_SMS_ROUTE?.trim() || "4";
  const templateId =
    input.templateId?.trim() || process.env.APITXT_SMS_TEMPLATE_ID?.trim() || "";

  const mobile = toCanonicalPhone(input.mobile);
  const message = input.message.trim();

  if (!mobile) {
    return { ok: false, message: "Invalid mobile number." };
  }
  if (!message) {
    return { ok: false, message: "SMS message is empty." };
  }
  if (!authkey) {
    smsLog("error", "sms_misconfigured", { reason: "APITXT_AUTH_KEY missing" });
    return { ok: false, message: "SMS provider is not configured." };
  }
  if (!sender || !peId) {
    smsLog("warn", "sms_misconfigured", {
      reason: "APITXT_SMS_SENDER or APITXT_SMS_PE_ID missing",
      mobile: maskPhone(mobile),
    });
    return {
      ok: false,
      message:
        "Transactional SMS is not configured. Add APITXT_SMS_SENDER and APITXT_SMS_PE_ID.",
    };
  }

  const body = new URLSearchParams({
    authkey,
    mobiles: mobile,
    message,
    sender,
    route,
    pe_id: peId,
    unicode: "0",
  });
  if (templateId) body.set("template_id", templateId);

  try {
    const res = await fetch(APITXT_SEND_MSG_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await res.text();
    let parsed: {
      status?: string | number;
      message?: string;
      request_id?: string;
    } = {};
    try {
      parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
    } catch {
      // Some APITxT responses are plain request ids.
      if (res.ok && raw.trim()) {
        const requestId = raw.trim();
        smsLog("info", "sms_sent", {
          mobile: maskPhone(mobile),
          requestId,
        });
        persistSmsSend({
          status: "sent",
          mobile,
          templateId,
          requestId,
          bodyChars: message.length,
        });
        return { ok: true, requestId, message: "SMS sent." };
      }
      smsLog("error", "sms_bad_response", {
        mobile: maskPhone(mobile),
        httpStatus: res.status,
        body: raw.slice(0, 300),
      });
      persistSmsSend({
        status: "failed",
        mobile,
        templateId,
        providerStatus: res.status,
        providerMessage: raw.slice(0, 300),
        bodyChars: message.length,
      });
      return { ok: false, message: "Unexpected response from SMS provider." };
    }

    const statusOk =
      res.ok &&
      (parsed.status === "success" ||
        parsed.status === "Success" ||
        parsed.status === 200 ||
        parsed.status === "200" ||
        (!parsed.status && res.status === 200));

    if (!statusOk) {
      smsLog("error", "sms_send_failed", {
        mobile: maskPhone(mobile),
        httpStatus: res.status,
        providerStatus: parsed.status,
        providerMessage: parsed.message,
      });
      persistSmsSend({
        status: "failed",
        mobile,
        templateId,
        providerStatus: parsed.status,
        providerMessage: parsed.message,
        bodyChars: message.length,
      });
      return {
        ok: false,
        message:
          typeof parsed.message === "string"
            ? parsed.message
            : "Could not send SMS.",
      };
    }

    smsLog("info", "sms_sent", {
      mobile: maskPhone(mobile),
      requestId: parsed.request_id,
      providerMessage: parsed.message,
    });
    persistSmsSend({
      status: "sent",
      mobile,
      templateId,
      providerStatus: parsed.status,
      providerMessage: parsed.message,
      requestId: parsed.request_id,
      bodyChars: message.length,
    });
    return {
      ok: true,
      requestId: parsed.request_id,
      message: parsed.message ?? "SMS sent.",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    smsLog("error", "sms_network_error", {
      mobile: maskPhone(mobile),
      reason,
    });
    persistSmsSend({
      status: "failed",
      mobile,
      templateId,
      providerMessage: reason,
      bodyChars: message.length,
    });
    return { ok: false, message: "Could not reach the SMS provider." };
  }
}
