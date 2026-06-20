"use client";

import Link from "next/link";
import Image from "next/image";
import { Store } from "lucide-react";
import { FroqFooter } from "@/components/shared/froq-footer";

interface MerchantAccountNotFoundProps {
  onSignOut: () => void;
}

export function MerchantAccountNotFound({ onSignOut }: MerchantAccountNotFoundProps) {
  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen auth-screen">
        <header className="merchant-auth-head">
          <div className="merchant-auth-logo">
            <Image src="/froq-logo.png" alt="Froq" width={64} height={64} priority />
          </div>
          <h1 className="merchant-auth-brand">Froq for Business</h1>
          <p className="merchant-auth-tag">Merchant dashboard</p>
        </header>

        <div className="auth-card">
          <div className="auth-head">
            <div className="auth-badge merchant-auth-badge" aria-hidden="true">
              <Store size={24} strokeWidth={2} />
            </div>
            <h2 className="auth-title">Account not found</h2>
            <p className="auth-sub auth-sub--inline">
              Account not found. Please{" "}
              <Link href="/#pricing" className="auth-link">
                view our pricing plans
              </Link>{" "}
              and create an account to continue.
            </p>
          </div>

          <button type="button" className="cta-btn merchant-cta-accent auth-submit" onClick={onSignOut}>
            Back to log in
          </button>
        </div>

        <FroqFooter />
      </div>
    </div>
  );
}
