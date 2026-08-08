import {
  formatInr,
  formatNumber,
  formatShortDate,
} from "@/lib/admin/format";
import { getPlatformCostsOverview } from "@/lib/admin/platform-costs";
import { getTrialEconomics } from "@/lib/admin/trial-economics";

function confidencePill(confidence: "metered" | "estimate" | "snapshot"): string {
  if (confidence === "metered") return "admin-pill--good";
  if (confidence === "estimate") return "admin-pill--warn";
  return "admin-pill--warn";
}

function formatPct(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export default async function PlatformCostsPage() {
  const [data, trial] = await Promise.all([
    getPlatformCostsOverview(),
    getTrialEconomics(30),
  ]);
  const { calendar, revenue, spend, margin, runway } = data;

  return (
    <>
      <div className="admin-toolbar">
        <p className="admin-muted" style={{ margin: 0 }}>
          Metered + list-price estimates vs catalog MRR · {calendar.monthLabel} ·
          day {calendar.dayOfMonth}/{calendar.daysInMonth} ·{" "}
          {formatShortDate(data.generatedAt)}
        </p>
        <span
          className={[
            "admin-pill",
            runway.cashFlowPositive ? "admin-pill--good" : "admin-pill--bad",
          ].join(" ")}
        >
          {runway.cashFlowPositive
            ? "Projected month cash-flow +"
            : "Projected month cash-flow −"}
        </span>
      </div>

      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Spend MTD</div>
          <div className="admin-stat-value">{formatInr(spend.mtdInr)}</div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {formatInr(spend.dailyBurnInr)}/day avg
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Projected month spend</div>
          <div className="admin-stat-value">
            {formatInr(spend.projectedMonthInr)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            30d actual {formatInr(spend.last30dInr)}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">MRR (catalog)</div>
          <div className="admin-stat-value">{formatInr(revenue.mrrInr)}</div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {formatNumber(revenue.paidSubscriptions)} paid · MTD earned{" "}
            {formatInr(revenue.mtdEarnedInr)}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Projected gross margin</div>
          <div className="admin-stat-value">
            {formatPct(margin.projectedGrossPct)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {formatInr(margin.projectedGrossInr)} · MTD{" "}
            {formatPct(margin.mtdGrossPct)}
          </div>
        </div>
      </section>

      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Month-end projection</div>
          <div className="admin-stat-value">
            {formatInr(runway.projectedMonthEndInr)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            MRR − projected variable spend · {calendar.daysRemaining}d left
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">MRR covers spend</div>
          <div className="admin-stat-value">
            {runway.mrrCoversMonthsOfSpend == null
              ? "∞"
              : `${runway.mrrCoversMonthsOfSpend.toFixed(1)}×`}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Months of projected spend covered by one MRR
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">ApiTxt wallet runway</div>
          <div className="admin-stat-value">{runway.apitxtLabel}</div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {runway.messagingDaysRemaining == null
              ? runway.messagingDailyBurnInr <= 0
                ? "No WA burn yet this month"
                : "Balance unavailable"
              : `~${Math.floor(runway.messagingDaysRemaining)} days at ${formatInr(runway.messagingDailyBurnInr)}/day WA`}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Cash runway</div>
          <div className="admin-stat-value">
            {runway.cashMonthsRemaining != null
              ? `${runway.cashMonthsRemaining.toFixed(1)} mo`
              : runway.cashFlowPositive
                ? "Positive"
                : "—"}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {runway.operatingCashInr != null
              ? `PLATFORM_CASH_INR ${formatInr(runway.operatingCashInr)}`
              : "Set PLATFORM_CASH_INR for months-of-cash"}
          </div>
        </div>
      </section>

      <section className="admin-toolbar" style={{ marginTop: 8 }}>
        <p className="admin-muted" style={{ margin: 0 }}>
          Trial economics · free 7-day product trials · spend attributed via
          merchant_id meters
        </p>
      </section>

      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Active trial merchants</div>
          <div className="admin-stat-value">
            {formatNumber(trial.funnel.activeMerchants)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {formatNumber(trial.funnel.activeTrials)} product trials running
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Trial spend (30d)</div>
          <div className="admin-stat-value">
            {formatInr(trial.cost.duringTrialWindow30dInr)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            During trial windows · MTD{" "}
            {formatInr(trial.cost.duringTrialWindowMtdInr)}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Active-trial burn (30d)</div>
          <div className="admin-stat-value">
            {formatInr(trial.cost.activeTrialMerchants30dInr)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {trial.cost.costPerActiveTrialMerchantInr != null
              ? `${formatInr(trial.cost.costPerActiveTrialMerchantInr)} / merchant`
              : "No active trials"}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Conversion</div>
          <div className="admin-stat-value">
            {formatPct(trial.funnel.merchantConversionRate)}
          </div>
          <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
            {formatNumber(trial.funnel.convertedMerchants)} /{" "}
            {formatNumber(trial.funnel.merchantsStarted)} merchants · product{" "}
            {formatPct(trial.funnel.conversionRate)}
          </div>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Trial funnel</h2>
          <p className="admin-muted">
            Converted = started a free trial and later purchased a paid plan (
            <code style={{ fontSize: 11 }}>trial_started_at</code> kept,{" "}
            <code style={{ fontSize: 11 }}>plan_id</code> set).
          </p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Trials started (all time)</td>
                  <td>
                    {formatNumber(trial.funnel.trialsStarted)} products ·{" "}
                    {formatNumber(trial.funnel.merchantsStarted)} merchants
                  </td>
                </tr>
                <tr>
                  <td>Converted</td>
                  <td>
                    {formatNumber(trial.funnel.converted)} products ·{" "}
                    {formatNumber(trial.funnel.convertedMerchants)} merchants
                  </td>
                </tr>
                <tr>
                  <td>Expired, no purchase</td>
                  <td>{formatNumber(trial.funnel.expiredUnconverted)}</td>
                </tr>
                <tr>
                  <td>Started last 30d</td>
                  <td>{formatNumber(trial.funnel.startedLast30d)}</td>
                </tr>
                <tr>
                  <td>Converted last 30d</td>
                  <td>
                    {formatNumber(trial.funnel.convertedLast30d)} (
                    {formatPct(trial.funnel.conversionRateLast30d)})
                  </td>
                </tr>
                <tr>
                  <td>Trial burn / conversion (30d)</td>
                  <td>
                    {trial.cost.costPerConversion30dInr != null
                      ? formatInr(trial.cost.costPerConversion30dInr)
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <td>Active trial channel split (30d)</td>
                  <td className="admin-muted">
                    AI {formatInr(trial.cost.byChannel.aiInr)} · WA{" "}
                    {formatInr(trial.cost.byChannel.whatsappInr)} · SMS{" "}
                    {formatInr(trial.cost.byChannel.smsInr)} · Places{" "}
                    {formatInr(trial.cost.byChannel.placesInr)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">By product</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Started</th>
                  <th>Active</th>
                  <th>Converted</th>
                  <th>Expired</th>
                  <th>Conv %</th>
                  <th>Active burn 30d</th>
                </tr>
              </thead>
              <tbody>
                {trial.byProduct.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="admin-empty-inline">
                      No trials recorded yet.
                    </td>
                  </tr>
                ) : (
                  trial.byProduct.map((row) => (
                    <tr key={row.product}>
                      <td>{row.label}</td>
                      <td>{formatNumber(row.started)}</td>
                      <td>{formatNumber(row.active)}</td>
                      <td>{formatNumber(row.converted)}</td>
                      <td>{formatNumber(row.expired)}</td>
                      <td>{formatPct(row.conversionRate)}</td>
                      <td>{formatInr(row.cost30dInr)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-panel" style={{ marginTop: 16 }}>
        <h2 className="admin-panel-title">Top trial spenders (30d)</h2>
        <p className="admin-muted">
          Ranked by cost inside the trial window (AI / WhatsApp / SMS / Places
          with merchant_id).
        </p>
        <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Products</th>
                <th>Status</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {trial.topTrialSpenders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="admin-empty-inline">
                    No trial-attributed merchant spend in the last 30 days.
                  </td>
                </tr>
              ) : (
                trial.topTrialSpenders.map((row) => (
                  <tr key={row.merchantId}>
                    <td>
                      {row.businessName}
                      <div className="admin-muted" style={{ fontSize: 11 }}>
                        <code>{row.merchantId.slice(0, 8)}…</code>
                      </div>
                    </td>
                    <td className="admin-muted">{row.products.join(", ")}</td>
                    <td>
                      <span
                        className={[
                          "admin-pill",
                          row.status === "converted"
                            ? "admin-pill--good"
                            : row.status === "active_trial"
                              ? "admin-pill--warn"
                              : "admin-pill--bad",
                        ].join(" ")}
                      >
                        {row.status === "active_trial"
                          ? "Active trial"
                          : row.status === "converted"
                            ? "Converted"
                            : "Expired"}
                      </span>
                    </td>
                    <td>{formatInr(row.cost30dInr)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Cost lines</h2>
          <p className="admin-muted">
            Aggregate infra-adjacent + AI + messaging spend. Cloudflare uses GA
            billing history when available; otherwise{" "}
            <code style={{ fontSize: 11 }}>PLATFORM_COST_CLOUDFLARE_INR_MONTH</code>{" "}
            (default ₹0). The restricted{" "}
            <code style={{ fontSize: 11 }}>/billable/usage</code> API is not used.
          </p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Confidence</th>
                  <th>MTD</th>
                  <th>30d</th>
                  <th>Proj. month</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {spend.lines.map((line) => (
                  <tr key={line.id}>
                    <td>
                      {line.label}
                      <div className="admin-muted" style={{ fontSize: 11 }}>
                        {line.basis}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`admin-pill ${confidencePill(line.confidence)}`}
                      >
                        {line.confidence}
                      </span>
                    </td>
                    <td>{formatInr(line.mtdInr)}</td>
                    <td>{formatInr(line.last30dInr)}</td>
                    <td>{formatInr(line.projectedMonthInr)}</td>
                    <td className="admin-muted">
                      {spend.projectedMonthInr > 0
                        ? `${((line.projectedMonthInr / spend.projectedMonthInr) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total variable</strong>
                  </td>
                  <td />
                  <td>
                    <strong>{formatInr(spend.mtdInr)}</strong>
                  </td>
                  <td>
                    <strong>{formatInr(spend.last30dInr)}</strong>
                  </td>
                  <td>
                    <strong>{formatInr(spend.projectedMonthInr)}</strong>
                  </td>
                  <td>100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">Gross margin</h2>
          <p className="admin-muted">
            Revenue is catalog MRR from active paid{" "}
            <code style={{ fontSize: 11 }}>merchant_products</code>. Costs are
            variable meters only — fixed infra invoices are not included yet.
          </p>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Projected month revenue (MRR)</td>
                  <td>{formatInr(revenue.projectedMonthInr)}</td>
                </tr>
                <tr>
                  <td>Projected month variable spend</td>
                  <td>{formatInr(spend.projectedMonthInr)}</td>
                </tr>
                <tr>
                  <td>Projected gross profit</td>
                  <td>{formatInr(margin.projectedGrossInr)}</td>
                </tr>
                <tr>
                  <td>Projected gross margin</td>
                  <td>{formatPct(margin.projectedGrossPct)}</td>
                </tr>
                <tr>
                  <td>MTD earned (prorated MRR)</td>
                  <td>{formatInr(revenue.mtdEarnedInr)}</td>
                </tr>
                <tr>
                  <td>MTD spend</td>
                  <td>{formatInr(spend.mtdInr)}</td>
                </tr>
                <tr>
                  <td>MTD gross</td>
                  <td>
                    {formatInr(margin.mtdGrossInr)} ({formatPct(margin.mtdGrossPct)})
                  </td>
                </tr>
                <tr>
                  <td>30d spend vs MRR</td>
                  <td>{formatPct(margin.last30dSpendVsMrrPct)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="admin-panel" style={{ marginTop: 16 }}>
        <h2 className="admin-panel-title">Daily variable spend (30d)</h2>
        <p className="admin-muted">
          AI + WhatsApp + SMS + Email + Places (Razorpay &amp; infra invoices are
          not day-split here).
        </p>
        <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>AI</th>
                <th>WhatsApp</th>
                <th>SMS</th>
                <th>Email</th>
                <th>Places</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {data.byDay.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-empty-inline">
                    No metered spend in the last 30 days.
                  </td>
                </tr>
              ) : (
                data.byDay.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{formatInr(d.aiInr)}</td>
                    <td>{formatInr(d.whatsappInr)}</td>
                    <td>{formatInr(d.smsInr)}</td>
                    <td>{formatInr(d.emailInr)}</td>
                    <td>{formatInr(d.placesInr)}</td>
                    <td>{formatInr(d.spendInr)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-panel" style={{ marginTop: 16 }}>
        <h2 className="admin-panel-title">Resend email unit-cost series (30d)</h2>
        <p className="admin-muted">
          From <code style={{ fontSize: 11 }}>email_send_log</code> · $0.40 /
          1,000 emails list price.
        </p>
        <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Sends</th>
                <th>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {data.emailByDay.length === 0 ? (
                <tr>
                  <td colSpan={3} className="admin-empty-inline">
                    No tracked Resend sends yet — new emails write to the ledger.
                  </td>
                </tr>
              ) : (
                data.emailByDay.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{formatNumber(d.sends)}</td>
                    <td>{formatInr(d.costInr)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data.pending.length ? (
        <section className="admin-panel" style={{ marginTop: 16 }}>
          <h2 className="admin-panel-title">Still pending</h2>
          <ul className="admin-stub-list" style={{ marginTop: 8 }}>
            {data.pending.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
