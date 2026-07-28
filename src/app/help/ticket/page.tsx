import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { RaiseTicketForm } from "@/components/support/raise-ticket-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Raise a ticket — Froq Help",
  description: "Contact Froq support. Signed-in merchants can raise a ticket and we'll reply by email.",
};

/**
 * Tickets are for existing merchants, so we resolve the signed-in user here and
 * prefill their details rather than asking for them again.
 */
async function sender() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: merchant } = await supabase
      .from("merchants")
      .select("business_name, owner_first_name, owner_last_name")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    const fromMerchant = [merchant?.owner_first_name, merchant?.owner_last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const fromMetadata =
      typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";

    return {
      name: fromMerchant || fromMetadata,
      email: user.email ?? "",
      businessName: merchant?.business_name ?? null,
    };
  } catch {
    return null;
  }
}

export default async function RaiseTicketPage() {
  const user = await sender();

  return (
    <div className="ticket-page">
      <Link href="/help" className="ticket-back">
        <ArrowLeft size={15} strokeWidth={2.4} />
        Back to documentation
      </Link>

      {user ? (
        <RaiseTicketForm
          defaultName={user.name}
          defaultEmail={user.email}
          businessName={user.businessName}
        />
      ) : (
        <section className="ticket-gate">
          <span className="ticket-gate-icon">
            <LockKeyhole size={22} strokeWidth={2.2} />
          </span>
          <h1>Log in to raise a ticket</h1>
          <p>
            Support tickets are for Froq merchants, so we can look up your account and answer
            properly. Log in and we&apos;ll bring you straight back here.
          </p>
          <Link href="/merchant" className="lp-btn lp-btn--accent">
            Log in to Froq
          </Link>
          <p className="ticket-gate-alt">
            Not a merchant yet? Browse the{" "}
            <Link href="/help">documentation</Link> or read about{" "}
            <Link href="/loyalty-stamps">Loyalty Stamps</Link> and{" "}
            <Link href="/queue-management">Queue Management</Link>.
          </p>
        </section>
      )}
    </div>
  );
}
