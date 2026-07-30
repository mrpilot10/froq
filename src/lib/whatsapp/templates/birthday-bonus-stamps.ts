import { WhatsAppTemplateName, loyaltyCardUrl } from "./names";
import { requireCustomerPublicToken } from "@/lib/customer/hub";
import {
  buildUrlButton,
  requireNonEmptyString,
  type WhatsAppTemplatePayload,
  WhatsAppTemplateValidationError,
} from "./types";

export interface BirthdayBonusStampsTemplateInput {
  /** Customer first name (Meta {{1}}). */
  customerFirstName: string;
  /** Café / business name (Meta {{2}}). */
  businessName: string;
  /** Reward they're working toward (Meta {{3}}). */
  rewardName: string;
  /** Customer hub token for CTA (Meta URL button). */
  publicToken: string;
}

/**
 * Builds body + button variables for birthday_bonus_stamps.
 *
 * Body:
 *   {{1}} customer first name
 *   {{2}} café name
 *   {{3}} reward name
 *
 * Dynamic URL button (numbered independently by Meta):
 *   Meta template: https://froq.io/c/{{1}}
 *   Runtime {{1}} = customer.publicToken (frq_…)
 */
export function buildBirthdayBonusStampsTemplate(
  input: BirthdayBonusStampsTemplateInput,
): WhatsAppTemplatePayload {
  const customerFirstName = requireNonEmptyString(
    input.customerFirstName.trim() || "there",
    "customerFirstName",
  );
  const businessName = requireNonEmptyString(input.businessName, "businessName");
  const rewardName = requireNonEmptyString(input.rewardName, "rewardName");
  let publicToken: string;
  try {
    publicToken = requireCustomerPublicToken(input.publicToken, "publicToken");
  } catch (error) {
    throw new WhatsAppTemplateValidationError(
      error instanceof Error ? error.message : "Invalid publicToken.",
      "publicToken",
    );
  }

  void loyaltyCardUrl(publicToken);

  return {
    templateName: WhatsAppTemplateName.BirthdayBonusStamps,
    body: [customerFirstName, businessName, rewardName],
    buttons: [buildUrlButton([publicToken])],
  };
}
