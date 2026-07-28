/**
 * Why a Google sign-in didn't end in a session. The same reason codes travel
 * back from /auth/callback as `?auth_error=` and from the ID-token flow as a
 * server-action result, so both paths explain themselves the same way.
 */
export const GOOGLE_AUTH_ERRORS: Record<string, string> = {
  not_registered:
    "This Google account isn’t registered as a Froq merchant. Create an account from pricing, or contact support.",
  cancelled: "Google sign-in was cancelled.",
  exchange: "Could not complete Google sign-in. Try again.",
  oauth: "Could not complete Google sign-in. Try again.",
};

export function googleAuthErrorMessage(reason: string | null | undefined): string {
  if (!reason) return GOOGLE_AUTH_ERRORS.oauth;
  return GOOGLE_AUTH_ERRORS[reason] ?? GOOGLE_AUTH_ERRORS.oauth;
}
