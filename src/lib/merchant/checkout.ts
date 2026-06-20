const CHECKOUT_KEY = "froq-merchant-checkout";

export interface CheckoutAccount {
  planId: string;
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
}

export function readCheckoutAccount(): CheckoutAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CheckoutAccount;
  } catch {
    return null;
  }
}

export function writeCheckoutAccount(account: CheckoutAccount) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(account));
}

export function clearCheckoutAccount() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CHECKOUT_KEY);
}
