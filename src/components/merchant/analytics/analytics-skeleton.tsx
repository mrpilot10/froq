/**
 * Placeholder for the analytics body. Mirrors the real layout — hero card,
 * period grid, chart, then two sections — so content lands without the page
 * jumping when the stats arrive.
 */
export function AnalyticsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading analytics">
      <div className="merchant-ltv-card">
        <div className="merchant-ltv-head">
          <div className="sk sk-on-dark sk-line" style={{ width: 140 }} />
        </div>
        <div
          className="sk sk-on-dark"
          style={{ width: 120, height: 34, borderRadius: 10, margin: "14px 0 10px" }}
        />
        <div className="sk sk-on-dark sk-line" style={{ width: 170 }} />
        <div className="merchant-ltv-metrics" style={{ marginTop: 20 }}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="merchant-ltv-tile">
              <div className="sk sk-on-dark sk-line" style={{ width: 68 }} />
              <div className="sk sk-on-dark sk-line" style={{ width: 44, marginTop: 8 }} />
            </div>
          ))}
        </div>
      </div>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <div className="sk sk-line" style={{ width: 90 }} />
          <div className="sk sk-line" style={{ width: 60 }} />
        </div>
        <div className="merchant-stat-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="merchant-stat-card">
              <div className="sk sk-icon" />
              <div
                className="sk"
                style={{ width: 52, height: 24, borderRadius: 8, marginTop: 14 }}
              />
              <div className="sk sk-line" style={{ width: 80, marginTop: 10 }} />
            </div>
          ))}
        </div>
      </section>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <div className="sk sk-line" style={{ width: 110 }} />
          <div className="sk sk-line" style={{ width: 70 }} />
        </div>
        <div className="panel-card merchant-chart-card">
          <div className="merchant-chart-head">
            <div>
              <div className="sk sk-line" style={{ width: 96 }} />
              <div className="sk sk-line" style={{ width: 138, marginTop: 8 }} />
            </div>
          </div>
          <div className="merchant-chart-bars">
            {[52, 78, 44, 88, 61, 37, 70].map((height, index) => (
              <div key={index} className="merchant-chart-bar-col">
                <div
                  className="sk"
                  style={{ width: "100%", height: `${height}%`, borderRadius: 8 }}
                />
                <div className="sk sk-line" style={{ width: 18, marginTop: 8 }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {[0, 1].map((section) => (
        <section key={section} className="merchant-section">
          <div className="merchant-section-head">
            <div className="sk sk-line" style={{ width: 120 }} />
          </div>
          <div className="panel-card merchant-progress-list">
            {Array.from({ length: 3 }).map((_, row) => (
              <div key={row} style={{ padding: "10px 0" }}>
                <div className="sk sk-line" style={{ width: `${70 - row * 12}%` }} />
                <div
                  className="sk"
                  style={{ width: "100%", height: 8, borderRadius: 999, marginTop: 10 }}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
