import {
  formatInr,
  formatNumber,
  formatRelativeTime,
  formatShortDate,
} from "@/lib/admin/format";
import { getExecutiveDashboard } from "@/lib/admin/metrics";
import { getRevenueAnalytics } from "@/lib/admin/revenue-analytics";
import { RevenueBars } from "@/components/admin/admin-charts";

function formatPct(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export default async function AdminRevenuePage() {
  const [dash, revenue] = await Promise.all([
    getExecutiveDashboard(),
    getRevenueAnalytics(),
  ]);
  const mrr = revenue.catalog.mrrInr;
  const arr = revenue.catalog.arrInr;
  const paid = revenue.catalog.paidSubscriptions;
  const trials = revenue.catalog.trials;
  const arpu = revenue.catalog.arpuInr;

  return (
    <>
      <div className="admin-toolbar">
        <p className="admin-muted" style={{ margin: 0 }}>
          Catalog MRR + Razorpay payment ledger · synced{" "}
          {formatNumber(revenue.syncedPayments)} payments ·{" "}
          {formatShortDate(revenue.generatedAt)}
        </p>
        {revenue.syncError ? (
          <span className="admin-pill admin-pill--warn">{revenue.syncError}</span>
        ) : (
          <span className="admin-pill admin-pill--good">Ledger live</span>
        )}
      </div>

      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">MRR</div>
          <div className="admin-stat-value">{formatInr(mrr)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">ARR</div>
          <div className="admin-stat-value">{formatInr(arr)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">ARPU</div>
          <div className="admin-stat-value">{formatInr(arpu)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Paid / Trials</div>
          <div className="admin-stat-value">
            {paid}
            <span className="admin-muted" style={{ fontSize: 14, fontWeight: 600 }}>
              {" "}
              / {trials}
            </span>
          </div>
        </div>
      </section>

      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Gross captured (30d)</div>
          <div className="admin-stat-value">
            {formatInr(revenue.ledger.grossCaptured30dInr)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            MTD {formatInr(revenue.ledger.grossCapturedMtdInr)} · all-time ledger{" "}
            {formatInr(revenue.ledger.grossCapturedInr)}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Refunds (30d)</div>
          <div className="admin-stat-value">
            {formatInr(revenue.ledger.refunds30dInr)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            All-time {formatInr(revenue.ledger.refundsInr)}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Failed renewals (30d)</div>
          <div className="admin-stat-value">
            {formatNumber(revenue.failedRenewals.count30d)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {formatNumber(revenue.failedRenewals.countAll)} total ·{" "}
            {formatNumber(revenue.ledger.failedPayments30d)} failed payments
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">LTV (proxy)</div>
          <div className="admin-stat-value">
            {revenue.ltv.estimatedInr != null
              ? formatInr(revenue.ltv.estimatedInr)
              : "—"}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {revenue.ltv.monthlyChurnPct != null && revenue.ltv.monthlyChurnPct > 0
              ? `ARPU ÷ ${formatPct(revenue.ltv.monthlyChurnPct)} cancel-pending churn`
              : "ARPU × 12 (no cancel-pending churn)"}
            {revenue.ltv.avgNetPerPayerInr != null
              ? ` · avg net/payer ${formatInr(revenue.ltv.avgNetPerPayerInr)}`
              : ""}
          </div>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Revenue by product</h2>
          <p className="admin-muted">MRR contribution by Froq product line.</p>
          <RevenueBars data={dash.revenueByProduct} />
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">Country split</h2>
          <p className="admin-muted">
            From Razorpay payment country / domestic flag (IN vs card country /
            INTL).
          </p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Payments</th>
                  <th>Gross</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {revenue.byCountry.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-inline">
                      No captured payments in the ledger yet.
                    </td>
                  </tr>
                ) : (
                  revenue.byCountry.map((row) => (
                    <tr key={row.country}>
                      <td>{row.country}</td>
                      <td>{formatNumber(row.payments)}</td>
                      <td>{formatInr(row.capturedInr)}</td>
                      <td>{formatPct(row.sharePct)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Revenue by plan</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th>Subscriptions</th>
                  <th>MRR</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {dash.revenueByPlan.map((row) => (
                  <tr key={row.planId}>
                    <td>
                      {row.name}
                      <div className="admin-muted" style={{ fontSize: 11 }}>
                        {row.planId}
                      </div>
                    </td>
                    <td>{row.count}</td>
                    <td>{formatInr(row.mrr)}</td>
                    <td>
                      {mrr > 0 ? `${((row.mrr / mrr) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
                {dash.revenueByPlan.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-inline">
                      No paid plans yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">Payment methods</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Payments</th>
                  <th>Gross</th>
                </tr>
              </thead>
              <tbody>
                {revenue.byMethod.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="admin-empty-inline">
                      No captured payments yet.
                    </td>
                  </tr>
                ) : (
                  revenue.byMethod.map((row) => (
                    <tr key={row.method}>
                      <td>{row.method}</td>
                      <td>{formatNumber(row.payments)}</td>
                      <td>{formatInr(row.capturedInr)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Recent ledger payments</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Refunded</th>
                  <th>Country</th>
                </tr>
              </thead>
              <tbody>
                {revenue.recentPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="admin-empty-inline">
                      Ledger empty — sync runs when this page loads.
                    </td>
                  </tr>
                ) : (
                  revenue.recentPayments.map((p) => (
                    <tr key={p.paymentId}>
                      <td title={formatShortDate(p.at)}>
                        {formatRelativeTime(p.at)}
                      </td>
                      <td>
                        <code style={{ fontSize: 11 }}>{p.paymentId}</code>
                        <div className="admin-muted" style={{ fontSize: 11 }}>
                          {p.method ?? "—"}
                        </div>
                      </td>
                      <td>
                        <span
                          className={[
                            "admin-pill",
                            p.status === "captured"
                              ? "admin-pill--good"
                              : p.status === "failed"
                                ? "admin-pill--bad"
                                : "admin-pill--warn",
                          ].join(" ")}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td>{formatInr(p.amountInr)}</td>
                      <td>{formatInr(p.refundedInr)}</td>
                      <td>{p.country ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">Failed renewals</h2>
          <p className="admin-muted">
            From subscription events + failed payments. Wire{" "}
            <code style={{ fontSize: 11 }}>/api/webhooks/razorpay</code> with{" "}
            <code style={{ fontSize: 11 }}>RAZORPAY_WEBHOOK_SECRET</code> for
            real-time updates.
          </p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Subscription</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {revenue.failedRenewals.recent.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-inline">
                      No failed renewals recorded yet.
                    </td>
                  </tr>
                ) : (
                  revenue.failedRenewals.recent.map((e, idx) => (
                    <tr key={`${e.subscriptionId}-${e.at}-${idx}`}>
                      <td title={formatShortDate(e.at)}>
                        {formatRelativeTime(e.at)}
                      </td>
                      <td>
                        <code style={{ fontSize: 11 }}>{e.eventType}</code>
                      </td>
                      <td>
                        <code style={{ fontSize: 11 }}>
                          {e.subscriptionId.slice(0, 14)}…
                        </code>
                        {e.amountInr != null ? (
                          <div className="admin-muted" style={{ fontSize: 11 }}>
                            {formatInr(e.amountInr)}
                          </div>
                        ) : null}
                      </td>
                      <td className="admin-muted" style={{ fontSize: 11 }}>
                        {e.error ?? e.paymentId ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
