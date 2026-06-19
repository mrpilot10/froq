"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QrCode } from "lucide-react";
import { getCustomerHome, type CustomerHome } from "@/app/actions/customer";
import { createClient } from "@/lib/supabase/client";
import { LoyaltyExperience } from "@/components/loyalty/loyalty-experience";
import { LoginExperience } from "./login-experience";

export function AppGate() {
  const supabase = useMemo(() => createClient(), []);
  const [home, setHome] = useState<CustomerHome | null>(null);

  const refresh = useCallback(async () => {
    setHome(await getCustomerHome());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setHome({ status: "unauthenticated" });
  }, [supabase]);

  if (!home) {
    return (
      <div className="loyalty-page">
        <div className="loyalty-screen auth-screen">
          <div className="auth-card auth-card--placeholder">
            <div className="auth-loading" aria-live="polite" aria-busy="true">
              <div className="processing-spinner" aria-hidden="true" />
              <p className="processing-title">Loading</p>
              <p className="processing-sub">Just a moment…</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (home.status === "unauthenticated") return <LoginExperience onComplete={refresh} />;

  if (home.status === "no_membership") {
    return (
      <div className="loyalty-page">
        <div className="loyalty-screen auth-screen">
          <div className="auth-card">
            <div className="auth-head">
              <div className="auth-badge" aria-hidden="true">
                <QrCode size={24} strokeWidth={2} color="#fff" />
              </div>
              <h2 className="auth-title">No loyalty cards yet</h2>
              <p className="auth-sub">
                Scan a shop&apos;s Froq QR code at checkout to start collecting stamps.
              </p>
            </div>
            <button type="button" className="cta-btn auth-submit" onClick={handleLogout}>
              Log out
            </button>
          </div>
          <div className="footer">
            Powered by <b>froq.io</b>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LoyaltyExperience
      business={home.business}
      card={home.card}
      history={home.history}
      memberSince={home.memberSince}
      customerName={home.customerName}
      customerPhone={home.customerPhone}
      customerEmail={home.customerEmail}
      onRefresh={refresh}
      onLogout={handleLogout}
    />
  );
}
