import Link from "next/link";
import {
  formatInr,
  formatNumber,
  formatRelativeTime,
  formatShortDate,
} from "@/lib/admin/format";
import { getPaymentsOverview } from "@/lib/admin/payments";

export default async function PaymentsPage() {
  const data = await getPaymentsOverview();

  return (
    <>
      <div className="admin-toolbar">
        <p className="admin-muted" style={{ margin: 0 }}>
          Razorpay live snapshot + local subscription links ·{" "}
          {formatShortDate(data.generatedAt)}
        </p>
      </div>

      {data.error ? (
        <section className="admin-balance-notice" role="status">
          <div className="admin-balance-notice-body">
            <strong>Razorpay</strong>
            <span>{data.error}</span>
          </div>
        </section>
      ) : null}

      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Captured (listed)</div>
          <div className="admin-stat-value">
            {formatNumber(data.totals.capturedCount)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {formatInr(data.totals.capturedInr)} gross
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Fees</div>
          <div className="admin-stat-value">
            {formatInr(data.totals.feesInr, { compact: true })}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            From Razorpay payment.fee
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">GST (tax)</div>
          <div className="admin-stat-value">
            {formatInr(data.totals.taxInr, { compact: true })}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            From Razorpay payment.tax
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Net · failed</div>
          <div className="admin-stat-value">
            {formatInr(data.totals.netInr, { compact: true })}
            <span className="admin-muted" style={{ fontSize: 14, marginLeft: 8 }}>
              / {formatNumber(data.totals.failedCount)} fail
            </span>
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <h2 className="admin-panel-title">Recent payments</h2>
        <p className="admin-muted">
          Live from Razorpay payments.all — fee and GST included when present.
        </p>
        <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Amount</th>
                <th>Fee</th>
                <th>GST</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-empty-inline">
                    No payments returned from Razorpay.
                  </td>
                </tr>
              ) : (
                data.recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td title={formatShortDate(p.createdAt)}>
                      {formatRelativeTime(p.createdAt)}
                    </td>
                    <td>
                      <code style={{ fontSize: 11 }}>{p.id}</code>
                      <div className="admin-muted" style={{ fontSize: 11 }}>
                        {p.method}
                        {p.email ? ` · ${p.email}` : ""}
                        {p.contact ? ` · ${p.contact}` : ""}
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
                    <td className="admin-muted">{formatInr(p.feeInr)}</td>
                    <td className="admin-muted">{formatInr(p.taxInr)}</td>
                    <td>{formatInr(p.netInr)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Razorpay subscriptions</h2>
          <p className="admin-muted">Live from Razorpay subscriptions.all.</p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Subscription</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Paid</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSubscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-empty-inline">
                      No subscriptions returned.
                    </td>
                  </tr>
                ) : (
                  data.recentSubscriptions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <code style={{ fontSize: 11 }}>{s.id}</code>
                      </td>
                      <td>
                        <span
                          className={[
                            "admin-pill",
                            s.status === "active"
                              ? "admin-pill--good"
                              : s.status === "expired" || s.status === "cancelled"
                                ? "admin-pill--bad"
                                : "admin-pill--warn",
                          ].join(" ")}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td>
                        <code style={{ fontSize: 11 }}>{s.planId}</code>
                      </td>
                      <td>
                        {formatNumber(s.paidCount)} / {formatNumber(s.totalCount)}
                      </td>
                      <td className="admin-muted" style={{ fontSize: 11 }}>
                        {s.currentStart
                          ? `${formatShortDate(s.currentStart)} → ${formatShortDate(s.currentEnd)}`
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">Linked in Froq</h2>
          <p className="admin-muted">
            merchant_products with razorpay_subscription_id.
          </p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Product</th>
                  <th>Plan</th>
                  <th>Subscription</th>
                </tr>
              </thead>
              <tbody>
                {data.localSubscriptions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-inline">
                      No local Razorpay subscription links yet.
                    </td>
                  </tr>
                ) : (
                  data.localSubscriptions.map((row) => (
                    <tr key={`${row.merchantId}-${row.product}-${row.razorpaySubscriptionId}`}>
                      <td>
                        <Link
                          href={`/admin/merchants?q=${encodeURIComponent(row.businessName)}`}
                        >
                          {row.businessName}
                        </Link>
                      </td>
                      <td>{row.productLabel}</td>
                      <td>
                        {row.planName ?? "—"}
                        {row.planId ? (
                          <div className="admin-muted" style={{ fontSize: 11 }}>
                            {row.planId}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <code style={{ fontSize: 11 }}>
                          {row.razorpaySubscriptionId}
                        </code>
                        <div className="admin-muted" style={{ fontSize: 11 }}>
                          {row.status} · {formatShortDate(row.purchasedAt)}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <h2 className="admin-panel-title">Still pending</h2>
        <ul className="admin-stub-list" style={{ marginTop: 8 }}>
          {data.pending.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
