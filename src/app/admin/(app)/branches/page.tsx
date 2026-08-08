import { formatNumber, formatShortDate } from "@/lib/admin/format";
import { listBranches } from "@/lib/admin/metrics";

export default async function AdminBranchesPage() {
  const data = await listBranches(250);

  return (
    <>
      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Total branches</div>
          <div className="admin-stat-value">{formatNumber(data.total)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Merchants with branches</div>
          <div className="admin-stat-value">{formatNumber(data.merchantCount)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Avg / merchant</div>
          <div className="admin-stat-value">{data.avgPerMerchant.toFixed(1)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Default branches</div>
          <div className="admin-stat-value">
            {formatNumber(data.branches.filter((b) => b.isDefault).length)}
          </div>
        </div>
      </section>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Branch</th>
              <th>Business</th>
              <th>Default</th>
              <th>Address</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {data.branches.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>{b.name}</strong>
                  <div className="admin-muted" style={{ fontSize: 11 }}>
                    /{b.slug}
                  </div>
                </td>
                <td>{b.businessName}</td>
                <td>{b.isDefault ? <span className="admin-pill admin-pill--paid">Yes</span> : "—"}</td>
                <td>{b.address || "—"}</td>
                <td>{formatShortDate(b.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
