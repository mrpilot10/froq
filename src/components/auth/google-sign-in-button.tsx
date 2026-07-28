"use client";

import { useEffect, useRef, useState } from "react";
import { GoogleAuthButton } from "@/components/auth/google-auth-button";
import { useGoogleIdentity } from "@/components/auth/google-identity-provider";
import type { GoogleButtonText } from "@/lib/auth/google-identity";

/** GIS renders at 200px by default and refuses to go past 400px. */
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

/** Grace period before an empty slot counts as a failed render. */
const RENDER_PROBE_MS = 1200;

interface GoogleSignInButtonProps {
  /** Wording on Google's button. */
  text?: GoogleButtonText;
  /** Wording on the fallback redirect button, which we style ourselves. */
  fallbackLabel?: string;
}

/**
 * Google's own rendered sign-in button.
 *
 * Clicking it opens Google's account chooser and returns an ID token to the
 * provider — the page never leaves. When GIS can't be used at all (no client
 * ID, blocked script, insecure origin) this degrades to the redirect flow
 * through Supabase, so there is always a way to sign in with Google.
 */
export function GoogleSignInButton({
  text = "continue_with",
  fallbackLabel,
}: GoogleSignInButtonProps) {
  const { accounts, status, next, flow, onBeforeRedirect, reportError } = useGoogleIdentity();
  const slotRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [renderFailed, setRenderFailed] = useState(false);

  // Google's button takes a pixel width, so track the card and re-render it on
  // resize. Measuring the slot rather than the host avoids a feedback loop with
  // the button we put inside the host.
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    const observer = new ResizeObserver((entries) => {
      const measured = Math.round(entries[0]?.contentRect.width ?? 0);
      if (measured > 0) setWidth(Math.min(Math.max(measured, MIN_WIDTH), MAX_WIDTH));
    });
    observer.observe(slot);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!accounts || !host || !width) return;

    host.replaceChildren();
    accounts.renderButton(host, {
      type: "standard",
      theme: "outline",
      size: "large",
      text,
      shape: "pill",
      logo_alignment: "left",
      width,
    });

    // An unknown client ID or an origin missing from the client's authorised
    // list is only reported to the console — renderButton leaves the slot empty
    // and returns normally. Probing for that turns a silent gap in the card into
    // the redirect flow, which doesn't depend on either setting.
    const probe = window.setTimeout(() => {
      if (!host.firstElementChild) setRenderFailed(true);
    }, RENDER_PROBE_MS);

    return () => {
      window.clearTimeout(probe);
      host.replaceChildren();
    };
  }, [accounts, width, text]);

  if (status === "unavailable" || renderFailed) {
    return (
      <GoogleAuthButton
        next={next}
        flow={flow}
        label={fallbackLabel ?? "Continue with Google"}
        onError={reportError}
        onBeforeRedirect={onBeforeRedirect}
      />
    );
  }

  return (
    <div className="auth-google" ref={slotRef}>
      <div
        ref={hostRef}
        className={status === "signing-in" ? "auth-google-host is-busy" : "auth-google-host"}
        aria-busy={status === "signing-in"}
      />
    </div>
  );
}
