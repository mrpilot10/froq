import { Suspense } from "react";
import { AuthConfirmClient } from "./auth-confirm-client";

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="merchant-page merchant-theme">
          <div className="merchant-screen auth-screen">
            <div className="auth-card">
              <div className="auth-loading" aria-live="polite" aria-busy="true">
                <div className="processing-spinner" aria-hidden="true" />
                <p className="processing-title">Signing you in…</p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <AuthConfirmClient />
    </Suspense>
  );
}
