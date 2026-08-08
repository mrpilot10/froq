/**
 * WhatsApp notification templates (loyalty + queue).
 *
 * Architecture: each template has a typed builder that returns a
 * {@link WhatsAppTemplatePayload} (body vars + optional URL button params).
 * Body and button variables are numbered independently by WhatsApp.
 */

export { WhatsAppTemplateName, froqPublicOrigin, loyaltyCardUrl } from "./names";

export {
  WHATSAPP_TEMPLATE_CATEGORIES,
  WHATSAPP_CATEGORY_LABEL,
  categoryForWhatsAppTemplate,
  listWhatsAppTemplateCategories,
  countTemplatesByCategory,
} from "./categories";
export type {
  WhatsAppTemplateCategory,
  WhatsAppTemplateCategoryRow,
  ApitxtTemplateCatalogName,
} from "./categories";
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

export { buildBirthdayBonusStampsTemplate } from "./birthday-bonus-stamps";
export type { BirthdayBonusStampsTemplateInput } from "./birthday-bonus-stamps";

export {
  buildQueueJoinedWhatsAppVars,
  buildQueuePartyWhatsAppVars,
  buildQueueWhatsAppVars,
} from "./queue-vars";
export type {
  QueueJoinedWhatsAppVarInput,
  QueueJoinedWhatsAppVars,
  QueuePartyWhatsAppVarInput,
  QueuePartyWhatsAppVars,
  QueueWhatsAppVarInput,
  QueueWhatsAppVars,
} from "./queue-vars";

export {
  buildQueueJoinedTemplate,
  buildQueueJoinedMenuTemplate,
  buildQueueCustomerCalledTemplate,
  buildQueueCustomerCalledReminder1Template,
  buildQueueCustomerCalledReminder2Template,
  buildQueueCustomerCalledReminder3Template,
  buildQueueCustomerSkippedTemplate,
  buildQueueCustomerSeatedTemplate,
  buildSeatedMenuTemplate,
  canonicalQueueTemplateName,
} from "./queue";
export type { QueueJoinedTemplateInput, QueuePartyTemplateInput } from "./queue";
