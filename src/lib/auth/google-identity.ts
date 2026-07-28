/**
 * Google Identity Services (GIS) plumbing shared by One Tap and Google's
 * rendered sign-in button.
 *
 * GIS returns an ID token in the browser, which Supabase trades for a session
 * through `signInWithIdToken` — no redirect hop, and no OAuth secret in client
 * code. The client ID is public by design (it ships in Google's own snippets);
 * the client secret stays in Supabase.
 */

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** Web OAuth client ID. Must also be listed under Supabase → Auth → Google → Client IDs. */
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export interface GoogleCredentialResponse {
  /** The ID token (JWT) to hand to Supabase. */
  credential: string;
  select_by?: string;
}

/**
 * Only the moments FedCM still reports are declared here. Now that the browser
 * mediates One Tap, `isDisplayMoment`, `isDisplayed`, `isNotDisplayed`,
 * `getNotDisplayedReason` and `getSkippedReason` are gone — a skip no longer
 * says why, by design.
 */
export interface GooglePromptMoment {
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getDismissedReason: () => "credential_returned" | "cancel_called" | "flow_restarted";
}

export interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  /** SHA-256 hex of the nonce sent to Supabase. */
  nonce?: string;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  context?: "signin" | "signup" | "use";
  itp_support?: boolean;
  use_fedcm_for_button?: boolean;
  ux_mode?: "popup" | "redirect";
}

export type GoogleButtonText = "signin_with" | "signup_with" | "continue_with" | "signin";

export interface GoogleButtonConfiguration {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: GoogleButtonText;
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  /** Pixels. GIS caps this at 400 and defaults to a narrow button without it. */
  width?: number;
  locale?: string;
}

export interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  prompt: (listener?: (moment: GooglePromptMoment) => void) => void;
  renderButton: (parent: HTMLElement, config: GoogleButtonConfiguration) => void;
  cancel: () => void;
  disableAutoSelect: () => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

export function isGoogleIdentityConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

/**
 * GIS needs a browser, and hashing the nonce needs `crypto.subtle`, which only
 * exists in a secure context. On plain http (a LAN IP in development, say)
 * callers fall back to the redirect flow instead.
 */
export function isGoogleIdentitySupported(): boolean {
  return (
    typeof window !== "undefined" && typeof window.crypto?.subtle?.digest === "function"
  );
}

/** One shared script load for the whole app, however many components mount. */
let scriptPromise: Promise<GoogleAccountsId> | null = null;

export function loadGoogleIdentityScript(): Promise<GoogleAccountsId> {
  if (typeof window === "undefined") return Promise.reject(new Error("gis_no_window"));
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<GoogleAccountsId>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else {
        scriptPromise = null;
        reject(new Error("gis_missing_api"));
      }
    });
    script.addEventListener("error", () => {
      scriptPromise = null;
      reject(new Error("gis_script_failed"));
    });
    if (!existing) document.head.appendChild(script);
  });

  return scriptPromise;
}

export interface GoogleNonce {
  /** Sent to Supabase. */
  raw: string;
  /** Sent to Google, and embedded in the ID token it issues. */
  hashed: string;
}

/**
 * Supabase checks that the ID token's nonce is the SHA-256 (hex) of the value
 * it was given, so Google gets the digest and Supabase gets the original. This
 * is what keeps a stolen ID token from being replayed against our project.
 */
export async function createGoogleNonce(): Promise<GoogleNonce> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return { raw, hashed };
}

const SUPPRESS_KEY = "froq.google-one-tap.snooze";
const SUPPRESS_MS = 24 * 60 * 60 * 1000;

/**
 * True while One Tap is snoozed. Chrome applies its own cooldown after a
 * dismissal, but that's per-browser and invisible to us, so we keep a local
 * window as well — a visitor who closed the prompt shouldn't meet it again on
 * every page view.
 */
export function isOneTapSnoozed(): boolean {
  try {
    const until = Number(window.localStorage.getItem(SUPPRESS_KEY) ?? "0");
    return Number.isFinite(until) && until > Date.now();
  } catch {
    // Storage blocked (Safari private browsing): treat as not snoozed.
    return false;
  }
}

export function snoozeOneTap(): void {
  try {
    window.localStorage.setItem(SUPPRESS_KEY, String(Date.now() + SUPPRESS_MS));
  } catch {
    // Nothing to fall back to — worst case the prompt shows again.
  }
}

export function clearOneTapSnooze(): void {
  try {
    window.localStorage.removeItem(SUPPRESS_KEY);
  } catch {
    // Ignored, same as above.
  }
}
