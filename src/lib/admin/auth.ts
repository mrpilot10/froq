import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SuperAdminUser = {
  id: string;
  email: string;
};

/**
 * Comma/space-separated emails in SUPER_ADMIN_EMAILS.
 * Example: capt.tanmay10@gmail.com,ops@froq.io
 */
export function parseSuperAdminEmails(): Set<string> {
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = parseSuperAdminEmails();
  if (allowlist.size === 0) return false;
  return allowlist.has(email.trim().toLowerCase());
}

export async function getSuperAdminUser(): Promise<SuperAdminUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isSuperAdminEmail(user.email)) return null;
  return { id: user.id, email: user.email };
}

/** Redirects to /admin/login when the session is missing or not allowlisted. */
export async function requireSuperAdmin(): Promise<SuperAdminUser> {
  const admin = await getSuperAdminUser();
  if (!admin) redirect("/admin/login");
  return admin;
}
