"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { authorizeGoogleIdentitySession } from "@/app/merchant/actions";
import { googleAuthErrorMessage } from "@/lib/auth/google-errors";
import {
  GOOGLE_CLIENT_ID,
  clearOneTapSnooze,
  createGoogleNonce,
  isGoogleIdentityConfigured,
  isGoogleIdentitySupported,
  loadGoogleIdentityScript,
  snoozeOneTap,
  type GoogleAccountsId,
  type GoogleNonce,
} from "@/lib/auth/google-identity";

type GoogleIdentityStatus =
  /** No client ID, insecure context, or the GIS script never loaded. */
  | "unavailable"
  | "loading"
  | "ready"
  | "signing-in";

interface GoogleIdentityContextValue {
  /** GIS handle, once initialised. Null while loading or unavailable. */
  accounts: GoogleAccountsId | null;
  status: GoogleIdentityStatus;
  flow: "signin" | "signup";
  next: string;
  onBeforeRedirect?: () => void;
  reportError: (message: string) => void;
}

const GoogleIdentityContext = createContext<GoogleIdentityContextValue | null>(null);

export function useGoogleIdentity(): GoogleIdentityContextValue {
  const value = useContext(GoogleIdentityContext);
  if (!value) {
    throw new Error("Google sign-in components must be rendered inside <GoogleIdentityProvider>.");
  }
  return value;
}

interface GoogleIdentityProviderProps {
  /** Where the fallback redirect flow returns to. */
  next: string;
  /** "signup" skips the merchant check — the store doesn't exist until checkout ends. */
  flow?: "signin" | "signup";
  /** A credential arrived and is being exchanged; hosts show their own progress UI. */
  onStart?: () => void;
  /** Session established and authorised. */
  onSignedIn: () => void | Promise<void>;
  onError: (message: string) => void;
  /** Runs just before the fallback flow leaves the page, to keep form input. */
  onBeforeRedirect?: () => void;
  children: React.ReactNode;
}

/**
 * Owns the one GIS configuration a page is allowed to have.
 *
 * `google.accounts.id.initialize` is global, so One Tap and the rendered button
 * cannot each configure their own — the second call would replace the first's
 * callback. Initialising here means both share one client ID, one nonce and one
 * credential handler, and the exchange lives in a single place.
 */
export function GoogleIdentityProvider({
  next,
  flow = "signin",
  onStart,
  onSignedIn,
  onError,
  onBeforeRedirect,
  children,
}: GoogleIdentityProviderProps) {
  const [accounts, setAccounts] = useState<GoogleAccountsId | null>(null);
  // Only the client ID takes part in the first render: it is inlined into both
  // bundles, so server and browser agree. Whether the browser can actually run
  // GIS is settled in the effect below, because asking here would render one
  // thing on the server and another during hydration.
  const [status, setStatus] = useState<GoogleIdentityStatus>(() =>
    isGoogleIdentityConfigured() ? "loading" : "unavailable",
  );
  const nonceRef = useRef<GoogleNonce | null>(null);

  // Host callbacks are re-created on every render; holding them in a ref keeps
  // the GIS callback stable so initialize() runs once per mount.
  const handlers = useRef({ onStart, onSignedIn, onError });
  useEffect(() => {
    handlers.current = { onStart, onSignedIn, onError };
  }, [onStart, onSignedIn, onError]);

  const exchange = useCallback(
    async (credential: string) => {
      const fail = (reason: string) => {
        // A failed attempt shouldn't be met with another automatic prompt.
        snoozeOneTap();
        setStatus("ready");
        handlers.current.onError(googleAuthErrorMessage(reason));
      };

      handlers.current.onStart?.();
      setStatus("signing-in");

      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: credential,
          nonce: nonceRef.current?.raw,
        });
        if (error || !data.user) {
          fail("exchange");
          return;
        }

        const authorized = await authorizeGoogleIdentitySession(flow);
        if (!authorized.ok) {
          fail(authorized.reason);
          return;
        }

        clearOneTapSnooze();
        await handlers.current.onSignedIn();
      } catch {
        fail("exchange");
      }
    },
    [flow],
  );

  // Same reasoning as the handlers ref: the GIS callback must not be rebuilt.
  const exchangeRef = useRef(exchange);
  useEffect(() => {
    exchangeRef.current = exchange;
  }, [exchange]);

  useEffect(() => {
    if (!isGoogleIdentityConfigured()) return;

    let cancelled = false;

    void (async () => {
      try {
        if (!isGoogleIdentitySupported()) throw new Error("gis_unsupported");

        const [api, nonce] = await Promise.all([loadGoogleIdentityScript(), createGoogleNonce()]);
        if (cancelled) return;

        nonceRef.current = nonce;
        api.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            void exchangeRef.current(response.credential);
          },
          nonce: nonce.hashed,
          // Never sign anyone in without a tap: silent auto sign-in would also
          // re-authenticate immediately after a sign-out.
          auto_select: false,
          cancel_on_tap_outside: true,
          context: flow === "signup" ? "signup" : "signin",
          // Upgraded One Tap UX on ITP browsers (Safari).
          itp_support: true,
          // Browser-mediated button flow, so the button keeps working without
          // third-party cookies. `use_fedcm_for_prompt` is deliberately absent:
          // FedCM is now the only One Tap path and the flag is deprecated.
          use_fedcm_for_button: true,
          ux_mode: "popup",
        });

        setAccounts(api);
        setStatus("ready");
      } catch {
        // Script blocked, offline, or GIS unsupported — hosts fall back to the
        // redirect button.
        if (!cancelled) setStatus("unavailable");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [flow]);

  const value = useMemo<GoogleIdentityContextValue>(
    () => ({
      accounts,
      status,
      flow,
      next,
      onBeforeRedirect,
      reportError: (message: string) => handlers.current.onError(message),
    }),
    [accounts, status, flow, next, onBeforeRedirect],
  );

  return (
    <GoogleIdentityContext.Provider value={value}>{children}</GoogleIdentityContext.Provider>
  );
}
