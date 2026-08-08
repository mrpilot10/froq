import { parseSuperAdminEmails, requireSuperAdmin } from "@/lib/admin/auth";

export default async function AdminSettingsPage() {
  const admin = await requireSuperAdmin();
  const allowlist = [...parseSuperAdminEmails()].sort();

  return (
    <section className="admin-panel">
      <h2 className="admin-panel-title">Settings</h2>
      <p className="admin-muted">
        Super Admin access is gated by the <code>SUPER_ADMIN_EMAILS</code> environment variable.
      </p>
      <div className="admin-table-wrap" style={{ marginTop: 16, border: 0 }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Signed in as</td>
              <td>{admin.email}</td>
            </tr>
            <tr>
              <td>Allowlist</td>
              <td>
                {allowlist.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {allowlist.map((email) => (
                      <li key={email}>{email}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="admin-muted">Empty — nobody can access /admin</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
