"use client";

import { Users } from "lucide-react";

/**
 * Workspace-level customers hub — separate from product-specific CRM.
 * Placeholder until the shared customers experience is built.
 */
export function GlobalCustomersScreen() {
  return (
    <div className="tab-screen">
      <div className="tab-head">
        <h2 className="tab-title">All customers</h2>
        <p className="tab-sub">Shared across your Froq products</p>
      </div>

      <div className="panel-card merchant-empty">
        <div className="merchant-empty-icon" aria-hidden="true">
          <Users size={26} strokeWidth={2} />
        </div>
        <p className="merchant-empty-title">Coming soon</p>
        <p className="merchant-empty-sub">
          This workspace customers page will be a separate experience from Loyalty or Queue
          customers. We&apos;ll build it next.
        </p>
      </div>
    </div>
  );
}
