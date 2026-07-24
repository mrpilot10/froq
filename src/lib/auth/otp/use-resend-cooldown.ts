"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Countdown timer for OTP resend cooldown. Starts at 0; call `start(seconds)`
 * after a successful send. Ticks down once per second until 0.
 */
export function useResendCooldown(initialSeconds = 0) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = window.setTimeout(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [secondsLeft]);

  const start = useCallback((seconds: number) => {
    setSecondsLeft(Math.max(0, Math.ceil(seconds)));
  }, []);

  const clear = useCallback(() => {
    setSecondsLeft(0);
  }, []);

  return {
    secondsLeft,
    canResend: secondsLeft <= 0,
    start,
    clear,
  };
}
