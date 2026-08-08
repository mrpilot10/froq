/**
 * Meta CTA suffixes for AI Menu templates registered as
 * https://froq.io/menu/{{1}}.
 *
 * {{1}} is the path+query after /menu/ — merchant slug plus optional
 * ?guest=frq_… so /menu/[slug] can skip OTP for known customers.
 */

import { requireCustomerPublicToken } from "@/lib/customer/hub";
import {
  requireNonEmptyString,
  WhatsAppTemplateValidationError,
} from "./types";

/**
 * Build Meta URL-button {{1}} for https://froq.io/menu/{{1}}.
 * Example: `jimis-burger-goregaon?guest=frq_abc`
 */
export function buildMenuGuestUrlSuffix(
  merchantSlug: string,
  publicToken: string,
): string {
  const slug = requireNonEmptyString(merchantSlug, "merchantSlug");
  let token: string;
  try {
    token = requireCustomerPublicToken(publicToken, "publicToken");
  } catch (error) {
    throw new WhatsAppTemplateValidationError(
      error instanceof Error ? error.message : "Invalid publicToken.",
      "publicToken",
    );
  }
  // Meta substitutes into the approved base; do not URL-encode ? / =.
  return `${slug}?guest=${token}`;
}
