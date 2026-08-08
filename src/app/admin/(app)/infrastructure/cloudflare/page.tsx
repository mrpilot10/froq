import { InfraProviderPage } from "@/components/admin/infra-provider-page";
import { getCloudflareInfrastructure } from "@/lib/admin/infrastructure";
import {
  formatNumber,
  formatRelativeTime,
  formatShortDate,
} from "@/lib/admin/format";

export default async function Page() {
  const data = await getCloudflareInfrastructure();
  const analytics = data.cloudflareAnalytics;

  return (
    <>
      <InfraProviderPage data={data} />

      {analytics ? (
        <>
          <section className="admin-panels" style={{ marginTop: 16 }}>
            <div className="admin-panel">
              <h2 className="admin-panel-title">Workers invocations (30d)</h2>
              <p className="admin-muted">
                GraphQL <code style={{ fontSize: 11 }}>workersInvocationsAdaptive</code>
                {analytics.scriptName ? (
                  <>
                    {" "}
                    · script{" "}
                    <code style={{ fontSize: 11 }}>{analytics.scriptName}</code>
                  </>
                ) : null}
                {" · "}
                {analytics.workers.detail}
              </p>
              <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Requests</th>
                      <th>Errors</th>
                      <th>Subrequests</th>
                      <th>CPU p50 / p99</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.workers.byDay.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="admin-empty-inline">
                          {analytics.tokenConfigured
                            ? analytics.workers.detail
                            : "Add CLOUDFLARE_API_TOKEN to load Workers time series."}
                        </td>
                      </tr>
                    ) : (
                      [...analytics.workers.byDay].reverse().map((d) => (
                        <tr key={d.day}>
                          <td>{d.day}</td>
                          <td>{formatNumber(d.requests)}</td>
                          <td>{formatNumber(d.errors)}</td>
                          <td>{formatNumber(d.subrequests)}</td>
                          <td className="admin-muted">
                            {d.cpuTimeP50 != null
                              ? `${d.cpuTimeP50.toFixed(1)} / ${d.cpuTimeP99?.toFixed(1) ?? "—"} µs`
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
              <h2 className="admin-panel-title">AI Gateway (30d)</h2>
              <p className="admin-muted">{analytics.aiGateway.detail}</p>
              <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Requests</th>
                      <th>Cached</th>
                      <th>Tokens in/out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.aiGateway.byDay.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="admin-empty-inline">
                          {analytics.aiGateway.detail}. Gemini traffic is metered
                          below via the Worker proxy (<code style={{ fontSize: 11 }}>ai_usage</code>).
                        </td>
                      </tr>
                    ) : (
                      [...analytics.aiGateway.byDay].reverse().map((d) => (
                        <tr key={d.day}>
                          <td>{d.day}</td>
                          <td>{formatNumber(d.requests)}</td>
                          <td>{formatNumber(d.cached)}</td>
                          <td className="admin-muted">
                            {formatNumber(d.tokensIn)} / {formatNumber(d.tokensOut)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {analytics.aiGateway.byProvider.length ? (
                <div className="admin-table-wrap" style={{ marginTop: 16, border: 0 }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Model</th>
                        <th>Requests</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.aiGateway.byProvider.map((p) => (
                        <tr key={`${p.provider}-${p.model}`}>
                          <td>{p.provider}</td>
                          <td>
                            <code style={{ fontSize: 11 }}>{p.model}</code>
                          </td>
                          <td>{formatNumber(p.requests)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </section>

          <section className="admin-panels">
            <div className="admin-panel">
              <h2 className="admin-panel-title">Gemini via Worker (ai_usage)</h2>
              <p className="admin-muted">
                In-app metering for froq-apoi <code style={{ fontSize: 11 }}>/ai/*</code>{" "}
                · {formatNumber(analytics.workerAi.totals.calls)} calls ·{" "}
                {formatNumber(analytics.workerAi.totals.totalTokens)} tokens /{" "}
                {analytics.workerAi.windowDays}d
              </p>
              <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Feature</th>
                      <th>Calls</th>
                      <th>Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.workerAi.byFeature.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="admin-empty-inline">
                          No Gemini calls logged yet.
                        </td>
                      </tr>
                    ) : (
                      analytics.workerAi.byFeature.map((f) => (
                        <tr key={f.feature}>
                          <td>
                            <code style={{ fontSize: 11 }}>{f.feature}</code>
                          </td>
                          <td>{formatNumber(f.calls)}</td>
                          <td>{formatNumber(f.totalTokens)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-panel">
              <h2 className="admin-panel-title">Turnstile pass / fail (30d)</h2>
              <p className="admin-muted">
                Server siteverify outcomes ·{" "}
                {analytics.turnstile.totals.passRate == null
                  ? "no samples yet"
                  : `${(analytics.turnstile.totals.passRate * 100).toFixed(1)}% pass`}
                {" · "}
                {formatNumber(analytics.turnstile.totals.attempts)} attempts
              </p>
              <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Pass</th>
                      <th>Fail</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.turnstile.byDay.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="admin-empty-inline">
                          Waiting for the next captcha check. New verifies write to{" "}
                          <code style={{ fontSize: 11 }}>turnstile_verify_log</code>.
                        </td>
                      </tr>
                    ) : (
                      analytics.turnstile.byDay.map((d) => (
                        <tr key={d.day}>
                          <td>{d.day}</td>
                          <td>{formatNumber(d.pass)}</td>
                          <td>{formatNumber(d.fail)}</td>
                          <td>{formatNumber(d.error)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {analytics.turnstile.byErrorCode.length ? (
                <div style={{ marginTop: 16 }}>
                  <h3 className="admin-panel-title" style={{ fontSize: 14 }}>
                    Top error codes
                  </h3>
                  <div className="admin-table-wrap" style={{ marginTop: 8, border: 0 }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.turnstile.byErrorCode.map((c) => (
                          <tr key={c.code}>
                            <td>
                              <code style={{ fontSize: 11 }}>{c.code}</code>
                            </td>
                            <td>{formatNumber(c.count)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="admin-panel" style={{ marginTop: 16 }}>
            <h2 className="admin-panel-title">Recent Turnstile verifies</h2>
            <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Codes</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.turnstile.recent.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="admin-empty-inline">
                        No verifies logged yet.
                      </td>
                    </tr>
                  ) : (
                    analytics.turnstile.recent.map((row) => (
                      <tr key={row.id}>
                        <td title={formatShortDate(row.at)}>
                          {formatRelativeTime(row.at)}
                        </td>
                        <td>
                          <span
                            className={[
                              "admin-pill",
                              row.status === "pass"
                                ? "admin-pill--good"
                                : row.status === "error"
                                  ? "admin-pill--bad"
                                  : "admin-pill--warn",
                            ].join(" ")}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="admin-muted">{row.source ?? "—"}</td>
                        <td className="admin-muted" style={{ fontSize: 11 }}>
                          {row.errorCodes.length ? row.errorCodes.join(", ") : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
