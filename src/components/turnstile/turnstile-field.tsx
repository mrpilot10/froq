"use client";

import { useEffect, useRef, useState } from "react";
import {
  TURNSTILE_SITE_KEY,
  TURNSTILE_UNAVAILABLE_MESSAGE,
  isTurnstileConfigured,
  turnstileClientErrorMessage,
} from "@/lib/turnstile/config";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  theme?: "auto" | "light" | "dark";
  size?: "normal" | "flexible" | "compact";
  appearance?: "always" | "execute" | "interaction-only";
  "refresh-expired"?: "auto" | "manual" | "never";
  callback?: (token: string) => void;
  "error-callback"?: (code?: string) => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  /** Fire only for challenges Cloudflare decides need a human. */
  "before-interactive-callback"?: () => void;
  "after-interactive-callback"?: () => void;
}

interface TurnstileApi {
  render: (el: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** One shared script load for the whole app, however many widgets mount. */
let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      scriptPromise = null;
      reject(new Error("turnstile_script_failed"));
    });
    if (!existing) document.head.appendChild(script);
  });

  return scriptPromise;
}

export interface TurnstileFieldProps {
  /** Bumping this re-renders the widget to mint a fresh token. */
  resetKey: number;
  onToken: (token: string) => void;
  onExpire: () => void;
  onError: (message: string) => void;
  /**
   * Widget-level failure, rendered here rather than by each form: a blocked or
   * failing challenge disables the submit button, so the explanation has to
   * appear without waiting for a submit attempt.
   */
  error: string;
  /** Labels the challenge in Cloudflare analytics, e.g. "merchant-sign-in". */
  action?: string;
  /**
   * Defaults to light because every surface that hosts this widget (auth cards,
   * guest pages, checkout) is light-only today. Pass "auto" or "dark" when
   * dropping it on a dark surface.
   */
  theme?: "auto" | "light" | "dark";
  className?: string;
}

/**
 * Runs the Turnstile challenge and reports tokens upward.
 *
 * Explicit rendering (rather than the implicit `cf-turnstile` class) keeps the
 * widget lifecycle tied to React's, which matters here because tokens are
 * single-use — every submit resets the widget to mint the next one.
 *
 * The widget itself stays out of sight: in `interaction-only` mode Cloudflare
 * shows it only to visitors it wants to challenge, so the branded box no longer
 * sits in the middle of every form. Protection is unchanged — the challenge
 * still runs and still issues the token that gates submission.
 */
export function TurnstileField({
  resetKey,
  onToken,
  onExpire,
  onError,
  error,
  action,
  theme = "light",
  className,
}: TurnstileFieldProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Only an interactive challenge is on screen, so only then is there anything
  // to make room for.
  const [interactive, setInteractive] = useState(false);

  // Callbacks are re-created on every parent render; keeping them in a ref stops
  // the widget from being torn down and re-challenged mid-interaction.
  const handlers = useRef({ onToken, onExpire, onError });

  useEffect(() => {
    handlers.current = { onToken, onExpire, onError };
  }, [onToken, onExpire, onError]);

  useEffect(() => {
    if (!isTurnstileConfigured()) return;

    const host = hostRef.current;
    if (!host) return;

    let widgetId: string | undefined;
    let cancelled = false;

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId = window.turnstile.render(host, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme,
          size: "flexible",
          appearance: "interaction-only",
          "refresh-expired": "auto",
          "before-interactive-callback": () => setInteractive(true),
          "after-interactive-callback": () => setInteractive(false),
          callback: (token) => handlers.current.onToken(token),
          "expired-callback": () => handlers.current.onExpire(),
          "timeout-callback": () => handlers.current.onExpire(),
          "error-callback": (code) => {
            handlers.current.onError(turnstileClientErrorMessage(code));
            // Returning true tells Turnstile we handled it (avoids duplicate console spam).
            return true;
          },
        });
      })
      .catch(() => {
        if (!cancelled) handlers.current.onError(TURNSTILE_UNAVAILABLE_MESSAGE);
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {
          // Widget already gone (fast unmount) — nothing to clean up.
        }
      }
    };
  }, [resetKey, action, theme]);

  if (!isTurnstileConfigured()) return null;

  const classes = ["turnstile-slot"];
  if (interactive) classes.push("is-interactive");
  if (className) classes.push(className);

  return (
    <div className={classes.join(" ")}>
      <div ref={hostRef} className="turnstile-field" role="group" aria-label="Security check" />
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
