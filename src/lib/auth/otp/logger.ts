import "server-only";

// Lightweight structured logger for the OTP flow. Keeps a consistent prefix so
// the lines are easy to grep in Vercel logs. Never logs the OTP itself.

type Fields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  const line = { scope: "otp", level, event, ...fields, at: new Date().toISOString() };
  const payload = JSON.stringify(line);
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export const otpLog = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
