/**
 * Reservation placeholders. The dashboard fetches its bookings after mount, so
 * without these the first paint shows a confident "no reservations" empty state
 * that is replaced a moment later.
 */

function RowSkeletons({ count }: { count: number }) {
  return (
    <div className="resv-list">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="panel-card resv-row">
          <div className="resv-row-main">
            <div className="sk sk-circle" style={{ width: 42, height: 42, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sk sk-line" style={{ width: 138 }} />
              <div className="sk sk-line" style={{ width: 104, marginTop: 9 }} />
            </div>
            <div className="sk" style={{ width: 78, height: 26, borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReservationHistorySkeleton() {
  return (
    <div className="tab-screen" aria-busy="true">
      <div className="tab-head">
        <div className="sk sk-title" />
        <div className="sk sk-sub" />
      </div>

      <div className="qhist-summary qhist-summary--4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="qhist-summary-stat">
            <div className="sk sk-icon" style={{ borderRadius: 12 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="sk sk-line" style={{ width: 34, height: 18 }} />
              <div className="sk sk-line" style={{ width: 64, marginTop: 8 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="resv-toolbar">
        <div className="sk" style={{ width: "100%", height: 44, borderRadius: 14 }} />
        <div className="sk" style={{ width: "100%", height: 40, borderRadius: 12 }} />
      </div>

      <RowSkeletons count={5} />
    </div>
  );
}

export function ReservationsHomeSkeleton() {
  return (
    <div className="tab-screen merchant-dashboard" aria-busy="true">
      <div className="tab-head merchant-dashboard-head">
        <div>
          <div className="sk sk-title" />
          <div className="sk sk-sub" />
        </div>
        <div className="sk" style={{ width: 148, height: 38, borderRadius: 12 }} />
      </div>

      <div className="resv-stat-row">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="merchant-stat-card">
            <div
              className="sk"
              style={{ width: 28, height: 28, borderRadius: 9, margin: "0 auto 8px" }}
            />
            <div
              className="sk sk-line"
              style={{ width: 22, height: 16, margin: "0 auto 6px" }}
            />
            <div className="sk sk-line" style={{ width: "80%", margin: "0 auto" }} />
          </div>
        ))}
      </div>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <div className="sk sk-line" style={{ width: 96 }} />
        </div>
        <div className="merchant-quick-actions">
          {Array.from({ length: 2 }).map((_, index) => (
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
          <div className="sk sk-line" style={{ width: 104 }} />
          <div className="sk sk-line" style={{ width: 58 }} />
        </div>
        <div className="resv-toolbar">
          <div className="sk" style={{ width: "100%", height: 44, borderRadius: 14 }} />
          <div className="sk" style={{ width: "100%", height: 40, borderRadius: 12 }} />
        </div>
        <RowSkeletons count={4} />
      </section>
    </div>
  );
}
