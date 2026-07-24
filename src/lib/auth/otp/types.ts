// Wire contract shared by the route handlers and the client helpers.

export interface SendOtpResult {
  ok: boolean;
  message: string;
  // Present on success — delivery channel used for this OTP.
  channel?: "whatsapp" | "sms";
  // Present on success — APITxT request id, surfaced for client-side tracking/logging.
  requestId?: string;
  // Present on rate-limit/cooldown responses — seconds the caller should wait.
  retryAfter?: number;
}

export interface VerifyOtpResult {
  ok: boolean;
  message: string;
  // True when a brand-new account was provisioned for this phone number.
  isNewUser?: boolean;
}
