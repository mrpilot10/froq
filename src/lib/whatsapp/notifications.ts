import "server-only";

import { requireCustomerPublicToken } from "@/lib/customer/hub";
import { customerHubUrl } from "@/lib/app-url";
import {
  requireReservationPublicToken,
  reservationUrl,
} from "@/lib/reservations/link";
import { maskPhone, toCanonicalPhone } from "@/lib/auth/otp/phone";
import {
  WhatsAppTemplateName,
  buildQueueCustomerCalledReminder1Template,
  buildQueueCustomerCalledReminder2Template,
  buildQueueCustomerCalledReminder3Template,
  buildQueueCustomerCalledTemplate,
  buildQueueCustomerSeatedTemplate,
  buildQueueCustomerSkippedTemplate,
  buildQueueJoinedTemplate,
  buildQueueJoinedMenuTemplate,
  buildSeatedMenuTemplate,
  canonicalQueueTemplateName,
  buildBirthdayBonusStampsTemplate,
  requireNonEmptyString,
  requireNumberAsString,
  WhatsAppTemplateValidationError,
  type QueueJoinedTemplateInput,
  type QueuePartyTemplateInput,
  type WhatsAppTemplatePayload,
} from "@/lib/whatsapp/templates";

const APITXT_SEND_WA_URL = "https://apitxt.com/api/sendWA";

export interface SendWhatsAppTemplateInput {
  templateName: string;
  mobile: string;
  bodyParams: string[];
  /**
   * Permanent customer hub token (`frq_…`) for the dynamic URL button.
   * Meta template: https://froq.io/c/{{1}}
   * Payload: url_buttons is a JSON string: '{"0":"<publicToken>"}'
   * (APITxT requires a string; never send a nested object).
   * Omit for templates with no dynamic URL button (e.g. loyaltycard_reward_claimed).
   */
  publicToken?: string;
  /**
   * Reservation page token (`rsv_…`) for templates whose Meta URL button is
   * https://froq.io/r/{{1}} instead of the customer hub. Mutually exclusive
   * with `publicToken` — reservation messages link to the booking, not the card.
   */
  reservationToken?: string;
}

export interface ApitxtSendWaResponse {
  status?: string | number;
  message?: string;
  data?: unknown;
  [key: string]: unknown;
}

function waLog(
  level: "info" | "error",
  event: string,
  fields: Record<string, unknown>,
) {
  const line = {
    scope: "whatsapp",
    level,
    event,
    ...fields,
    at: new Date().toISOString(),
  };
  const payload = JSON.stringify(line);
  if (level === "error") console.error(payload);
  else console.info(payload);
}

/** Meta body {{n}} labels for loyalty (and related) templates — logged with each send. */
function labeledBodyVariables(
  templateName: string,
  bodyParams: string[],
): Record<string, string> {
  const labelsByTemplate: Record<string, string[]> = {
    loyaltycard_stamp_verified_1: [
      "customerName",
      "businessName",
      "currentStamps",
      "requiredStamps",
      "rewardTitle",
    ],
    loyaltycard_reward_unlocked_no_wait_time: [
      "customerName",
      "businessName",
      "currentStamps",
      "requiredStamps",
      "rewardTitle",
    ],
    loyaltycard_stamp_collected_last_wait_time: [
      "customerName",
      "businessName",
      "currentStamps",
      "requiredStamps",
      "waitLabel",
      "rewardTitle",
    ],
    loyaltycard_reward_ready_wait_time: [
      "customerName",
      "businessName",
      "currentStamps",
      "requiredStamps",
      "rewardTitle",
    ],
    loyaltycard_reward_claimed: ["customerName", "rewardTitle", "businessName"],
    birthday_bonus_stamps: ["customerFirstName", "businessName", "rewardName"],
    reservation_request_received: [
      "customerName",
      "businessName",
      "date",
      "time",
      "partySize",
    ],
    reservation_confirmed: [
      "customerName",
      "businessName",
      "date",
      "time",
      "partySize",
    ],
    reservation_declined: [
      "customerName",
      "businessName",
      "date",
      "time",
      "partySize",
    ],
    reservation_updated: [
      "customerName",
      "businessName",
      "date",
      "time",
      "partySize",
    ],
    reservation_reminder: [
      "customerName",
      "businessName",
      "date",
      "time",
      "partySize",
    ],
  };
  const labels = labelsByTemplate[templateName];
  const out: Record<string, string> = {};
  bodyParams.forEach((value, i) => {
    const key = labels?.[i] ? `{{${i + 1}}}.${labels[i]}` : `{{${i + 1}}}`;
    out[key] = value;
  });
  return out;
}

/**
 * Low-level APITXT Send WhatsApp Template API.
 * POST https://apitxt.com/api/sendWA
 *
 * Dynamic URL button: url_buttons["0"] = customer.publicToken only.
 */
export async function sendWhatsAppTemplate(
  input: SendWhatsAppTemplateInput,
): Promise<ApitxtSendWaResponse> {
  const authkey = process.env.APITXT_AUTH_KEY?.trim();
  const projectRefId = process.env.APITXT_PROJECT_REF_ID?.trim();

  if (!authkey) {
    throw new Error("APITXT_AUTH_KEY is not configured.");
  }
  if (!projectRefId) {
    throw new Error("APITXT_PROJECT_REF_ID is not configured.");
  }

  const templateName = canonicalQueueTemplateName(
    requireNonEmptyString(input.templateName, "templateName"),
  );
  let publicToken: string | undefined;
  if (input.publicToken != null && input.publicToken.trim()) {
    try {
      publicToken = requireCustomerPublicToken(input.publicToken, "publicToken");
    } catch (error) {
      throw new WhatsAppTemplateValidationError(
        error instanceof Error ? error.message : "Invalid publicToken.",
        "publicToken",
      );
    }
  }

  let reservationToken: string | undefined;
  if (input.reservationToken != null && input.reservationToken.trim()) {
    try {
      reservationToken = requireReservationPublicToken(
        input.reservationToken,
        "reservationToken",
      );
    } catch (error) {
      throw new WhatsAppTemplateValidationError(
        error instanceof Error ? error.message : "Invalid reservationToken.",
        "reservationToken",
      );
    }
  }

  const mobile = toCanonicalPhone(input.mobile);
  if (!mobile) {
    throw new WhatsAppTemplateValidationError("Enter a valid mobile number.", "mobile");
  }
  if (!Array.isArray(input.bodyParams) || input.bodyParams.length === 0) {
    throw new WhatsAppTemplateValidationError("bodyParams are required.", "bodyParams");
  }
  if (input.bodyParams.some((p) => typeof p !== "string" || !p.trim())) {
    throw new WhatsAppTemplateValidationError(
      "bodyParams must be non-empty strings.",
      "bodyParams",
    );
  }

  const bodyParams = input.bodyParams.map((p) => p.trim());
  // Reservation templates register /r/{{1}}; everything else /c/{{1}}.
  const urlButtonParam = reservationToken ?? publicToken;
  const urlButtons = urlButtonParam ? { "0": urlButtonParam } : undefined;
  const body: Record<string, unknown> = {
    authkey,
    template_name: templateName,
    project_ref_id: projectRefId,
    mobiles: mobile,
    body_params: bodyParams,
  };
  if (urlButtons) {
    // APITxT schema requires url_buttons as a JSON string, not a nested object.
    // Dynamic URL button {{1}} — suffix only; the base lives in the Meta template.
    body.url_buttons = JSON.stringify(urlButtons);
  }

  waLog("info", "send_wa_payload", {
    templateName,
    mobile: maskPhone(mobile),
    bodyParams,
    variables: labeledBodyVariables(templateName, bodyParams),
    urlButton0: urlButtonParam ?? null,
    urlButtons: urlButtons ?? null,
    resolvedUrl: reservationToken
      ? reservationUrl(reservationToken)
      : publicToken
        ? customerHubUrl(publicToken)
        : null,
  });

  let res: Response;
  let raw: string;
  try {
    res = await fetch(APITXT_SEND_WA_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    raw = await res.text();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    waLog("error", "send_wa_network_error", {
      templateName,
      mobile: maskPhone(mobile),
      reason,
    });
    throw new Error(`WhatsApp send failed: ${reason}`);
  }

  let parsed: ApitxtSendWaResponse = {};
  try {
    parsed = raw ? (JSON.parse(raw) as ApitxtSendWaResponse) : {};
  } catch {
    waLog("error", "send_wa_bad_response", {
      templateName,
      mobile: maskPhone(mobile),
      httpStatus: res.status,
      body: raw.slice(0, 500),
    });
    throw new Error(`WhatsApp send failed: unexpected response (${res.status}).`);
  }

  if (res.status !== 200) {
    waLog("error", "send_wa_http_error", {
      templateName,
      mobile: maskPhone(mobile),
      httpStatus: res.status,
      providerStatus: parsed.status,
      providerMessage: parsed.message,
      body: parsed,
    });
    throw new Error(
      `WhatsApp send failed (${res.status}): ${
        typeof parsed.message === "string" ? parsed.message : "Unknown error"
      }`,
    );
  }

  // APITxT often returns HTTP 200 with a business error in status/message
  // (e.g. 203 "Template not found", 301 "Insufficient balance"). Only a small
  // set of statuses mean the message was accepted — everything else is a failure.
  const providerStatus = parsed.status;
  const providerMessage =
    typeof parsed.message === "string" ? parsed.message.trim() : "";
  const providerOk =
    providerStatus === undefined ||
    providerStatus === null ||
    providerStatus === "" ||
    providerStatus === 200 ||
    providerStatus === "200" ||
    providerStatus === 1 ||
    providerStatus === "1" ||
    providerStatus === "success" ||
    providerStatus === "Success" ||
    providerStatus === "ok" ||
    providerStatus === "OK";
  const providerFailed =
    !providerOk ||
    /template not found|not approved|failed|insufficient balance|invalid/i.test(
      providerMessage,
    );

  if (providerFailed) {
    waLog("error", "send_wa_provider_error", {
      templateName,
      mobile: maskPhone(mobile),
      httpStatus: res.status,
      providerStatus,
      providerMessage,
      body: parsed,
    });
    throw new Error(
      providerMessage ||
        `WhatsApp template "${templateName}" was not accepted by the provider.`,
    );
  }

  waLog("info", "send_wa_ok", {
    templateName,
    mobile: maskPhone(mobile),
    urlButton0: publicToken,
    providerStatus: parsed.status,
    providerMessage: parsed.message,
  });

  return parsed;
}

// ─── Loyalty helpers ─────────────────────────────────────────────────────────

export interface SendStampVerifiedInput {
  mobile: string;
  customerName: string;
  businessName: string;
  currentStamps: number;
  requiredStamps: number;
  rewardTitle: string;
  publicToken: string;
}

/**
 * loyaltycard_stamp_verified_1 —
 * body: name, business, currentStamps, requiredStamps, rewardTitle
 * Button URL {{1}} = publicToken → Meta: https://froq.io/c/{{1}}
 */
export async function sendStampVerified(
  input: SendStampVerifiedInput,
): Promise<ApitxtSendWaResponse> {
  const customerName = requireNonEmptyString(
    input.customerName.trim() || "there",
    "customerName",
  );
  const businessName = requireNonEmptyString(input.businessName, "businessName");
  const rewardTitle = requireNonEmptyString(input.rewardTitle, "rewardTitle");
  const publicToken = requireCustomerPublicToken(input.publicToken, "publicToken");
  const currentStamps = requireNumberAsString(input.currentStamps, "currentStamps");
  const requiredStamps = requireNumberAsString(input.requiredStamps, "requiredStamps");

  if (input.currentStamps < 0) {
    throw new WhatsAppTemplateValidationError(
      "currentStamps cannot be negative.",
      "currentStamps",
    );
  }
  if (input.requiredStamps <= 0) {
    throw new WhatsAppTemplateValidationError(
      "requiredStamps must be greater than zero.",
      "requiredStamps",
    );
  }

  return sendWhatsAppTemplate({
    templateName: WhatsAppTemplateName.StampVerified,
    mobile: input.mobile,
    bodyParams: [
      customerName,
      businessName,
      currentStamps,
      requiredStamps,
      rewardTitle,
    ],
    publicToken,
  });
}

export interface SendRewardUnlockedInput {
  mobile: string;
  customerName: string;
  businessName: string;
  currentStamps: number;
  requiredStamps: number;
  rewardTitle: string;
  publicToken: string;
}

/**
 * loyaltycard_reward_unlocked_no_wait_time —
 * body: name, business, current, required, rewardTitle
 * Button URL {{1}} = publicToken
 */
export async function sendRewardUnlocked(
  input: SendRewardUnlockedInput,
): Promise<ApitxtSendWaResponse> {
  const customerName = requireNonEmptyString(
    input.customerName.trim() || "there",
    "customerName",
  );
  const businessName = requireNonEmptyString(input.businessName, "businessName");
  const rewardTitle = requireNonEmptyString(input.rewardTitle, "rewardTitle");
  const publicToken = requireCustomerPublicToken(input.publicToken, "publicToken");
  const currentStamps = requireNumberAsString(input.currentStamps, "currentStamps");
  const requiredStamps = requireNumberAsString(input.requiredStamps, "requiredStamps");

  if (input.currentStamps < 0) {
    throw new WhatsAppTemplateValidationError(
      "currentStamps cannot be negative.",
      "currentStamps",
    );
  }
  if (input.requiredStamps <= 0) {
    throw new WhatsAppTemplateValidationError(
      "requiredStamps must be greater than zero.",
      "requiredStamps",
    );
  }

  return sendWhatsAppTemplate({
    templateName: WhatsAppTemplateName.RewardUnlocked,
    mobile: input.mobile,
    bodyParams: [customerName, businessName, currentStamps, requiredStamps, rewardTitle],
    publicToken,
  });
}

export interface SendStampCollectedLastWaitTimeInput {
  mobile: string;
  customerName: string;
  businessName: string;
  currentStamps: number;
  requiredStamps: number;
  waitLabel: string;
  rewardTitle: string;
  publicToken: string;
}

/**
 * loyaltycard_stamp_collected_last_wait_time —
 * body: name, business, current, required, waitLabel, rewardTitle
 * Button URL {{1}} = publicToken
 */
export async function sendStampCollectedLastWaitTime(
  input: SendStampCollectedLastWaitTimeInput,
): Promise<ApitxtSendWaResponse> {
  const customerName = requireNonEmptyString(
    input.customerName.trim() || "there",
    "customerName",
  );
  const businessName = requireNonEmptyString(input.businessName, "businessName");
  const waitLabel = requireNonEmptyString(input.waitLabel, "waitLabel");
  const rewardTitle = requireNonEmptyString(input.rewardTitle, "rewardTitle");
  const publicToken = requireCustomerPublicToken(input.publicToken, "publicToken");
  const currentStamps = requireNumberAsString(input.currentStamps, "currentStamps");
  const requiredStamps = requireNumberAsString(input.requiredStamps, "requiredStamps");

  if (input.currentStamps < 0) {
    throw new WhatsAppTemplateValidationError(
      "currentStamps cannot be negative.",
      "currentStamps",
    );
  }
  if (input.requiredStamps <= 0) {
    throw new WhatsAppTemplateValidationError(
      "requiredStamps must be greater than zero.",
      "requiredStamps",
    );
  }

  return sendWhatsAppTemplate({
    templateName: WhatsAppTemplateName.StampCollectedLastWaitTime,
    mobile: input.mobile,
    bodyParams: [
      customerName,
      businessName,
      currentStamps,
      requiredStamps,
      waitLabel,
      rewardTitle,
    ],
    publicToken,
  });
}

export interface SendRewardReadyWaitTimeInput {
  mobile: string;
  customerName: string;
  businessName: string;
  currentStamps: number;
  requiredStamps: number;
  rewardTitle: string;
  publicToken: string;
}

/**
 * loyaltycard_reward_ready_wait_time —
 * body: name, business, current, required, rewardTitle
 * Fired when the QR wait ends and the reward can be redeemed.
 * Button URL {{1}} = publicToken
 */
export async function sendRewardReadyWaitTime(
  input: SendRewardReadyWaitTimeInput,
): Promise<ApitxtSendWaResponse> {
  const customerName = requireNonEmptyString(input.customerName, "customerName");
  const businessName = requireNonEmptyString(input.businessName, "businessName");
  const rewardTitle = requireNonEmptyString(input.rewardTitle, "rewardTitle");
  const publicToken = requireCustomerPublicToken(input.publicToken, "publicToken");
  const currentStamps = requireNumberAsString(input.currentStamps, "currentStamps");
  const requiredStamps = requireNumberAsString(input.requiredStamps, "requiredStamps");

  if (input.currentStamps < 0) {
    throw new WhatsAppTemplateValidationError(
      "currentStamps cannot be negative.",
      "currentStamps",
    );
  }
  if (input.requiredStamps <= 0) {
    throw new WhatsAppTemplateValidationError(
      "requiredStamps must be greater than zero.",
      "requiredStamps",
    );
  }

  return sendWhatsAppTemplate({
    templateName: WhatsAppTemplateName.RewardReadyWaitTime,
    mobile: input.mobile,
    bodyParams: [customerName, businessName, currentStamps, requiredStamps, rewardTitle],
    publicToken,
  });
}

export interface SendRewardRedeemedInput {
  mobile: string;
  customerName: string;
  businessName: string;
  rewardTitle: string;
}

/**
 * loyaltycard_reward_claimed — Utility template, no URL button.
 * Body: {{1}} customer name, {{2}} reward name, {{3}} business name
 */
export async function sendRewardRedeemed(
  input: SendRewardRedeemedInput,
): Promise<ApitxtSendWaResponse> {
  const customerName = requireNonEmptyString(
    input.customerName.trim() || "there",
    "customerName",
  );
  const businessName = requireNonEmptyString(input.businessName, "businessName");
  const rewardTitle = requireNonEmptyString(input.rewardTitle, "rewardTitle");

  return sendWhatsAppTemplate({
    templateName: WhatsAppTemplateName.RewardClaimed,
    mobile: input.mobile,
    bodyParams: [customerName, rewardTitle, businessName],
  });
}

// ── Queue Management templates ──────────────────────────────────────────────

type QueueSendBase = {
  mobile: string;
  publicToken: string;
};

export type SendQueueJoinedInput = QueueSendBase & QueueJoinedTemplateInput;
export type SendQueuePartyInput = QueueSendBase & QueuePartyTemplateInput;

async function sendFromQueuePayload(
  mobile: string,
  payload: WhatsAppTemplatePayload,
): Promise<ApitxtSendWaResponse> {
  const publicToken = payload.buttons?.[0]?.parameters[0];
  if (!publicToken) {
    throw new WhatsAppTemplateValidationError(
      "Queue templates require a publicToken URL button.",
      "publicToken",
    );
  }
  return sendWhatsAppTemplate({
    templateName: payload.templateName,
    mobile,
    bodyParams: payload.body,
    publicToken,
  });
}

/** queue_first_notify — guest joined the waitlist. */
export async function sendQueueJoined(
  input: SendQueueJoinedInput,
): Promise<ApitxtSendWaResponse> {
  return sendFromQueuePayload(input.mobile, buildQueueJoinedTemplate(input));
}

/** queue_first_notify_menu — join notice with AI Menu CTA. */
export async function sendQueueJoinedMenu(
  input: SendQueueJoinedInput,
): Promise<ApitxtSendWaResponse> {
  return sendFromQueuePayload(input.mobile, buildQueueJoinedMenuTemplate(input));
}

/** @deprecated Prefer sendQueueJoined — same Meta template queue_first_notify. */
export const sendQueueFirstNotify = sendQueueJoined;

/** queue_call_now — merchant called this party. */
export async function sendQueueCustomerCalled(
  input: SendQueuePartyInput,
): Promise<ApitxtSendWaResponse> {
  return sendFromQueuePayload(input.mobile, buildQueueCustomerCalledTemplate(input));
}

/** queue_reminders_1 — first call follow-up. */
export async function sendQueueCustomerCalledReminder1(
  input: SendQueuePartyInput,
): Promise<ApitxtSendWaResponse> {
  return sendFromQueuePayload(
    input.mobile,
    buildQueueCustomerCalledReminder1Template(input),
  );
}

/** queue_reminder_2 — second call follow-up. */
export async function sendQueueCustomerCalledReminder2(
  input: SendQueuePartyInput,
): Promise<ApitxtSendWaResponse> {
  return sendFromQueuePayload(
    input.mobile,
    buildQueueCustomerCalledReminder2Template(input),
  );
}

/** queue_reminder_3 — third call follow-up. */
export async function sendQueueCustomerCalledReminder3(
  input: SendQueuePartyInput,
): Promise<ApitxtSendWaResponse> {
  return sendFromQueuePayload(
    input.mobile,
    buildQueueCustomerCalledReminder3Template(input),
  );
}

/** queue_customer_skipped — party skipped / no-show. */
export async function sendQueueCustomerSkipped(
  input: SendQueuePartyInput,
): Promise<ApitxtSendWaResponse> {
  return sendFromQueuePayload(input.mobile, buildQueueCustomerSkippedTemplate(input));
}

/** queue_seated — party seated. */
export async function sendQueueCustomerSeated(
  input: SendQueuePartyInput,
): Promise<ApitxtSendWaResponse> {
  return sendFromQueuePayload(input.mobile, buildQueueCustomerSeatedTemplate(input));
}

/** seated_menu — party seated with AI Menu CTA. */
export async function sendSeatedMenu(
  input: SendQueuePartyInput,
): Promise<ApitxtSendWaResponse> {
  return sendFromQueuePayload(input.mobile, buildSeatedMenuTemplate(input));
}

export interface SendBirthdayBonusStampsInput {
  mobile: string;
  customerFirstName: string;
  businessName: string;
  rewardName: string;
  publicToken: string;
}

/**
 * birthday_bonus_stamps —
 * body: firstName, café name, reward name
 * Button URL {{1}} = publicToken → Meta: https://froq.io/c/{{1}}
 */
export async function sendBirthdayBonusStamps(
  input: SendBirthdayBonusStampsInput,
): Promise<ApitxtSendWaResponse> {
  const payload = buildBirthdayBonusStampsTemplate({
    customerFirstName: input.customerFirstName,
    businessName: input.businessName,
    rewardName: input.rewardName,
    publicToken: input.publicToken,
  });
  return sendWhatsAppTemplate({
    templateName: payload.templateName,
    mobile: input.mobile,
    bodyParams: payload.body,
    publicToken: input.publicToken,
  });
}
