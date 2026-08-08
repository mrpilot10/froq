import Link from "next/link";
import { formatInr, formatNumber, formatShortDate } from "@/lib/admin/format";
import { listMerchants } from "@/lib/admin/metrics";

export default async function AdminMerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { merchants, total } = await listMerchants({ q, limit: 150 });
  const active = merchants.filter((m) =>
    m.products.some((p) => p.status === "paid" || p.status === "trial"),
  ).length;
  const paid = merchants.filter((m) => m.products.some((p) => p.status === "paid")).length;
  const totalMrr = merchants.reduce((s, m) => s + m.mrr, 0);

  return (
    <>
      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Listed</div>
          <div className="admin-stat-value">{formatNumber(total)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Active</div>
          <div className="admin-stat-value">{formatNumber(active)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Paid</div>
          <div className="admin-stat-value">{formatNumber(paid)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">MRR (listed)</div>
          <div className="admin-stat-value">{formatInr(totalMrr, { compact: true })}</div>
        </div>
      </section>

      <form className="admin-toolbar" action="/admin/merchants" method="get">
        <input
          className="admin-search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search business or email…"
        />
        <button className="admin-login-btn" style={{ width: "auto", padding: "0 16px" }} type="submit">
          Search
        </button>
      </form>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Products</th>
              <th>Branches</th>
              <th>Customers</th>
              <th>MRR</th>
              <th>Score</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {merchants.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/admin/merchants`}>{m.businessName}</Link>
                  {m.email ? (
                    <div className="admin-muted" style={{ fontSize: 11 }}>
                      {m.email}
                    </div>
                  ) : null}
                </td>
                <td>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {m.products.length === 0 ? (
                      <span className="admin-muted">None</span>
                    ) : (
                      m.products.map((p) => (
                        <span
                          key={p.product}
                          className={`admin-pill admin-pill--${p.status}`}
                          title={p.planId ?? p.status}
                        >
                          {p.label}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td>{m.branchCount}</td>
                <td>{formatNumber(m.customerCount)}</td>
                <td>{formatInr(m.mrr)}</td>
                <td>{m.activityScore}</td>
                <td>{formatShortDate(m.createdAt)}</td>
              </tr>
            ))}
            {merchants.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-empty-inline">
                  No merchants matched.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
