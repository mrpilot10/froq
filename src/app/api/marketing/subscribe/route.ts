import { NextResponse } from "next/server";
import { subscribeToNewsletter } from "@/lib/marketing/newsletter";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const email =
    typeof body === "object" && body && "email" in body && typeof body.email === "string"
      ? body.email
      : "";

  // Honeypot — bots fill this; humans never see it.
  const trap =
    typeof body === "object" && body && "company" in body && typeof body.company === "string"
      ? body.company.trim()
      : "";
  if (trap) {
    return NextResponse.json({ ok: true });
  }

  const result = await subscribeToNewsletter(email);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
