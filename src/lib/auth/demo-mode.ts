/** Demo OTP + local session. Set NEXT_PUBLIC_DEMO_AUTH=false when Supabase SMS is ready. */
export function isDemoAuthMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_AUTH !== "false";
}

export const DEMO_OTP_SEND_MS = 1100;
export const DEMO_OTP_VERIFY_MS = 1300;
export const DEMO_OTP_RESEND_SECONDS = 30;
