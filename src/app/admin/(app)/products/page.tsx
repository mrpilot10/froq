import { AdoptionPie } from "@/components/admin/admin-charts";
import { formatNumber } from "@/lib/admin/format";
import { getExecutiveDashboard } from "@/lib/admin/metrics";

export default async function AdminProductsPage() {
  const data = await getExecutiveDashboard();

  return (
    <>
      <section className="admin-stat-row">
        {data.adoption.byProduct.map((p) => (
          <div key={p.product} className="admin-stat">
            <div className="admin-stat-label">{p.label}</div>
            <div className="admin-stat-value">{formatNumber(p.active)}</div>
            <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
              {p.paid} paid · {p.trial} trial
            </div>
          </div>
        ))}
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Cross-sell depth</h2>
          <p className="admin-muted">How many products each active merchant runs.</p>
          <AdoptionPie
            data={data.adoption.productCountBuckets.map((b) => ({
              label: `${b.products} product${b.products === 1 ? "" : "s"}`,
              value: b.merchants,
            }))}
          />
        </div>
        <div className="admin-panel">
          <h2 className="admin-panel-title">Combination heatmap</h2>
          <p className="admin-muted">Top product stacks across merchants.</p>
          <div className="admin-combo-grid">
            {data.adoption.combinations.map((c) => (
              <div key={c.key} className="admin-combo">
                <strong>{c.merchants}</strong>
                <span>{c.label}</span>
              </div>
            ))}
            {data.adoption.combinations.length === 0 ? (
              <div className="admin-empty-inline">No active product stacks yet.</div>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
