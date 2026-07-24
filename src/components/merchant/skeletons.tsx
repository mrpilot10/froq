import Image from "next/image";
import type { MerchantTab } from "@/lib/merchant/types";
import { FroqFooter } from "@/components/shared/froq-footer";

function SkHead() {
  return (
    <div className="tab-head">
      <div className="sk sk-title" />
      <div className="sk sk-sub" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="tab-screen">
      <SkHead />

      <div className="merchant-ltv-card">
        <div className="merchant-ltv-head">
          <div className="sk sk-on-dark sk-line" style={{ width: 130 }} />
          <div className="sk sk-on-dark" style={{ width: 56, height: 22, borderRadius: 999 }} />
        </div>
        <div
          className="sk sk-on-dark"
          style={{ width: 150, height: 36, borderRadius: 10, margin: "14px 0 20px" }}
        />
        <div className="merchant-ltv-metrics">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="merchant-ltv-tile">
              <div className="sk sk-on-dark sk-line" style={{ width: 72 }} />
              <div className="sk sk-on-dark sk-line" style={{ width: 48, marginTop: 6 }} />
            </div>
          ))}
        </div>
      </div>

      <div className="merchant-stat-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="merchant-stat-card">
            <div className="sk sk-icon" />
            <div className="sk" style={{ width: 56, height: 26, borderRadius: 8, marginTop: 14 }} />
            <div className="sk sk-line" style={{ width: 84, marginTop: 10 }} />
          </div>
        ))}
      </div>

      <div className="panel-card merchant-chart-card">
        <div className="merchant-chart-head">
          <div>
            <div className="sk sk-line" style={{ width: 100 }} />
            <div className="sk sk-line" style={{ width: 130, marginTop: 8 }} />
          </div>
          <div className="sk" style={{ width: 52, height: 24, borderRadius: 999 }} />
        </div>
        <div className="merchant-chart-bars">
          {[55, 72, 48, 84, 66, 40, 90].map((height, index) => (
            <div key={index} className="merchant-chart-bar-col">
              <div className="sk" style={{ width: "100%", height: `${height}%`, borderRadius: 8 }} />
              <div className="sk" style={{ width: 10, height: 10, borderRadius: 4, marginTop: 8 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CustomersSkeleton() {
  return (
    <div className="tab-screen">
      <SkHead />

      <div className="merchant-toolbar">
        <div className="sk" style={{ width: 150, height: 34, borderRadius: 12 }} />
        <div className="sk" style={{ width: 84, height: 34, borderRadius: 12 }} />
      </div>

      <div className="panel-card merchant-list-panel">
        <ul className="merchant-list">
          {Array.from({ length: 5 }).map((_, index) => (
            <li key={index} className="merchant-list-item">
              <div className="merchant-list-btn" style={{ cursor: "default" }}>
                <div className="sk sk-circle" style={{ width: 44, height: 44 }} />
                <div className="merchant-list-copy">
                  <div className="sk sk-line" style={{ width: 120 }} />
                  <div className="sk sk-line" style={{ width: 160, marginTop: 8 }} />
                </div>
                <div className="merchant-list-trailing">
                  <div className="sk sk-line" style={{ width: 56 }} />
                  <div
                    className="sk"
                    style={{ width: 64, height: 20, borderRadius: 999, marginTop: 8 }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ApprovalsSkeleton() {
  return (
    <div className="tab-screen">
      <SkHead />

      <div className="merchant-approval-list">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="panel-card merchant-approval-card">
            <div className="merchant-approval-top">
              <div className="sk sk-circle" style={{ width: 44, height: 44 }} />
              <div className="merchant-approval-copy" style={{ flex: 1 }}>
                <div className="sk sk-line" style={{ width: 120 }} />
                <div className="sk sk-line" style={{ width: 140, marginTop: 8 }} />
                <div className="sk sk-line" style={{ width: 100, marginTop: 8 }} />
              </div>
            </div>
            <div className="merchant-approval-actions">
              <div className="sk" style={{ flex: 1, height: 42, borderRadius: 14 }} />
              <div className="sk" style={{ flex: 1, height: 42, borderRadius: 14 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScannerSkeleton() {
  return (
    <div className="tab-screen">
      <SkHead />

      <div
        className="panel-card"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}
      >
        <div className="sk" style={{ width: 220, height: 220, borderRadius: 24 }} />
        <div className="sk sk-line" style={{ width: 180 }} />
        <div className="sk" style={{ width: "100%", height: 52, borderRadius: 16 }} />
        <div className="sk" style={{ width: "100%", height: 52, borderRadius: 16 }} />
      </div>
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="tab-screen">
      <SkHead />

      <div className="panel-card profile-panel">
        <div className="profile-hero">
          <div className="sk sk-circle" style={{ width: 64, height: 64 }} />
          <div style={{ flex: 1 }}>
            <div className="sk sk-line" style={{ width: 150, height: 18 }} />
            <div className="sk sk-line" style={{ width: 180, marginTop: 10 }} />
          </div>
        </div>
      </div>

      <div className="merchant-settings-group">
        <div className="sk sk-line" style={{ width: 90, marginBottom: 12 }} />
        <div
          className="panel-card merchant-qr-panel"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}
        >
          <div className="sk sk-line" style={{ width: 220 }} />
          <div className="sk" style={{ width: 200, height: 200, borderRadius: 22 }} />
          <div className="sk sk-line" style={{ width: 160 }} />
          <div className="sk" style={{ width: "100%", height: 48, borderRadius: 16 }} />
        </div>
      </div>

      {[2, 1, 1].map((rows, group) => (
        <div key={group} className="merchant-settings-group">
          <div className="sk sk-line" style={{ width: 80, marginBottom: 12 }} />
          <div className="panel-card merchant-settings-panel">
            {Array.from({ length: rows }).map((_, row) => (
              <div key={row} className="merchant-settings-row" style={{ cursor: "default" }}>
                <div className="sk sk-icon" />
                <div className="profile-row-copy">
                  <div className="sk sk-line" style={{ width: 110 }} />
                  <div className="sk sk-line" style={{ width: 150, marginTop: 8 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Neutral brand splash shown during the very first gate load, before we know
// whether the visitor is logged in. Using the auth-screen layout (logo + spinner)
// avoids flashing the dashboard skeleton on the way to the login screen.
export function MerchantGateSplash() {
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
          <div className="auth-loading" aria-live="polite" aria-busy="true">
            <div className="processing-spinner" aria-hidden="true" />
            <p className="processing-title">Loading your workspace</p>
            <p className="processing-sub">Just a moment…</p>
          </div>
        </div>

        <FroqFooter />
      </div>
    </div>
  );
}

// Full-page loading state (header chrome + tab skeleton) shown while the
// merchant bundle is being fetched.
export function MerchantLoadingScreen({ tab = "dashboard" }: { tab?: MerchantTab }) {
  return (
    <div className="merchant-page merchant-theme">
      <div className="merchant-screen">
        <header className="merchant-header">
          <div className="merchant-header-brand">
            <div className="merchant-header-logo">
              <Image src="/froq-logo.png" alt="Froq" width={40} height={40} priority />
            </div>
            <div className="merchant-header-copy">
              <h1 className="merchant-header-name">Froq</h1>
              <div className="sk sk-line" style={{ width: 110, marginTop: 6 }} />
            </div>
          </div>
          <div className="merchant-header-actions">
            <div className="sk" style={{ width: 38, height: 38, borderRadius: 12 }} />
            <div className="sk" style={{ width: 38, height: 38, borderRadius: 12 }} />
          </div>
        </header>
        <MerchantTabSkeleton tab={tab} />
      </div>
    </div>
  );
}

export function MerchantTabSkeleton({ tab }: { tab: MerchantTab }) {
  switch (tab) {
    case "customers":
      return <CustomersSkeleton />;
    case "approvals":
      return <ApprovalsSkeleton />;
    case "scan":
      return <ScannerSkeleton />;
    case "profile":
    case "loyalty-settings":
    case "queue-settings":
      return <ProfileSkeleton />;
    default:
      return <DashboardSkeleton />;
  }
}
