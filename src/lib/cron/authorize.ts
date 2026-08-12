import "server-only";

import crypto from "node:crypto";

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * Fail closed when the secret is missing so the route cannot be invoked publicly.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const presented = Buffer.from(auth);
  const needed = Buffer.from(expected);
  if (presented.length !== needed.length) return false;
  return crypto.timingSafeEqual(presented, needed);
}
