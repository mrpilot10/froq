/**
 * Reservation placeholders. The dashboard fetches its bookings after mount, so
 * without these the first paint shows a confident "no reservations" empty state
 * that is replaced a moment later.
 */

/** Mirrors `ReservationRow` so nothing shifts when the real bookings land. */
function RowSkeletons({
  count,
  variant = "board",
}: {
  count: number;
  variant?: "board" | "history";
}) {
  const isHistory = variant === "history";

  return (
    <div className="resv-list">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`panel-card queue-entry resv-entry${
            isHistory ? " resv-entry--history" : ""
          }`}
        >
          <div className="queue-entry-main">
            <div className="queue-entry-open" style={{ cursor: "default" }}>
              <div className="resv-stub">
                <div className="sk" style={{ width: "100%", height: 38, borderRadius: 11 }} />
                <div className="sk sk-line" style={{ width: 30, height: 9 }} />
              </div>

              {isHistory ? null : (
                <div className="sk sk-circle" style={{ width: 42, height: 42 }} />
              )}

              <div className="queue-entry-copy">
                <div className="merchant-list-title">
                  <div className="sk sk-line" style={{ width: 124, height: 13 }} />
                  {isHistory ? null : (
                    <div className="sk" style={{ width: 66, height: 18, borderRadius: 999 }} />
                  )}
                </div>
              </div>

              <div className="resv-entry-cols">
                <div className="resv-col resv-col--party">
                  <div className="sk sk-line" style={{ width: 54, height: 11 }} />
                </div>
                <div className="resv-col resv-col--table">
                  <div className="sk sk-line" style={{ width: 58, height: 11 }} />
                </div>
                {isHistory ? (
                  <div className="resv-col resv-col--status">
                    <div className="sk" style={{ width: 68, height: 18, borderRadius: 999 }} />
                  </div>
                ) : null}
              </div>

              <div className="sk sk-circle" style={{ width: 16, height: 16 }} />
            </div>
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
            <div className="sk sk-icon" style={{ width: 38, height: 38, borderRadius: 12 }} />
            <div className="qhist-summary-copy">
              <div className="sk sk-line" style={{ width: 30, height: 20 }} />
              <div className="sk sk-line" style={{ width: 62, height: 11, marginTop: 4 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="resv-toolbar">
        <div className="sk" style={{ width: "100%", height: 46, borderRadius: 16 }} />
        <div className="sk" style={{ width: "100%", height: 42, borderRadius: 14 }} />
      </div>

      <div className="resv-history-days">
        {[3, 2].map((count, index) => (
          <section key={index} className="merchant-section">
            <div className="merchant-section-head">
              <div className="sk sk-line" style={{ width: 92, height: 12 }} />
              <div className="sk sk-line" style={{ width: 68, height: 12 }} />
            </div>
            <RowSkeletons count={count} variant="history" />
          </section>
        ))}
      </div>
    </div>
  );
}

export function ReservationsHomeSkeleton() {
  return (
    <div className="tab-screen merchant-dashboard resv-home" aria-busy="true">
      <div className="tab-head merchant-dashboard-head">
        <div>
          <div className="sk sk-title" />
          <div className="sk sk-sub" />
        </div>
        <div className="sk" style={{ width: 148, height: 38, borderRadius: 12 }} />
      </div>

      <div className="panel-card resv-hero">
        <div className="resv-hero-top">
          <div className="sk sk-line" style={{ width: 120, height: 12 }} />
          <div className="sk sk-line" style={{ width: 96, height: 28, marginTop: 10 }} />
          <div className="sk sk-line" style={{ width: 148, height: 12, marginTop: 10 }} />
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
