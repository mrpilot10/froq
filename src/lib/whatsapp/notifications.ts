import "server-only";

import { requireCustomerPublicToken } from "@/lib/customer/hub";
import { customerHubUrl } from "@/lib/app-url";
import { maskPhone, toCanonicalPhone } from "@/lib/auth/otp/phone";
import {
  WhatsAppTemplateName,
  requireNonEmptyString,
  requireNumberAsString,
  WhatsAppTemplateValidationError,
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
   */
  publicToken: string;
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

  const templateName = requireNonEmptyString(input.templateName, "templateName");
  let publicToken: string;
  try {
    publicToken = requireCustomerPublicToken(input.publicToken, "publicToken");
  } catch (error) {
    throw new WhatsAppTemplateValidationError(
      error instanceof Error ? error.message : "Invalid publicToken.",
      "publicToken",
    );
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

  const urlButtons = { "0": publicToken };
  const body = {
    authkey,
    template_name: templateName,
    project_ref_id: projectRefId,
    mobiles: mobile,
    body_params: input.bodyParams.map((p) => p.trim()),
    // APITxT schema requires url_buttons as a JSON string, not a nested object.
    // Dynamic URL button {{1}} — suffix only; Meta template base is /c/{{1}}.
    url_buttons: JSON.stringify(urlButtons),
  };

  waLog("info", "send_wa_payload", {
    templateName,
    mobile: maskPhone(mobile),
    urlButton0: publicToken,
    urlButtons: urlButtons,
    resolvedHubUrl: customerHubUrl(publicToken),
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
  publicToken: string;
}

/**
 * loyaltycard_stamp_verified — body: name, business, currentStamps, requiredStamps
 * Button URL {{1}} = publicToken → Meta: https://froq.io/c/{{1}}
 */
export async function sendStampVerified(
  input: SendStampVerifiedInput,
): Promise<ApitxtSendWaResponse> {
  const customerName = requireNonEmptyString(input.customerName, "customerName");
  const businessName = requireNonEmptyString(input.businessName, "businessName");
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
    bodyParams: [customerName, businessName, currentStamps, requiredStamps],
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
  publicToken: string;
}

/**
 * loyaltycard_stamp_collected_last_wait_time —
 * body: name, business, current, required, waitLabel (e.g. "6 hours")
 * Button URL {{1}} = publicToken
 */
export async function sendStampCollectedLastWaitTime(
  input: SendStampCollectedLastWaitTimeInput,
): Promise<ApitxtSendWaResponse> {
  const customerName = requireNonEmptyString(input.customerName, "customerName");
  const businessName = requireNonEmptyString(input.businessName, "businessName");
  const waitLabel = requireNonEmptyString(input.waitLabel, "waitLabel");
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
    bodyParams: [customerName, businessName, currentStamps, requiredStamps, waitLabel],
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
  publicToken: string;
}

/**
 * reward_redeemed — body: name, business, rewardTitle
 * Button URL {{1}} = publicToken
 */
export async function sendRewardRedeemed(
  input: SendRewardRedeemedInput,
): Promise<ApitxtSendWaResponse> {
  const customerName = requireNonEmptyString(input.customerName, "customerName");
  const businessName = requireNonEmptyString(input.businessName, "businessName");
  const rewardTitle = requireNonEmptyString(input.rewardTitle, "rewardTitle");
  const publicToken = requireCustomerPublicToken(input.publicToken, "publicToken");

  return sendWhatsAppTemplate({
    templateName: WhatsAppTemplateName.RewardRedeemed,
    mobile: input.mobile,
    bodyParams: [customerName, businessName, rewardTitle],
    publicToken,
  });
}
