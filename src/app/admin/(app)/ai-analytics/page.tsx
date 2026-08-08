import { FeatureBars, UsageArea } from "@/components/admin/admin-charts";
import {
  changePercent,
  formatInr,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatShortDate,
} from "@/lib/admin/format";
import { getAiAnalytics } from "@/lib/admin/metrics";

export default async function AiAnalyticsPage() {
  const data = await getAiAnalytics(30);
  const callDelta = changePercent(data.totals.calls, data.totals.prevCalls);
  const tokenDelta = changePercent(data.totals.tokens, data.totals.prevTokens);
  const costDelta = changePercent(
    data.totals.estimatedInr,
    data.totals.prevEstimatedInr,
  );

  return (
    <>
      <div className="admin-toolbar">
        <p className="admin-muted" style={{ margin: 0 }}>
          Last {data.windowDays} days · Gemini Flash list-price estimate ·{" "}
          {formatShortDate(data.generatedAt)}
        </p>
      </div>

      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Calls</div>
          <div className="admin-stat-value">
            {formatNumber(data.totals.calls, { compact: true })}
          </div>
          {callDelta != null ? (
            <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
              {formatPercent(callDelta)} vs prior {data.windowDays}d
            </div>
          ) : null}
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Tokens</div>
          <div className="admin-stat-value">
            {formatNumber(data.totals.tokens, { compact: true })}
          </div>
          {tokenDelta != null ? (
            <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
              {formatPercent(tokenDelta)} vs prior {data.windowDays}d
            </div>
          ) : null}
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Est. cost (INR)</div>
          <div className="admin-stat-value">
            {formatInr(data.totals.estimatedInr, { compact: true })}
          </div>
          {costDelta != null ? (
            <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
              {formatPercent(costDelta)} vs prior {data.windowDays}d
            </div>
          ) : null}
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Merchants · images</div>
          <div className="admin-stat-value">
            {formatNumber(data.totals.merchants)}
            <span className="admin-muted" style={{ fontSize: 14, marginLeft: 8 }}>
              / {formatNumber(data.totals.imageCalls)} img
            </span>
          </div>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Daily calls</h2>
          <p className="admin-muted">Platform-wide Gemini invocations from ai_usage.</p>
          <UsageArea data={data.byDay} valueKey="calls" />
        </div>
        <div className="admin-panel">
          <h2 className="admin-panel-title">By feature</h2>
          <p className="admin-muted">Which product surfaces burn the most calls.</p>
          <FeatureBars
            data={data.byFeature.map((f) => ({
              label: f.label,
              calls: f.calls,
              costInr: f.costInr,
            }))}
          />
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Top merchants by cost</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Calls</th>
                  <th>Tokens</th>
                  <th>Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {data.topMerchants.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-inline">
                      No AI usage in this window.
                    </td>
                  </tr>
                ) : (
                  data.topMerchants.map((m) => (
                    <tr key={m.merchantId}>
                      <td>{m.businessName}</td>
                      <td>{formatNumber(m.calls)}</td>
                      <td>{formatNumber(m.tokens, { compact: true })}</td>
                      <td>{formatInr(m.costInr)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">Models</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Calls</th>
                  <th>Tokens</th>
                  <th>Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {data.byModel.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-empty-inline">
                      No models recorded.
                    </td>
                  </tr>
                ) : (
                  data.byModel.map((m) => (
                    <tr key={m.model}>
                      <td>{m.model}</td>
                      <td>{formatNumber(m.calls)}</td>
                      <td>{formatNumber(m.tokens, { compact: true })}</td>
                      <td>{formatInr(m.costInr)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-panel">
        <h2 className="admin-panel-title">Recent calls</h2>
        <p className="admin-muted">Latest attributed Gemini invocations.</p>
        <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Feature</th>
                <th>Merchant</th>
                <th>Model</th>
                <th>Tokens</th>
                <th>Est.</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-empty-inline">
                    No recent AI calls.
                  </td>
                </tr>
              ) : (
                data.recent.map((r) => (
                  <tr key={r.id}>
                    <td title={formatShortDate(r.at)}>{formatRelativeTime(r.at)}</td>
                    <td>{r.featureLabel}</td>
                    <td>{r.businessName ?? "—"}</td>
                    <td>
                      <span className="admin-muted" style={{ fontSize: 11 }}>
                        {r.model}
                      </span>
                    </td>
                    <td>{formatNumber(r.tokens, { compact: true })}</td>
                    <td>{formatInr(r.costInr)}</td>
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
