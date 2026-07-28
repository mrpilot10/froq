"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { isOneTapSnoozed, snoozeOneTap } from "@/lib/auth/google-identity";
import { useGoogleIdentity } from "@/components/auth/google-identity-provider";

/**
 * Shows Google's One Tap prompt for signed-out visitors. Renders nothing —
 * the browser owns the prompt's position and size under FedCM, so there is no
 * markup to place and no layout to reserve.
 *
 * Everything about it is best-effort: if the browser doesn't support it, the
 * visitor has no Google session, or Google is in a cooldown, the prompt simply
 * never appears and the rendered Google button remains the way in.
 */
export function GoogleOneTap() {
  const { accounts } = useGoogleIdentity();

  useEffect(() => {
    if (!accounts) return;
    if (isOneTapSnoozed()) return;

    let cancelled = false;

    void (async () => {
      // One Tap is for anonymous visitors only. Reading the session is local to
      // the browser, so this costs nothing.
      const { data } = await createClient().auth.getSession();
      if (cancelled || data.session) return;

      accounts.prompt((moment) => {
        // FedCM reports a skip without a reason, and "user closed the prompt"
        // arrives that way, so any skip snoozes it rather than re-prompting.
        if (moment.isSkippedMoment()) {
          snoozeOneTap();
        }
      });
    })();

    return () => {
      cancelled = true;
      // Closes the prompt when the host unmounts or switches away from sign-in.
      accounts.cancel();
    };
  }, [accounts]);

  return null;
}
