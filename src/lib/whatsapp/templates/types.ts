/**
 * Shared types for WhatsApp notification templates (APITxT / Meta-style variables).
 * Body and button variables are numbered independently by WhatsApp.
 */

export type WhatsAppButtonType = "url";

export interface WhatsAppUrlButton {
  type: "url";
  /** Dynamic URL suffix variables (WhatsApp {{1}}, {{2}}, … for the button). */
  parameters: string[];
}

export type WhatsAppTemplateButton = WhatsAppUrlButton;

export interface WhatsAppTemplatePayload {
  /** Registered template name on the WhatsApp / APITxT side. */
  templateName: string;
  /** Ordered body variables — WhatsApp {{1}} … {{n}}. */
  body: string[];
  /** Optional interactive buttons (URL buttons numbered separately from body). */
  buttons?: WhatsAppTemplateButton[];
}

export class WhatsAppTemplateValidationError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "WhatsAppTemplateValidationError";
    this.field = field;
  }
}

/** Ensures a non-empty trimmed string. */
export function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new WhatsAppTemplateValidationError(`${field} is required.`, field);
  }
  return value.trim();
}

/** Ensures a finite number and returns it as a string (WhatsApp body vars are strings). */
export function requireNumberAsString(value: unknown, field: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WhatsAppTemplateValidationError(`${field} must be a number.`, field);
  }
  return String(value);
}

export function buildUrlButton(parameters: string[]): WhatsAppUrlButton {
  if (!parameters.length || parameters.some((p) => !p.trim())) {
    throw new WhatsAppTemplateValidationError(
      "URL button parameters must be non-empty strings.",
      "buttons",
    );
  }
  return {
    type: "url",
    parameters: parameters.map((p) => p.trim()),
  };
}
