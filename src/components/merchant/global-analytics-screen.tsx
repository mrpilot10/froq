"use client";

import { BarChart3 } from "lucide-react";

/**
 * Workspace-level analytics hub — separate from product analytics.
 * Placeholder until the shared analytics experience is built.
 */
export function GlobalAnalyticsScreen() {
  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">All analytics</h2>
        <p className="tab-sub">Shared across your Froq products</p>
      </div>

      <div className="panel-card merchant-empty">
        <div className="merchant-empty-icon" aria-hidden="true">
          <BarChart3 size={26} strokeWidth={2} />
        </div>
        <p className="merchant-empty-title">Coming soon</p>
        <p className="merchant-empty-sub">
          This workspace analytics page will be a separate experience from Loyalty or Queue
          analytics. We&apos;ll build it next.
        </p>
      </div>
    </div>
  );
}
