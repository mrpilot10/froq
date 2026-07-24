import { WhatsAppTemplateName, loyaltyCardUrl } from "./names";
import { requireCustomerPublicToken } from "@/lib/customer/hub";
import {
  buildUrlButton,
  requireNonEmptyString,
  requireNumberAsString,
  type WhatsAppTemplatePayload,
  WhatsAppTemplateValidationError,
} from "./types";

export interface StampEarnedTemplateInput {
  customerName: string;
  businessName: string;
  currentStamps: number;
  requiredStamps: number;
  publicToken: string;
}

/**
 * Builds body + button variables for loyaltycard_stamp_verified.
 *
 * Body:
 *   {{1}} customer.name
 *   {{2}} business.name
 *   {{3}} loyalty.currentStamps
 *   {{4}} loyalty.requiredStamps
 *
 * Dynamic URL button (numbered independently):
 *   Meta template: https://froq.io/c/{{1}}
 *   Runtime {{1}} = customer.publicToken (frq_…) — never sample/slug/uuid
 */
export function buildStampEarnedTemplate(
  input: StampEarnedTemplateInput,
): WhatsAppTemplatePayload {
  const customerName = requireNonEmptyString(input.customerName, "customerName");
  const businessName = requireNonEmptyString(input.businessName, "businessName");
  let publicToken: string;
  try {
    publicToken = requireCustomerPublicToken(input.publicToken, "publicToken");
  } catch (error) {
    throw new WhatsAppTemplateValidationError(
      error instanceof Error ? error.message : "Invalid publicToken.",
      "publicToken",
    );
  }
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

  // Absolute hub URL for SMS / logs (APP_URL). WhatsApp only gets the token suffix.
  void loyaltyCardUrl(publicToken);

  return {
    templateName: WhatsAppTemplateName.StampVerified,
    body: [customerName, businessName, currentStamps, requiredStamps],
    buttons: [buildUrlButton([publicToken])],
  };
}
