import { getExecutiveDashboard } from "@/lib/admin/metrics";
import { formatNumber } from "@/lib/admin/format";

export default async function Page() {
  const data = await getExecutiveDashboard();
  const row = data.adoption.byProduct.find((p) => p.product === "queue");
  const mrr = data.revenueByProduct.find((p) => p.product === "queue");

  return (
    <>
      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Active businesses</div>
          <div className="admin-stat-value">{formatNumber(row?.active ?? 0)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Paid</div>
          <div className="admin-stat-value">{formatNumber(row?.paid ?? 0)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Trials</div>
          <div className="admin-stat-value">{formatNumber(row?.trial ?? 0)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">MRR</div>
          <div className="admin-stat-value">
            {(mrr?.mrr ?? 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}
          </div>
        </div>
      </section>
      <section className="admin-panel">
        <h2 className="admin-panel-title">Queue Management deep analytics</h2>
        <p className="admin-muted">
          Active queues, wait time, peak hours and abandonment across all merchants. Live adoption and MRR above are production figures from merchant_products.
        </p>
      </section>
    </>
  );
}
