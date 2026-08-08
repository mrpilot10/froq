export function formatPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return phone || "—";
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/**
 * National digits for a UI field that already shows a +91 prefix.
 * Pastes like `919004857320` / `+91 90048 57320` must keep the *last* 10
 * digits — `slice(0, 10)` would store `9190048573` and WhatsApp would go
 * to the wrong number while still reporting success.
 */
export function nationalMobileInputDigits(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length > 10) return digits.slice(-10);
  return digits.slice(0, 10);
}

export function isValidPhone(phone: string) {
  return phone.replace(/\D/g, "").length === 10;
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Merchant account passwords — keep simple but reject obviously weak values. */
export function isValidPassword(password: string) {
  return password.length >= 8;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
