/**
 * Queue placeholders. Both screens restore their state from localStorage after
 * mount, so without these the first paint shows a confident "no queue yet" /
 * "no sessions" empty state that is replaced a frame later.
 */

function HeadSkeleton({ actionWidth }: { actionWidth?: number }) {
  return (
    <div className={`tab-head${actionWidth ? " merchant-dashboard-head" : ""}`}>
      <div>
        <div className="sk sk-title" />
        <div className="sk sk-sub" />
      </div>
      {actionWidth ? (
        <div className="sk" style={{ width: actionWidth, height: 38, borderRadius: 12 }} />
      ) : null}
    </div>
  );
}

function ListRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="queue-list">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="panel-card" style={{ display: "flex", gap: 12, padding: 14 }}>
          <div className="sk sk-circle" style={{ width: 42, height: 42, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sk sk-line" style={{ width: 132 }} />
            <div className="sk sk-line" style={{ width: 96, marginTop: 9 }} />
          </div>
          <div className="sk" style={{ width: 74, height: 32, borderRadius: 999, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

export function QueueHomeSkeleton() {
  return (
    <div className="tab-screen queue-home merchant-dashboard" aria-busy="true">
      <HeadSkeleton actionWidth={108} />

      <section className="merchant-section">
        <div className="merchant-section-head">
          <div className="sk sk-line" style={{ width: 78 }} />
          <div className="sk sk-line" style={{ width: 62 }} />
        </div>
        <div className="merchant-ltv-card queue-wait-card">
          <div className="merchant-ltv-head">
            <div className="sk sk-on-dark sk-line" style={{ width: 92 }} />
          </div>
          <div
            className="sk sk-on-dark"
            style={{ width: 104, height: 38, borderRadius: 10, margin: "14px 0 12px" }}
          />
          <div className="sk sk-on-dark sk-line" style={{ width: 200 }} />
          <div className="merchant-ltv-metrics queue-wait-tiles" style={{ marginTop: 20 }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="merchant-ltv-tile queue-wait-tile">
                <div className="sk sk-on-dark sk-line" style={{ width: 34 }} />
                <div className="sk sk-on-dark sk-line" style={{ width: 56, marginTop: 8 }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <div className="sk sk-line" style={{ width: 96 }} />
        </div>
        <ListRowsSkeleton />
      </section>
    </div>
  );
}

export function QueueHistorySkeleton() {
  return (
    <div className="tab-screen" aria-busy="true">
      <HeadSkeleton />

      <div className="qhist-summary qhist-summary--4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="qhist-summary-stat">
            <div className="sk sk-icon" style={{ borderRadius: 12 }} />
            <div className="qhist-summary-copy">
              <div className="sk sk-line" style={{ width: 34, height: 18 }} />
              <div className="sk sk-line" style={{ width: 64, marginTop: 7 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="qhist-list">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="panel-card qhist-card">
            <div className="qhist-card-head">
              <div className="qhist-card-copy" style={{ flex: 1 }}>
                <div className="sk sk-line" style={{ width: 96, height: 15 }} />
                <div className="sk sk-line" style={{ width: 168, marginTop: 9 }} />
              </div>
              <div className="sk" style={{ width: 72, height: 26, borderRadius: 999 }} />
            </div>
            <div className="qhist-stats">
              {Array.from({ length: 4 }).map((_, tile) => (
                <div key={tile} className="qhist-stat">
                  <div className="sk sk-line" style={{ width: 26, height: 17 }} />
                  <div className="sk sk-line" style={{ width: 44, marginTop: 7 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
