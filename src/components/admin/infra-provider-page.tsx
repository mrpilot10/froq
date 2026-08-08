import type { InfraProviderOverview, InfraStatus } from "@/lib/admin/infrastructure";
import { formatShortDate } from "@/lib/admin/format";

function statusClass(status: InfraStatus): string {
  if (status === "ready") return "admin-pill--good";
  if (status === "degraded") return "admin-pill--warn";
  if (status === "missing") return "admin-pill--warn";
  return "admin-pill--bad";
}

function statusLabel(status: InfraStatus): string {
  if (status === "ready") return "Ready";
  if (status === "degraded") return "Degraded";
  if (status === "missing") return "Missing";
  return "Error";
}

export function InfraProviderPage({ data }: { data: InfraProviderOverview }) {
  return (
    <>
      <div className="admin-toolbar">
        <p className="admin-muted" style={{ margin: 0 }}>
          {data.summary} · {formatShortDate(data.generatedAt)}
        </p>
        <span className={`admin-pill ${statusClass(data.status)}`}>
          {statusLabel(data.status)}
        </span>
      </div>

      <section className="admin-stat-row">
        {data.metrics.slice(0, 4).map((m) => (
          <div key={m.label} className="admin-stat">
            <div className="admin-stat-label">{m.label}</div>
            <div className="admin-stat-value" style={{ fontSize: 16 }}>
              {m.value}
            </div>
            {m.hint ? (
              <div className="admin-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {m.hint}
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <section className="admin-panels">
        <div className="admin-panel">
          <h2 className="admin-panel-title">Health checks</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.checks.map((c) => (
                  <tr key={c.id}>
                    <td>{c.label}</td>
                    <td>
                      <span className={`admin-pill ${statusClass(c.status)}`}>
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="admin-muted">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel">
          <h2 className="admin-panel-title">More metrics</h2>
          <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {data.metrics.map((m) => (
                  <tr key={`${m.label}-${m.value}`}>
                    <td>
                      {m.label}
                      {m.hint ? (
                        <div className="admin-muted" style={{ fontSize: 11 }}>
                          {m.hint}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ wordBreak: "break-all" }}>{m.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {data.pending.length ? (
        <section className="admin-panel">
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
