import Link from "next/link";
import { AdoptionPie, KpiCard, RevenueBars } from "@/components/admin/admin-charts";
import { PeriodFilter } from "@/components/admin/period-filter";
import { getDashboardFinance } from "@/lib/admin/dashboard-finance";
import { formatInr, formatNumber, formatShortDate } from "@/lib/admin/format";
import { getExecutiveDashboard } from "@/lib/admin/metrics";
import { parseAdminPeriod } from "@/lib/admin/period";

function formatPct(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

const DEDUCTION_LINES = [
  ["Razorpay fees", "razorpayFeesInr"],
  ["Razorpay tax", "razorpayTaxInr"],
  ["AI", "aiInr"],
  ["WhatsApp", "whatsappInr"],
  ["SMS", "smsInr"],
  ["Email", "emailInr"],
  ["Places", "placesInr"],
  ["Infra", "infraInr"],
] as const;

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const period = parseAdminPeriod(params.range);
  const [data, finance] = await Promise.all([
    getExecutiveDashboard(),
    getDashboardFinance(period),
  ]);

  const mrr = data.kpis.find((k) => k.id === "mrr")?.value ?? 0;

  // Ops KPIs only — finance lives in the hero above (no duplicate Revenue/Profit/MRR).
  const opsKpis = data.kpis.filter(
    (k) => !["revenue", "mrr", "arr"].includes(k.id),
  );

  const deductionRows = DEDUCTION_LINES.map(([label, key]) => ({
    label,
    amount: finance.deductions[key],
  })).filter((row) => row.amount > 0);

  const profitPositive = finance.profitInr >= 0;

  const topProducts = [...data.revenueByProduct].sort(
    (a, b) => b.mrr - a.mrr || b.count - a.count,
  );
  const productMrrTotal = topProducts.reduce((s, r) => s + r.mrr, 0);
  const mostUsedPlan = [...data.revenueByPlan].sort(
    (a, b) => b.count - a.count || b.mrr - a.mrr,
  )[0];
  const topProduct = topProducts.find((p) => p.mrr > 0 || p.count > 0);
  const hasPaidProducts = topProducts.some((p) => p.mrr > 0 || p.count > 0);

  return (
    <div className="admin-dash">
      <header className="admin-toolbar admin-dash-header">
        <p className="admin-muted admin-dash-sub" style={{ margin: 0 }}>
          Updated {formatShortDate(data.generatedAt)} · {finance.window.label}
        </p>
        <PeriodFilter pathname="/admin" period={period} searchParams={params} />
      </header>

      {/* —— Finance —— */}
      <section className="admin-dash-section" aria-labelledby="dash-finance">
        <div className="admin-dash-section-head">
          <h2 id="dash-finance" className="admin-dash-section-title">
            Finance
          </h2>
          <Link href="/admin/platform-costs" className="admin-dash-link">
            Platform costs
          </Link>
        </div>

        <div className="admin-finance-grid">
          <article className="admin-finance-card admin-finance-card--primary">
            <div className="admin-stat-label">Total revenue</div>
            <div className="admin-finance-value">
              {formatInr(finance.revenue.netSalesInr)}
            </div>
            <p className="admin-muted admin-finance-meta">
              {formatNumber(finance.revenue.capturedCount)} payments
              {finance.revenue.refundsInr > 0
                ? ` · refunds ${formatInr(finance.revenue.refundsInr)}`
                : ""}
            </p>
          </article>

          <article
            className={[
              "admin-finance-card",
              "admin-finance-card--primary",
              profitPositive
                ? "admin-finance-card--good"
                : "admin-finance-card--warn",
            ].join(" ")}
          >
            <div className="admin-stat-label">Total profit</div>
            <div className="admin-finance-value">
              {formatInr(finance.profitInr)}
            </div>
            <p className="admin-muted admin-finance-meta">
              Margin {formatPct(finance.profitMarginPct)} after all costs
            </p>
          </article>

          <article className="admin-finance-card">
            <div className="admin-stat-label">Deductions</div>
            <div className="admin-finance-value admin-finance-value--sm">
              {formatInr(finance.deductions.totalInr)}
            </div>
            <p className="admin-muted admin-finance-meta">
              Fees, ops &amp; infra
            </p>
          </article>

          <article className="admin-finance-card">
            <div className="admin-stat-label">MRR</div>
            <div className="admin-finance-value admin-finance-value--sm">
              {formatInr(mrr)}
            </div>
            <p className="admin-muted admin-finance-meta">
              Catalog run-rate ·{" "}
              <Link href="/admin/revenue" className="admin-dash-link">
                Revenue
              </Link>
            </p>
          </article>
        </div>

        {deductionRows.length > 0 ? (
          <div className="admin-panel admin-deductions">
            <div className="admin-deductions-head">
              <h3 className="admin-panel-title" style={{ margin: 0 }}>
                Cost breakdown
              </h3>
              <span className="admin-muted" style={{ fontSize: 12 }}>
                {finance.window.label}
              </span>
            </div>
            <ul className="admin-deductions-list">
              {deductionRows.map((row) => {
                const share =
                  finance.deductions.totalInr > 0
                    ? (row.amount / finance.deductions.totalInr) * 100
                    : 0;
                return (
                  <li key={row.label} className="admin-deductions-item">
                    <div className="admin-deductions-row">
                      <span>{row.label}</span>
                      <strong>{formatInr(row.amount)}</strong>
                    </div>
                    <div
                      className="admin-deductions-bar"
                      aria-hidden
                    >
                      <span style={{ width: `${Math.max(2, share)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </section>

      {/* —— Growth —— */}
      <section className="admin-dash-section" aria-labelledby="dash-growth">
        <div className="admin-dash-section-head">
          <h2 id="dash-growth" className="admin-dash-section-title">
            Growth
          </h2>
        </div>
        <div className="admin-grid-kpis admin-grid-kpis--ops">
          {opsKpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      </section>

      {/* —— Products —— */}
      <section className="admin-dash-section" aria-labelledby="dash-products">
        <div className="admin-dash-section-head">
          <h2 id="dash-products" className="admin-dash-section-title">
            Products
          </h2>
          <Link href="/admin/products" className="admin-dash-link">
            Adoption
          </Link>
        </div>

        <div className="admin-finance-grid" style={{ marginBottom: 14 }}>
          <article className="admin-finance-card admin-finance-card--primary">
            <div className="admin-stat-label">Product revenue (MRR)</div>
            <div className="admin-finance-value">{formatInr(productMrrTotal)}</div>
            <p className="admin-muted admin-finance-meta">
              Active paid plans · normalized monthly
            </p>
          </article>
          <article className="admin-finance-card">
            <div className="admin-stat-label">Top product</div>
            <div className="admin-finance-value admin-finance-value--sm">
              {topProduct ? topProduct.label : "—"}
            </div>
            <p className="admin-muted admin-finance-meta">
              {topProduct
                ? `${formatInr(topProduct.mrr)} · ${formatNumber(topProduct.count)} subs`
                : "No paid products yet"}
            </p>
          </article>
          <article className="admin-finance-card">
            <div className="admin-stat-label">Most used plan</div>
            <div className="admin-finance-value admin-finance-value--sm">
              {mostUsedPlan ? mostUsedPlan.name : "—"}
            </div>
            <p className="admin-muted admin-finance-meta">
              {mostUsedPlan
                ? `${formatNumber(mostUsedPlan.count)} merchants · ${formatInr(mostUsedPlan.mrr)}`
                : "No paid plans yet"}
            </p>
          </article>
        </div>

        <div className="admin-panels">
          <div className="admin-panel">
            <h3 className="admin-panel-title">Top products</h3>
            <p className="admin-muted">Ranked by MRR.</p>
            <div className="admin-table-wrap" style={{ marginTop: 10, border: 0 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Subs</th>
                    <th>MRR</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {!hasPaidProducts ? (
                    <tr>
                      <td colSpan={5} className="admin-empty-inline">
                        No paid product subscriptions yet.
                      </td>
                    </tr>
                  ) : (
                    topProducts.map((row, i) => {
                      const share =
                        productMrrTotal > 0
                          ? (row.mrr / productMrrTotal) * 100
                          : 0;
                      return (
                        <tr key={row.product}>
                          <td className="admin-muted">{i + 1}</td>
                          <td>{row.label}</td>
                          <td>{formatNumber(row.count)}</td>
                          <td>{formatInr(row.mrr)}</td>
                          <td>{formatPct(share, 0)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-panel">
            <h3 className="admin-panel-title">MRR by product</h3>
            <p className="admin-muted">Active paid plans, normalized monthly.</p>
            <RevenueBars data={data.revenueByProduct} />
          </div>
        </div>

        <div className="admin-panel" style={{ marginTop: 14 }}>
          <h3 className="admin-panel-title">Product mix</h3>
          <p className="admin-muted">Merchants on 1–4 products.</p>
          <AdoptionPie
            data={data.adoption.productCountBuckets.map((b) => ({
              label: `${b.products} product${b.products === 1 ? "" : "s"}`,
              value: b.merchants,
            }))}
          />
        </div>
      </section>

      {/* —— Activity —— */}
      <section className="admin-dash-section" aria-labelledby="dash-activity">
        <div className="admin-dash-section-head">
          <h2 id="dash-activity" className="admin-dash-section-title">
            Activity
          </h2>
          <Link href="/admin/live-feed" className="admin-dash-link">
            Live feed
          </Link>
        </div>
        <div className="admin-panels">
          <div className="admin-panel">
            <h3 className="admin-panel-title">Recent merchants</h3>
            <div className="admin-table-wrap" style={{ marginTop: 10, border: 0 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Products</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentMerchants.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link
                          href={`/admin/merchants?q=${encodeURIComponent(m.businessName)}`}
                        >
                          {m.businessName}
                        </Link>
                      </td>
                      <td>
                        {m.products.length ? (
                          m.products.map((p) => (
                            <span
                              key={p}
                              className="admin-pill"
                              style={{ marginRight: 4 }}
                            >
                              {p}
                            </span>
                          ))
                        ) : (
                          <span className="admin-muted">—</span>
                        )}
                      </td>
                      <td>{formatShortDate(m.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-panel">
            <h3 className="admin-panel-title">Latest events</h3>
            <ul className="admin-feed admin-feed--compact">
              {data.liveEvents.length === 0 ? (
                <li className="admin-empty-inline">
                  No events in the last 7 days.
                </li>
              ) : (
                data.liveEvents.slice(0, 10).map((ev) => (
                  <li key={ev.id}>
                    <span className="admin-feed-dot" />
                    <div>
                      <div className="admin-feed-title">{ev.title}</div>
                      <div className="admin-feed-sub">{ev.subtitle}</div>
                    </div>
                    <time className="admin-feed-time">
                      {formatShortDate(ev.at)}
                    </time>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
