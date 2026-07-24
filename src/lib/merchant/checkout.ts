const CHECKOUT_KEY = "froq-merchant-checkout";

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
}
