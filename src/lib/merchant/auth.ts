const AUTH_KEY = "froq-merchant-auth";
const SETUP_KEY = "froq-merchant-setup-done";
const PAYMENT_KEY = "froq-merchant-payment-done";

export function readMerchantAuth(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(AUTH_KEY) === "1";
}

export function writeMerchantAuth(loggedIn: boolean) {
  if (typeof window === "undefined") return;
  if (loggedIn) window.sessionStorage.setItem(AUTH_KEY, "1");
  else window.sessionStorage.removeItem(AUTH_KEY);
}

export function readSetupDone(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SETUP_KEY) === "1";
}

export function writeSetupDone(done: boolean) {
  if (typeof window === "undefined") return;
  if (done) window.localStorage.setItem(SETUP_KEY, "1");
  else window.localStorage.removeItem(SETUP_KEY);
}

export function readPaymentDone(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PAYMENT_KEY) === "1";
}

export function writePaymentDone(done: boolean) {
  if (typeof window === "undefined") return;
  if (done) window.localStorage.setItem(PAYMENT_KEY, "1");
  else window.localStorage.removeItem(PAYMENT_KEY);
}

/** True when the merchant signed up via checkout (paid, awaiting or past setup). */
export function isCheckoutMerchant(): boolean {
  return readPaymentDone() && readMerchantAuth();
}
