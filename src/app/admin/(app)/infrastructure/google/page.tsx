import { InfraProviderPage } from "@/components/admin/infra-provider-page";
import { getGoogleInfrastructure } from "@/lib/admin/infrastructure";
import {
  formatInr,
  formatNumber,
  formatRelativeTime,
  formatShortDate,
} from "@/lib/admin/format";

export default async function Page() {
  const data = await getGoogleInfrastructure();
  const usage = data.placesUsage;

  return (
    <>
      <InfraProviderPage data={data} />

      {usage ? (
        <>
          <section className="admin-panel" style={{ marginTop: 16 }}>
            <h2 className="admin-panel-title">Places usage by kind (30d)</h2>
            <p className="admin-muted">
              In-app metering · list-price estimate · rates updated{" "}
              {usage.ratesUpdatedAt}. Text search covers onboarding “autocomplete”
              queries.
            </p>
            <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Kind</th>
                    <th>Rate / req</th>
                    <th>Calls</th>
                    <th>OK</th>
                    <th>Failed</th>
                    <th>Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byKind.map((row) => (
                    <tr key={row.kind}>
                      <td>{row.label}</td>
                      <td className="admin-muted">
                        ${row.rateUsd.toFixed(5)}
                      </td>
                      <td>{formatNumber(row.calls)}</td>
                      <td>{formatNumber(row.ok)}</td>
                      <td>{formatNumber(row.failed)}</td>
                      <td>
                        ${row.costUsd.toFixed(4)}
                        <span className="admin-muted" style={{ marginLeft: 6 }}>
                          ({formatInr(row.costInr)})
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-panels">
            <div className="admin-panel">
              <h2 className="admin-panel-title">Daily calls</h2>
              <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Calls</th>
                      <th>Est. USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.byDay.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="admin-empty-inline">
                          No Places usage logged yet. New searches and rating
                          lookups will appear here.
                        </td>
                      </tr>
                    ) : (
                      usage.byDay.map((row) => (
                        <tr key={row.day}>
                          <td>{row.day}</td>
                          <td>{formatNumber(row.calls)}</td>
                          <td>${row.costUsd.toFixed(4)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-panel">
              <h2 className="admin-panel-title">Recent Places calls</h2>
              <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Kind</th>
                      <th>Status</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.recent.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="admin-empty-inline">
                          Waiting for the first metered call.
                        </td>
                      </tr>
                    ) : (
                      usage.recent.map((row) => (
                        <tr key={row.id}>
                          <td title={formatShortDate(row.at)}>
                            {formatRelativeTime(row.at)}
                          </td>
                          <td>
                            <code style={{ fontSize: 11 }}>{row.kind}</code>
                            <div className="admin-muted" style={{ fontSize: 11 }}>
                              {row.path}
                              {row.resultCount != null
                                ? ` · ${row.resultCount} results`
                                : ""}
                            </div>
                          </td>
                          <td>
                            <span
                              className={[
                                "admin-pill",
                                row.status === "ok"
                                  ? "admin-pill--good"
                                  : "admin-pill--bad",
                              ].join(" ")}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td>
                            {row.status === "ok"
                              ? `$${row.costUsd.toFixed(4)}`
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
