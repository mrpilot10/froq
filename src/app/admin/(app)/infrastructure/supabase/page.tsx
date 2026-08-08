import { InfraProviderPage } from "@/components/admin/infra-provider-page";
import { getSupabaseInfrastructure } from "@/lib/admin/infrastructure";
import { formatNumber, formatShortDate } from "@/lib/admin/format";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

export default async function Page() {
  const data = await getSupabaseInfrastructure();
  const stats = data.supabaseStats;

  return (
    <>
      <InfraProviderPage data={data} />

      {stats ? (
        <>
          <section className="admin-panels" style={{ marginTop: 16 }}>
            <div className="admin-panel">
              <h2 className="admin-panel-title">Top tables by size</h2>
              <p className="admin-muted">
                Public schema · total relation size (table + indexes)
                {stats.generatedAt
                  ? ` · as of ${formatShortDate(stats.generatedAt)}`
                  : ""}
              </p>
              <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>Est. rows</th>
                      <th>Data</th>
                      <th>Indexes</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.tables.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="admin-empty-inline">
                          No public tables found.
                        </td>
                      </tr>
                    ) : (
                      stats.tables.map((t) => (
                        <tr key={t.name}>
                          <td>
                            <code style={{ fontSize: 11 }}>{t.name}</code>
                          </td>
                          <td>{formatNumber(t.estimatedRows)}</td>
                          <td className="admin-muted">
                            {formatBytes(t.tableBytes)}
                          </td>
                          <td className="admin-muted">
                            {formatBytes(t.indexBytes)}
                          </td>
                          <td>{t.totalPretty}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-panel">
              <h2 className="admin-panel-title">Storage buckets</h2>
              <p className="admin-muted">
                Size from{" "}
                <code style={{ fontSize: 11 }}>metadata.size</code> ·{" "}
                {stats.storage
                  ? `${stats.storage.objectCount} objects · ${stats.storage.totalPretty}`
                  : "—"}
              </p>
              <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th>Access</th>
                      <th>Objects</th>
                      <th>Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!stats.storage || stats.storage.buckets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="admin-empty-inline">
                          No storage buckets yet.
                        </td>
                      </tr>
                    ) : (
                      stats.storage.buckets.map((b) => (
                        <tr key={b.id || b.name}>
                          <td>
                            <code style={{ fontSize: 11 }}>{b.name}</code>
                          </td>
                          <td>
                            <span
                              className={[
                                "admin-pill",
                                b.public
                                  ? "admin-pill--warn"
                                  : "admin-pill--good",
                              ].join(" ")}
                            >
                              {b.public ? "Public" : "Private"}
                            </span>
                          </td>
                          <td>{formatNumber(b.objectCount)}</td>
                          <td>{b.totalPretty}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="admin-panels">
            <div className="admin-panel">
              <h2 className="admin-panel-title">Storage growth (30d)</h2>
              <p className="admin-muted">
                Objects created per day (from{" "}
                <code style={{ fontSize: 11 }}>storage.objects.created_at</code>
                ). Cumulative bytes added in window:{" "}
                {formatBytes(
                  (stats.storage?.growth30d ?? []).reduce(
                    (sum, d) => sum + d.bytesAdded,
                    0,
                  ),
                )}
              </p>
              <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Objects added</th>
                      <th>Bytes added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!stats.storage || stats.storage.growth30d.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="admin-empty-inline">
                          No storage uploads in the last 30 days.
                        </td>
                      </tr>
                    ) : (
                      [...stats.storage.growth30d].reverse().map((d) => (
                        <tr key={d.day}>
                          <td>{d.day}</td>
                          <td>{formatNumber(d.objectsAdded)}</td>
                          <td>{formatBytes(d.bytesAdded)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="admin-panel">
              <h2 className="admin-panel-title">Realtime publication</h2>
              <p className="admin-muted">
                Tables in{" "}
                <code style={{ fontSize: 11 }}>supabase_realtime</code>
                {stats.realtime
                  ? ` · ${stats.realtime.dbBackendsActive} active / ${stats.realtime.dbBackendsTotal} DB backends`
                  : ""}
                . WebSocket peak still needs Management usage / dashboard.
              </p>
              <div className="admin-table-wrap" style={{ marginTop: 12, border: 0 }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Schema</th>
                      <th>Table</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!stats.realtime || stats.realtime.tables.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="admin-empty-inline">
                          No tables in the Realtime publication.
                        </td>
                      </tr>
                    ) : (
                      stats.realtime.tables.map((t) => (
                        <tr key={`${t.schema}.${t.name}`}>
                          <td className="admin-muted">{t.schema}</td>
                          <td>
                            <code style={{ fontSize: 11 }}>{t.name}</code>
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
