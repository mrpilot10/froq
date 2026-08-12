import { WhatsAppTemplateName } from "./names";
import {
  buildQueueJoinedWhatsAppVars,
  buildQueuePartyWhatsAppVars,
  type QueueJoinedWhatsAppVarInput,
  type QueuePartyWhatsAppVarInput,
} from "./queue-vars";
import {
  buildUrlButton,
  requireNonEmptyString,
  type WhatsAppTemplatePayload,
} from "./types";
import { buildMenuGuestUrlSuffix } from "./menu-url";

export type QueueJoinedTemplateInput = QueueJoinedWhatsAppVarInput;
export type QueuePartyTemplateInput = QueuePartyWhatsAppVarInput;

/**
 * Map legacy / renamed Meta template names to the currently approved send name.
 * queue_reminder_3 → queue_3_reminder (Meta rename).
 */
export function canonicalQueueTemplateName(templateName: string): string {
  const name = templateName.trim();
  if (name === "queue_reminder_3") return WhatsAppTemplateName.QueueReminder3;
  return name;
}

function withPartyButton(
  templateName: string,
  input: QueuePartyWhatsAppVarInput,
): WhatsAppTemplatePayload {
  const vars = buildQueuePartyWhatsAppVars(input);
  return {
    templateName: canonicalQueueTemplateName(templateName),
    body: [...vars.body],
    buttons: [buildUrlButton([vars.publicToken])],
  };
}

/**
 * queue_first_notify — guest joined the waitlist.
 * Body: name, business, booking size, position, estimated wait.
 * URL button {{1}} = publicToken → https://froq.io/queue/{{1}}.
 */
export function buildQueueJoinedTemplate(
  input: QueueJoinedTemplateInput,
): WhatsAppTemplatePayload {
  const vars = buildQueueJoinedWhatsAppVars(input);
  return {
    templateName: WhatsAppTemplateName.QueueFirstNotify,
    body: [...vars.body],
    buttons: [buildUrlButton([vars.publicToken])],
  };
}

/**
 * queue_first_notify_menu — same body as join; two Meta URL buttons:
 *   Button 0 → https://froq.io/queue/{{1}}  (publicToken)
 *   Button 1 → https://froq.io/menu/{{1}}   (merchant slug, optional ?guest=)
 */
export function buildQueueJoinedMenuTemplate(
  input: QueueJoinedTemplateInput & { merchantSlug: string },
): WhatsAppTemplatePayload {
  const vars = buildQueueJoinedWhatsAppVars(input);
  const merchantSlug = requireNonEmptyString(input.merchantSlug, "merchantSlug");
  return {
    templateName: WhatsAppTemplateName.QueueFirstNotifyMenu,
    body: [...vars.body],
    buttons: [
      buildUrlButton([vars.publicToken]),
      buildUrlButton([buildMenuGuestUrlSuffix(merchantSlug, vars.publicToken)]),
    ],
  };
}

/** @deprecated Prefer buildQueueJoinedTemplate — same Meta template. */
export const buildQueueFirstNotifyTemplate = buildQueueJoinedTemplate;

/** queue_call_now — merchant called this party. */
export function buildQueueCustomerCalledTemplate(
  input: QueuePartyTemplateInput,
): WhatsAppTemplatePayload {
  return withPartyButton(WhatsAppTemplateName.QueueCallNow, input);
}

/** queue_reminders_1 — first follow-up after call. */
export function buildQueueCustomerCalledReminder1Template(
  input: QueuePartyTemplateInput,
): WhatsAppTemplatePayload {
  return withPartyButton(WhatsAppTemplateName.QueueReminders1, input);
}

/** queue_reminder_2 — second follow-up after call. */
export function buildQueueCustomerCalledReminder2Template(
  input: QueuePartyTemplateInput,
): WhatsAppTemplatePayload {
  return withPartyButton(WhatsAppTemplateName.QueueReminder2, input);
}

/** queue_3_reminder — third follow-up after call. */
export function buildQueueCustomerCalledReminder3Template(
  input: QueuePartyTemplateInput,
): WhatsAppTemplatePayload {
  return withPartyButton(WhatsAppTemplateName.QueueReminder3, input);
}

/** queue_customer_skipped — party skipped / no-show. */
export function buildQueueCustomerSkippedTemplate(
  input: QueuePartyTemplateInput,
): WhatsAppTemplatePayload {
  return withPartyButton(WhatsAppTemplateName.QueueCustomerSkipped, input);
}

/** queue_seated — party seated. CTA → /queue/{{1}}. */
export function buildQueueCustomerSeatedTemplate(
  input: QueuePartyTemplateInput,
): WhatsAppTemplatePayload {
  return withPartyButton(WhatsAppTemplateName.QueueSeated, input);
}

/** seated_menu — party seated; Menu CTA → https://froq.io/menu/{{1}}. */
export function buildSeatedMenuTemplate(
  input: QueuePartyTemplateInput & { merchantSlug: string },
): WhatsAppTemplatePayload {
  const vars = buildQueuePartyWhatsAppVars(input);
  const merchantSlug = requireNonEmptyString(input.merchantSlug, "merchantSlug");
  return {
    templateName: WhatsAppTemplateName.SeatedMenu,
    body: [...vars.body],
    buttons: [
      buildUrlButton([buildMenuGuestUrlSuffix(merchantSlug, vars.publicToken)]),
    ],
  };
}
