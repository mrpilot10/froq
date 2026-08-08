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
    <div className="tab-screen queue-home merchant-dashboard resv-home" aria-busy="true">
      <HeadSkeleton actionWidth={108} />

      <div className="panel-card resv-hero">
        <div className="resv-hero-top">
          <div className="sk sk-line" style={{ width: 120, height: 12 }} />
          <div className="sk sk-line" style={{ width: 96, height: 28, marginTop: 10 }} />
          <div className="sk sk-line" style={{ width: 180, height: 12, marginTop: 10 }} />
        </div>
        <div className="resv-hero-pulse">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="resv-hero-metric" style={{ cursor: "default" }}>
              <div className="sk sk-line" style={{ width: 22, height: 16 }} />
              <div className="sk sk-line" style={{ width: 48, marginTop: 6 }} />
            </div>
          ))}
        </div>
      </div>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <div className="sk sk-line" style={{ width: 96 }} />
        </div>
        <div className="merchant-quick-actions merchant-quick-actions--all">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="sk"
              style={{ width: "100%", height: 76, borderRadius: 18 }}
            />
          ))}
        </div>
      </section>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <div className="sk sk-line" style={{ width: 78 }} />
          <div className="sk sk-line" style={{ width: 62 }} />
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
                <div className="sk sk-line" style={{ width: 148, marginTop: 8 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
