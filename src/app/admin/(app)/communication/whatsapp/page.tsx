import Link from "next/link";
import {
  formatInr,
  formatNumber,
  formatRelativeTime,
  formatShortDate,
} from "@/lib/admin/format";
import {
  formatApitxtBalance,
  getApitxtBalance,
} from "@/lib/admin/apitxt-balance";
import { getWhatsAppCostAnalytics } from "@/lib/admin/whatsapp-costs";
import {
  listWhatsAppTemplateCategories,
  WHATSAPP_CATEGORY_LABEL,
} from "@/lib/whatsapp/templates/categories";
import { WHATSAPP_INDIA_RATE_INR } from "@/lib/whatsapp/pricing";

function formatRate(n: number): string {
  return `₹${n.toFixed(5)}`;
}

export default async function WhatsAppAdminPage() {
  const [apitxt, costs] = await Promise.all([
    getApitxtBalance(),
    getWhatsAppCostAnalytics(30),
  ]);
  const catalog = listWhatsAppTemplateCategories();

  return (
    <>
      <div className="admin-toolbar">
        <p className="admin-muted" style={{ margin: 0 }}>
          WhatsApp · Meta India rates · per successful message · last{" "}
          {costs.windowDays}d · {formatShortDate(costs.generatedAt)}
        </p>
        <Link href="/admin/communication" className="admin-muted" style={{ fontSize: 12 }}>
          ← Communication overview
        </Link>
      </div>

      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">API TXT credit</div>
          <div className="admin-stat-value">{formatApitxtBalance(apitxt)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Sent (30d)</div>
          <div className="admin-stat-value">{formatNumber(costs.totals.sent)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Failed (30d)</div>
          <div className="admin-stat-value">{formatNumber(costs.totals.failed)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Est. cost (30d)</div>
          <div className="admin-stat-value">
            {formatInr(costs.totals.costInr, { compact: true })}
          </div>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Cost by category</h2>
          <p className="admin-muted">
            India list rates (updated {costs.ratesUpdatedAt}). Charged once per
            successful send.
          </p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Rate / msg</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {costs.byCategory.map((row) => (
                  <tr key={row.category}>
                    <td>
                      <span
                        className={[
                          "admin-pill",
                          row.category === "MARKETING"
                            ? "admin-pill--warn"
                            : row.category === "AUTHENTICATION"
                              ? "admin-pill--good"
                              : "admin-pill--paid",
                        ].join(" ")}
                      >
                        {row.label}
                      </span>
                    </td>
                    <td className="admin-muted">
                      {row.rateInr > 0 ? formatRate(row.rateInr) : "—"}
                    </td>
                    <td>{formatNumber(row.sent)}</td>
                    <td>{formatNumber(row.failed)}</td>
                    <td>{formatInr(row.costInr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">India rate card</h2>
          <p className="admin-muted">Per conversation / message (India).</p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Rate</th>
                  <th>Templates</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["MARKETING", "Product announcements, promotions"],
                    ["UTILITY", "Order updates, alerts, confirmations"],
                    ["AUTHENTICATION", "OTP and account verification"],
                  ] as const
                ).map(([cat, blurb]) => (
                  <tr key={cat}>
                    <td>
                      <div>{WHATSAPP_CATEGORY_LABEL[cat]}</div>
                      <div className="admin-muted" style={{ fontSize: 11 }}>
                        {blurb}
                      </div>
                    </td>
                    <td>{formatRate(WHATSAPP_INDIA_RATE_INR[cat])}</td>
                    <td>
                      {formatNumber(
                        catalog.filter((t) => t.category === cat).length,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">By template</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Category</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {costs.byTemplate.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-empty-inline">
                      No WhatsApp sends logged yet. Apply migration 0093, then new
                      sends will appear here.
                    </td>
                  </tr>
                ) : (
                  costs.byTemplate.slice(0, 25).map((row) => (
                    <tr key={row.templateName}>
                      <td>
                        <code style={{ fontSize: 12 }}>{row.templateName}</code>
                      </td>
                      <td>
                        <span className="admin-pill">{row.category}</span>
                      </td>
                      <td>{formatNumber(row.sent)}</td>
                      <td>{formatNumber(row.failed)}</td>
                      <td>{formatInr(row.costInr)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">Recent sends</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {costs.recent.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-inline">
                      Waiting for the first logged send.
                    </td>
                  </tr>
                ) : (
                  costs.recent.map((row) => (
                    <tr key={row.id}>
                      <td title={formatShortDate(row.at)}>
                        {formatRelativeTime(row.at)}
                      </td>
                      <td>
                        <code style={{ fontSize: 11 }}>{row.templateName}</code>
                        <div className="admin-muted" style={{ fontSize: 11 }}>
                          {row.category}
                          {row.phoneLast4 ? ` · …${row.phoneLast4}` : ""}
                          {` · ${row.source}`}
                        </div>
                      </td>
                      <td>
                        <span
                          className={[
                            "admin-pill",
                            row.status === "sent"
                              ? "admin-pill--good"
                              : "admin-pill--bad",
                          ].join(" ")}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td>
                        {row.status === "sent" ? formatInr(row.costInr) : "—"}
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
