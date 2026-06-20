// Shared OTP constants. No server-only imports here so this is safe to use from
// both client components and server route handlers.

// OTP length must stay within APITxT's documented 4–6 digit range. The UI copy
// ("6-digit code") and the OtpInput length both depend on this value.
export const OTP_LENGTH = 6;

// How long a generated OTP stays valid.
export const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Minimum gap the user must wait before requesting another code (resend cooldown).
// The UI mirrors this with its visible countdown.
export const RESEND_SECONDS = 30;

// APITxT enforces a maximum of 3 OTP requests per mobile number per minute.
export const MAX_REQUESTS_PER_MINUTE = 3;
export const RATE_WINDOW_MS = 60 * 1000;

// How many wrong guesses we tolerate before the active OTP is invalidated.
export const MAX_VERIFY_ATTEMPTS = 5;
