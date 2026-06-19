export function formatPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length !== 10) return phone || "—";
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export function isValidPhone(phone: string) {
  return phone.replace(/\D/g, "").length === 10;
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
