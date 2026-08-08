import { formatNumber, formatShortDate } from "@/lib/admin/format";
import { listCustomers } from "@/lib/admin/metrics";

export default async function AdminCustomersPage() {
  const data = await listCustomers(250);

  return (
    <>
      <section className="admin-stat-row">
        <div className="admin-stat">
          <div className="admin-stat-label">Total customers</div>
          <div className="admin-stat-value">{formatNumber(data.total)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">New (30d, page sample)</div>
          <div className="admin-stat-value">{formatNumber(data.new30)}</div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Banned (page)</div>
          <div className="admin-stat-value">
            {formatNumber(data.customers.filter((c) => c.banned).length)}
          </div>
        </div>
        <div className="admin-stat">
          <div className="admin-stat-label">Showing</div>
          <div className="admin-stat-value">{formatNumber(data.customers.length)}</div>
        </div>
      </section>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Business</th>
              <th>Phone</th>
              <th>Joined</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{c.name}</strong>
                  {c.email ? (
                    <div className="admin-muted" style={{ fontSize: 11 }}>
                      {c.email}
                    </div>
                  ) : null}
                </td>
                <td>{c.businessName}</td>
                <td>{c.phone}</td>
                <td>{formatShortDate(c.memberSince)}</td>
                <td>
                  {c.banned ? (
                    <span className="admin-pill admin-pill--canceled">Banned</span>
                  ) : (
                    <span className="admin-pill admin-pill--paid">Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
