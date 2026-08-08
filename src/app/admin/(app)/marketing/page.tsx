import {
  formatInr,
  formatNumber,
  formatShortDate,
} from "@/lib/admin/format";
import { getGa4Analytics } from "@/lib/admin/marketing-ga4";
import { getMarketingAdsOverview } from "@/lib/admin/marketing-ads";

function formatPct(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  // GA bounceRate is already 0–1 or 0–100 depending on API — treat >1 as percent.
  const pct = value > 1 ? value : value * 100;
  return `${pct.toFixed(digits)}%`;
}

function formatDuration(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

export default async function MarketingPage() {
  const [ga, ads] = await Promise.all([
    getGa4Analytics(30),
    getMarketingAdsOverview(30),
  ]);

  return (
    <>
      <div className="admin-toolbar">
        <p className="admin-muted" style={{ margin: 0 }}>
          Google Analytics 4
          {ga.measurementId ? (
            <>
              {" "}
              · <code style={{ fontSize: 11 }}>{ga.measurementId}</code>
            </>
          ) : null}
          {ga.propertyId ? (
            <>
              {" "}
              · property{" "}
              <code style={{ fontSize: 11 }}>{ga.propertyId}</code>
            </>
          ) : null}
          {" · "}
          last {ga.windowDays}d · {formatShortDate(new Date().toISOString())}
        </p>
        <span
          className={[
            "admin-pill",
            ga.configured ? "admin-pill--good" : "admin-pill--warn",
          ].join(" ")}
        >
          {ga.configured ? "GA4 live" : "GA4 setup"}
        </span>
      </div>

      {ga.error ? (
        <section className="admin-balance-notice" role="status">
          <div className="admin-balance-notice-body">
            <strong>Google Analytics</strong>
            <span>{ga.error}</span>
          </div>
        </section>
      ) : null}

      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Sessions</div>
          <div className="admin-stat-value">
            {formatNumber(ga.totals.sessions)}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Users</div>
          <div className="admin-stat-value">
            {formatNumber(ga.totals.users)}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Pageviews</div>
          <div className="admin-stat-value">
            {formatNumber(ga.totals.pageviews)}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Conversions</div>
          <div className="admin-stat-value">
            {formatNumber(ga.totals.conversions)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Bounce {formatPct(ga.totals.bounceRate)} · Avg session{" "}
            {formatDuration(ga.totals.avgSessionSec)}
          </div>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Traffic by day</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Sessions</th>
                  <th>Users</th>
                  <th>Pageviews</th>
                </tr>
              </thead>
              <tbody>
                {ga.byDay.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-inline">
                      No GA4 daily series yet.
                    </td>
                  </tr>
                ) : (
                  ga.byDay.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td>{formatNumber(d.sessions)}</td>
                      <td>{formatNumber(d.users)}</td>
                      <td>{formatNumber(d.pageviews)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">Channels</h2>
          <p className="admin-muted">
            Default channel group — Paid Search / Paid Social will appear once
            Google Ads &amp; Meta Ads campaigns send traffic.
          </p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Sessions</th>
                  <th>Users</th>
                </tr>
              </thead>
              <tbody>
                {ga.byChannel.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="admin-empty-inline">
                      Waiting on GA4 channel data.
                    </td>
                  </tr>
                ) : (
                  ga.byChannel.map((c) => (
                    <tr key={c.channel}>
                      <td>{c.channel}</td>
                      <td>{formatNumber(c.sessions)}</td>
                      <td>{formatNumber(c.users)}</td>
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
          <h2 className="admin-panel-title">Source / medium</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Medium</th>
                  <th>Sessions</th>
                  <th>Users</th>
                  <th>Conv.</th>
                </tr>
              </thead>
              <tbody>
                {ga.bySource.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="admin-empty-inline">
                      No source/medium rows yet.
                    </td>
                  </tr>
                ) : (
                  ga.bySource.map((s) => (
                    <tr key={`${s.source}|${s.medium}`}>
                      <td>{s.source}</td>
                      <td className="admin-muted">{s.medium}</td>
                      <td>{formatNumber(s.sessions)}</td>
                      <td>{formatNumber(s.users)}</td>
                      <td>{formatNumber(s.conversions)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">Top pages</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Views</th>
                  <th>Users</th>
                </tr>
              </thead>
              <tbody>
                {ga.byPage.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="admin-empty-inline">
                      No page paths yet.
                    </td>
                  </tr>
                ) : (
                  ga.byPage.map((p) => (
                    <tr key={p.path}>
                      <td>
                        <code style={{ fontSize: 11 }}>{p.path}</code>
                      </td>
                      <td>{formatNumber(p.pageviews)}</td>
                      <td>{formatNumber(p.users)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-toolbar" style={{ marginTop: 8 }}>
        <p className="admin-muted" style={{ margin: 0 }}>
          Paid acquisition · Meta Ads &amp; Google Ads spend (connect tokens to
          go live)
        </p>
      </section>

      <section className="admin-stat-row">
        {ads.platforms.map((p) => (
          <div key={p.id} className="admin-stat">
            <div className="admin-stat-label">{p.label}</div>
            <div className="admin-stat-value">
              {p.spendInr != null ? formatInr(p.spendInr) : "—"}
            </div>
            <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
              <span
                className={[
                  "admin-pill",
                  p.configured && p.spendInr != null
                    ? "admin-pill--good"
                    : "admin-pill--warn",
                ].join(" ")}
                style={{ marginRight: 6 }}
              >
                {p.configured ? "Connected" : "Pending"}
              </span>
              {p.detail}
              {p.clicks != null
                ? ` · ${formatNumber(p.clicks)} clicks · ${formatNumber(p.impressions ?? 0)} imps`
                : ""}
            </div>
          </div>
        ))}
        <div className="admin-stat">
          <div className="admin-stat-label">Site tag</div>
          <div className="admin-stat-value" style={{ fontSize: 16 }}>
            {ads.siteTag.measurementId ?? "—"}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            <span
              className={[
                "admin-pill",
                ads.siteTag.wiredInApp
                  ? "admin-pill--good"
                  : "admin-pill--warn",
              ].join(" ")}
              style={{ marginRight: 6 }}
            >
              {ads.siteTag.wiredInApp ? "In app" : "Missing"}
            </span>
            {ads.siteTag.detail}
          </div>
        </div>
      </section>

      <section className="admin-panels">
        {ads.platforms.map((p) => (
          <div key={`${p.id}-campaigns`} className="admin-panel">
            <h2 className="admin-panel-title">{p.label} campaigns</h2>
            <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Spend</th>
                    <th>Clicks</th>
                    <th>Impressions</th>
                  </tr>
                </thead>
                <tbody>
                  {p.byCampaign.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="admin-empty-inline">
                        {p.detail}
                      </td>
                    </tr>
                  ) : (
                    p.byCampaign.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td>{formatInr(c.spendInr)}</td>
                        <td>{formatNumber(c.clicks)}</td>
                        <td>{formatNumber(c.impressions)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>

      {ads.pending.length ? (
        <section className="admin-panel" style={{ marginTop: 16 }}>
          <h2 className="admin-panel-title">Still pending</h2>
          <ul className="admin-stub-list" style={{ marginTop: 8 }}>
            {!ga.propertyId ? (
              <li>
                GA4 numeric property ID — Admin → Property settings (beside
                Measurement ID {ga.measurementId ?? "G-…"})
              </li>
            ) : null}
            {!ga.configured && ga.propertyId ? (
              <li>
                Service account JSON with Viewer on the GA4 property (
                <code style={{ fontSize: 11 }}>GA4_SERVICE_ACCOUNT_JSON</code>)
              </li>
            ) : null}
            {ads.pending.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
