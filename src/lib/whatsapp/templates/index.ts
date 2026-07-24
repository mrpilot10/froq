/**
 * WhatsApp loyalty notification templates.
 *
 * Architecture: each template has a typed builder that returns a
 * {@link WhatsAppTemplatePayload} (body vars + optional URL button params).
 * Body and button variables are numbered independently by WhatsApp.
 */

export { WhatsAppTemplateName, froqPublicOrigin, loyaltyCardUrl } from "./names";
export type { WhatsAppTemplateName as WhatsAppTemplateNameValue } from "./names";

export {
  WhatsAppTemplateValidationError,
  buildUrlButton,
  requireNonEmptyString,
  requireNumberAsString,
} from "./types";
export type {
  WhatsAppButtonType,
  WhatsAppTemplateButton,
  WhatsAppTemplatePayload,
  WhatsAppUrlButton,
} from "./types";

export { buildStampEarnedTemplate } from "./stamp-earned";
export type { StampEarnedTemplateInput } from "./stamp-earned";
