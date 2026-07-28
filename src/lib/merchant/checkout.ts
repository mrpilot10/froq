const CHECKOUT_KEY = "froq-merchant-checkout";
const CHECKOUT_DRAFT_KEY = "froq-merchant-checkout-draft";

/**
 * Account-step input kept across the Google OAuth round-trip.
 * Signing up with Google reloads the page, which would otherwise wipe the
 * business name, mobile number and city the merchant had already typed.
 */
export interface CheckoutDraft {
  businessName: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  state: string;
}

export function writeCheckoutDraft(draft: CheckoutDraft) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
}

export function readCheckoutDraft(): CheckoutDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutDraft>;
    return {
      businessName: parsed.businessName ?? "",
      firstName: parsed.firstName ?? "",
      lastName: parsed.lastName ?? "",
      phone: parsed.phone ?? "",
      city: parsed.city ?? "",
      state: parsed.state ?? "",
    };
  } catch {
    return null;
  }
}

export function clearCheckoutDraft() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
}

export interface CheckoutAccount {
  planId: string;
  businessName: string;
  firstName: string;
  lastName: string;
  /** @deprecated Prefer firstName + lastName; kept for older session payloads. */
  ownerName?: string;
  email: string;
  phone: string;
  city: string;
  state: string;
}

export function readCheckoutAccount(): CheckoutAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckoutAccount> & { ownerName?: string };
    const firstName =
      parsed.firstName?.trim() ||
      (parsed.ownerName ?? "").trim().split(/\s+/).filter(Boolean)[0] ||
      "";
    const lastName =
      parsed.lastName?.trim() ||
      (parsed.ownerName ?? "").trim().split(/\s+/).filter(Boolean).slice(1).join(" ") ||
      "";
    return {
      planId: parsed.planId ?? "",
      businessName: parsed.businessName ?? "",
      firstName,
      lastName,
      ownerName: [firstName, lastName].filter(Boolean).join(" "),
      email: parsed.email ?? "",
      phone: parsed.phone ?? "",
      city: parsed.city ?? "",
      state: parsed.state ?? "",
    };
  } catch {
    return null;
  }
}

export function writeCheckoutAccount(account: CheckoutAccount) {
  if (typeof window === "undefined") return;
  const firstName = account.firstName.trim();
  const lastName = account.lastName.trim();
  window.sessionStorage.setItem(
    CHECKOUT_KEY,
    JSON.stringify({
      ...account,
      firstName,
      lastName,
      ownerName: [firstName, lastName].filter(Boolean).join(" "),
    }),
  );
}

export function clearCheckoutAccount() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CHECKOUT_KEY);
  window.sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
}
