import Link from "next/link";
import {
  formatNumber,
  formatRelativeTime,
  formatShortDate,
} from "@/lib/admin/format";
import { getCommunicationOverview } from "@/lib/admin/comms";
import type { ResendQuotaBucket } from "@/lib/admin/resend-quota";

function sourceLabel(source: ResendQuotaBucket["source"]) {
  if (source === "resend_header") return "Resend API header";
  if (source === "email_send_log") return "email_send_log fallback";
  return "—";
}

function Meter({
  label,
  bucket,
  helper,
  unlimited,
}: {
  label: string;
  bucket: ResendQuotaBucket;
  helper: string;
  unlimited?: boolean;
}) {
  const pct = unlimited
    ? 0
    : bucket.ratio == null
      ? 0
      : Math.min(100, Math.round(bucket.ratio * 100));
  const warn = !unlimited && bucket.ratio != null && bucket.ratio >= 0.8;
  return (
    <div className={`admin-quota-meter${warn ? " is-warn" : ""}`}>
      <div className="admin-quota-row">
        <span>{label}</span>
        <strong>
          {unlimited
            ? `${bucket.used == null ? "—" : formatNumber(bucket.used)} / Unlimited`
            : `${bucket.used == null ? "—" : formatNumber(bucket.used)}${
                bucket.limit != null ? ` / ${formatNumber(bucket.limit)}` : ""
              }`}
        </strong>
      </div>
      {!unlimited ? (
        <div className="admin-quota-track" aria-hidden="true">
          <div className="admin-quota-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      <p className="admin-quota-helper">
        {helper} · {sourceLabel(bucket.source)}
        {!unlimited && bucket.remaining != null
          ? ` · ${formatNumber(bucket.remaining)} left`
          : ""}
      </p>
    </div>
  );
}

export default async function EmailPage() {
  const data = await getCommunicationOverview();
  const channel = data.channels.find((c) => c.id === "email");
  const quota = data.resendQuota;
  const eventCounts = new Map<string, number>();
  for (const row of data.recentEmails) {
    eventCounts.set(row.lastEvent, (eventCounts.get(row.lastEvent) ?? 0) + 1);
  }

  return (
    <>
      <div className="admin-toolbar">
        <p className="admin-muted" style={{ margin: 0 }}>
          Resend Pro · {channel?.detail ?? "—"} · {formatShortDate(data.generatedAt)}
        </p>
        <Link href="/admin/communication" className="admin-muted" style={{ fontSize: 12 }}>
          ← Communication overview
        </Link>
      </div>

      {quota.low ? (
        <section className="admin-balance-notice" role="status">
          <div className="admin-balance-notice-body">
            <strong>Resend monthly quota running high</strong>
            <span>
              Pro plan is 50,000 emails / billing cycle (renews{" "}
              {formatShortDate(quota.billingPeriodRenewsAt)}). Enable pay-as-you-go
              or upgrade before sends fail with 429.
            </span>
          </div>
          <div className="admin-balance-notice-actions">
            <a
              href="https://resend.com/settings/usage"
              target="_blank"
              rel="noreferrer"
              className="admin-balance-notice-link"
            >
              Resend usage
            </a>
          </div>
        </section>
      ) : null}

      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Monthly (billing)</div>
          <div
            className="admin-stat-value"
            style={
              quota.monthly.ratio != null && quota.monthly.ratio >= 0.8
                ? { color: "#c45c4a" }
                : undefined
            }
          >
            {quota.monthly.used == null
              ? "—"
              : `${formatNumber(quota.monthly.used)}/${formatNumber(quota.monthly.limit ?? 50_000)}`}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Renews {formatShortDate(quota.billingPeriodRenewsAt)}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Sent (24h)</div>
          <div className="admin-stat-value">
            {formatNumber(quota.daily.used ?? quota.log.sentLast24h)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Daily limit unlimited on Pro
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">API rate limit</div>
          <div className="admin-stat-value" style={{ fontSize: 18 }}>
            {quota.rateLimit.remaining == null || quota.rateLimit.limit == null
              ? "10 req/s"
              : `${quota.rateLimit.remaining}/${quota.rateLimit.limit}`}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Team rate window
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Status</div>
          <div className="admin-stat-value" style={{ fontSize: 18 }}>
            {channel?.status === "ready" ? "Ready" : "Not configured"}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {quota.error ?? "Live from Resend + send log"}
          </div>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Quota meters</h2>
          <p className="admin-muted">
            Prefers <code style={{ fontSize: 11 }}>x-resend-monthly-quota</code> when
            Resend returns it; otherwise counts sent rows in{" "}
            <code style={{ fontSize: 11 }}>email_send_log</code> since{" "}
            {formatShortDate(quota.billingPeriodStart)}.
          </p>
          <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
            <Meter
              label="Monthly quota"
              bucket={quota.monthly}
              helper="50,000 emails / cycle on Pro"
            />
            <Meter
              label="Rolling 24h volume"
              bucket={quota.daily}
              helper="No daily cap on Pro — informational only"
              unlimited
            />
          </div>
          <p className="admin-muted" style={{ marginTop: 14, fontSize: 11 }}>
            Froq log · last 24h {formatNumber(quota.log.sentLast24h)} sent /{" "}
            {formatNumber(quota.log.failedLast24h)} failed · billing period{" "}
            {formatNumber(quota.log.sentBillingPeriod)} sent /{" "}
            {formatNumber(quota.log.failedBillingPeriod)} failed
          </p>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">Last event mix</h2>
          <p className="admin-muted">From the latest Resend list page (not full history).</p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {[...eventCounts.entries()].length === 0 ? (
                  <tr>
                    <td colSpan={2} className="admin-empty-inline">
                      No events yet.
                    </td>
                  </tr>
                ) : (
                  [...eventCounts.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([event, count]) => (
                      <tr key={event}>
                        <td>
                          <span className="admin-pill">{event}</span>
                        </td>
                        <td>{formatNumber(count)}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {data.emailError ? (
        <section className="admin-balance-notice" role="status">
          <div className="admin-balance-notice-body">
            <strong>Resend list error</strong>
            <span>{data.emailError}</span>
          </div>
        </section>
      ) : null}

      <section className="admin-panel">
        <h2 className="admin-panel-title">Recent sends</h2>
        <p className="admin-muted">Live from Resend emails.list — recipients masked.</p>
        <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Subject</th>
                <th>To</th>
                <th>From</th>
                <th>Event</th>
              </tr>
            </thead>
            <tbody>
              {data.recentEmails.length === 0 ? (
                <tr>
                  <td colSpan={5} className="admin-empty-inline">
                    {data.emailError ?? "No recent emails."}
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
                    <td className="admin-muted" style={{ fontSize: 11 }}>
                      {row.from}
                    </td>
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
