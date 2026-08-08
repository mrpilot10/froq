import Link from "next/link";
import {
  formatNumber,
  formatRelativeTime,
  formatShortDate,
} from "@/lib/admin/format";
import { getCommunicationOverview } from "@/lib/admin/comms";

function statusLabel(status: "ready" | "partial" | "missing") {
  if (status === "ready") return "Ready";
  if (status === "partial") return "Partial";
  return "Missing";
}

export default async function CommunicationOverviewPage() {
  const data = await getCommunicationOverview();

  return (
    <>
      <div className="admin-toolbar">
        <p className="admin-muted" style={{ margin: 0 }}>
          Live providers · API TXT + Resend · {formatShortDate(data.generatedAt)}
        </p>
      </div>

      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">API TXT credit</div>
          <div
            className="admin-stat-value"
            style={data.apitxtLow || data.apitxt.error ? { color: "#c45c4a" } : undefined}
          >
            {data.apitxtLabel}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {data.apitxt.error
              ? data.apitxt.error
              : data.apitxtLow
                ? "Below ₹1,000 — top up soon"
                : "WhatsApp / SMS / OTP wallet"}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Resend monthly</div>
          <div
            className="admin-stat-value"
            style={
              data.resendQuota.low || data.resendQuota.error
                ? { color: "#c45c4a" }
                : undefined
            }
          >
            {data.resendQuota.monthly.used == null
              ? "—"
              : `${formatNumber(data.resendQuota.monthly.used)}/${formatNumber(
                  data.resendQuota.monthly.limit ?? 50_000,
                )}`}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {data.resendQuota.error
              ? data.resendQuota.error
              : data.resendQuota.low
                ? "Above 80% of Pro monthly cap"
                : `Pro · renews ${formatShortDate(data.resendQuota.billingPeriodRenewsAt)}`}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Billing notices (30d)</div>
          <div className="admin-stat-value">
            {formatNumber(data.billingNotices30d)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            From billing_notice_log
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Open OTP rows</div>
          <div className="admin-stat-value">
            {formatNumber(data.otp.activeRows)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Unconsumed / unexpired otp_codes
          </div>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Channels</h2>
          <p className="admin-muted">Provider wiring from environment config.</p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.channels.map((ch) => (
                  <tr key={ch.id}>
                    <td>
                      <Link href={ch.href}>{ch.label}</Link>
                    </td>
                    <td>{ch.provider}</td>
                    <td>
                      <span
                        className={[
                          "admin-pill",
                          ch.status === "ready"
                            ? "admin-pill--good"
                            : ch.status === "partial"
                              ? "admin-pill--warn"
                              : "admin-pill--bad",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {statusLabel(ch.status)}
                      </span>
                    </td>
                    <td className="admin-muted">{ch.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">Still pending</h2>
          <p className="admin-muted">
            Live receipt tables are not ingested yet — overview uses providers +
            existing logs.
          </p>
          <ul className="admin-stub-list" style={{ marginTop: 12 }}>
            {data.pending.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="admin-panel">
        <h2 className="admin-panel-title">Recent email (Resend)</h2>
        <p className="admin-muted">
          Direct from Resend — opens/clicks/bounces need webhook ingestion.
        </p>
        <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Subject</th>
                <th>To</th>
                <th>Event</th>
              </tr>
            </thead>
            <tbody>
              {data.recentEmails.length === 0 ? (
                <tr>
                  <td colSpan={4} className="admin-empty-inline">
                    {data.emailError ?? "No recent Resend emails."}
                  </td>
                </tr>
              ) : (
                data.recentEmails.map((row) => (
                  <tr key={row.id}>
                    <td title={formatShortDate(row.createdAt)}>
                      {formatRelativeTime(row.createdAt)}
                    </td>
                    <td>{row.subject}</td>
                    <td className="admin-muted">{row.to}</td>
                    <td>
                      <span className="admin-pill">{row.lastEvent}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
