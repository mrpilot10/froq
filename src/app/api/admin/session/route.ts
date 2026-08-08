import { NextResponse } from "next/server";
import { getSuperAdminUser } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Confirms the current session is on the SUPER_ADMIN_EMAILS allowlist. */
export async function GET() {
  const admin = await getSuperAdminUser();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "This account is not on the super-admin allowlist." },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true, email: admin.email });
}
