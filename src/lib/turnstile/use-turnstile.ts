"use client";

import { useCallback, useMemo, useState } from "react";
import type { TurnstileFieldProps } from "@/components/turnstile/turnstile-field";
import { TURNSTILE_MISSING_MESSAGE, isTurnstileConfigured } from "./config";

export interface UseTurnstileOptions {
  /** Labels the challenge in Cloudflare analytics, e.g. "queue-join". */
  action?: string;
  theme?: "auto" | "light" | "dark";
}

export interface TurnstileState {
  /** Fresh single-use token, or null while the challenge is outstanding. */
  token: string | null;
  /** False while no token is available, so submit buttons can stay disabled. */
  ready: boolean;
  /** Widget-level failure message. Already rendered by `TurnstileField`. */
  error: string;
  /**
   * What a form should put in its own error slot when a submit is blocked.
   * Empty while the widget is already explaining itself, so the same problem is
   * never reported twice on one card.
   */
  blockedMessage: string;
  /**
   * Re-challenge for a new token. Call after every submit attempt, successful or
   * not — the token just sent can never be reused.
   */
  reset: () => void;
  fieldProps: TurnstileFieldProps;
}

/**
 * Owns one Turnstile challenge for a form.
 *
 * Turnstile tokens are single-use and expire after ~5 minutes, so state is
 * deliberately short-lived: every submit spends the token and resets the widget,
 * which also covers retries after a validation failure.
 *
 * When Turnstile isn't configured, `ready` is true and `token` stays null, so
 * forms behave exactly as they did before the integration.
 */
export function useTurnstile(options: UseTurnstileOptions = {}): TurnstileState {
  const { action, theme } = options;
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const configured = isTurnstileConfigured();

  const reset = useCallback(() => {
    setToken(null);
    setError("");
    setResetKey((key) => key + 1);
  }, []);

  const fieldProps = useMemo<TurnstileFieldProps>(
    () => ({
      resetKey,
      action,
      theme,
      error,
      onToken: (next: string) => {
        setToken(next);
        setError("");
      },
      onExpire: () => setToken(null),
      onError: (message: string) => {
        setToken(null);
        setError(message);
      },
    }),
    [resetKey, action, theme, error],
  );

  // Stable identity so callers can list `captcha` in useCallback deps without
  // rebuilding their submit handlers on every keystroke.
  return useMemo(
    () => ({
      token,
      ready: configured ? token != null : true,
      error,
      blockedMessage: error ? "" : TURNSTILE_MISSING_MESSAGE,
      reset,
      fieldProps,
    }),
    [token, configured, error, reset, fieldProps],
  );
}
