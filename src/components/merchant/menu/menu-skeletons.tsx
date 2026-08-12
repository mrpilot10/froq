/**
 * Menu placeholders. Until fetchMenu returns, the Items tab would otherwise
 * flash either an empty "No dishes yet" or three flush shimmer bars that don't
 * look like the dish list. These mirror the real layout so the first paint
 * already reads as a menu loading.
 */

function DishRowSkeleton({
  titleWidth,
  descWidth,
}: {
  titleWidth: number;
  descWidth: string;
}) {
  return (
    <li>
      <div className="menu-dish" aria-hidden="true">
        <div className="menu-dish-main" style={{ pointerEvents: "none" }}>
          <span
            className="sk"
            style={{ width: 56, height: 56, borderRadius: 14, flex: "none" }}
          />
          <span className="menu-dish-copy">
            <span
              className="sk sk-line"
              style={{ width: titleWidth, height: 14 }}
            />
            <span
              className="sk sk-line"
              style={{ width: descWidth, height: 11, marginTop: 8 }}
            />
            <span
              className="sk sk-line"
              style={{ width: 88, height: 10, marginTop: 10 }}
            />
          </span>
          <span className="menu-dish-stats">
            <span
              className="sk sk-line"
              style={{ width: 42, height: 14, marginLeft: "auto" }}
            />
          </span>
        </div>
      </div>
    </li>
  );
}

const GROUP_ROWS: Array<Array<{ title: number; desc: string }>> = [
  [
    { title: 148, desc: "72%" },
    { title: 118, desc: "58%" },
    { title: 132, desc: "64%" },
  ],
  [
    { title: 124, desc: "66%" },
    { title: 156, desc: "54%" },
  ],
];

/** Dish list under AI Digital Menu → Menu, while the catalogue loads. */
export function MenuItemsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading menu">
      {GROUP_ROWS.map((rows, groupIndex) => (
        <section key={groupIndex} className="merchant-section">
          <div className="merchant-section-head">
            <div className="sk sk-line" style={{ width: 92, height: 13 }} />
            <div className="sk sk-line" style={{ width: 54, height: 11 }} />
          </div>
          <div className="panel-card menu-group">
            <ul className="menu-dish-list">
              {rows.map((row, rowIndex) => (
                <DishRowSkeleton
                  key={rowIndex}
                  titleWidth={row.title}
                  descWidth={row.desc}
                />
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}

/** Offer rows under AI Digital Menu → Offers, while fetchMenuOffers returns. */
export function MenuOffersSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading offers">
      <section className="merchant-section">
        <div className="merchant-section-head">
          <div className="sk sk-line" style={{ width: 96, height: 13 }} />
          <div className="sk sk-line" style={{ width: 54, height: 11 }} />
        </div>
        <div className="panel-card menu-group">
          <ul className="menu-dish-list">
            {[
              { title: 148, detail: "68%" },
              { title: 126, detail: "54%" },
              { title: 160, detail: "72%" },
              { title: 118, detail: "46%" },
            ].map((row, index) => (
              <li key={index}>
                <div className="menu-dish" aria-hidden="true">
                  <div className="menu-dish-main" style={{ pointerEvents: "none" }}>
                    <span
                      className="sk"
                      style={{ width: 56, height: 56, borderRadius: 14, flex: "none" }}
                    />
                    <span className="menu-dish-copy">
                      <span
                        className="sk sk-line"
                        style={{ width: row.title, height: 14 }}
                      />
                      <span
                        className="sk sk-line"
                        style={{ width: row.detail, height: 11, marginTop: 8 }}
                      />
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

/** AI Credits card on Menu home while plan usage loads. */
export function AiCreditsSkeleton() {
  return (
    <section className="merchant-section" aria-busy="true" aria-label="Loading AI Credits">
      <div className="ai-credits-card panel-card">
        <header className="ai-credits-head">
          <div className="ai-credits-brand">
            <span className="sk" style={{ width: 42, height: 42, borderRadius: 999, flex: "none" }} />
            <div>
              <div className="sk sk-line" style={{ width: 84, height: 15 }} />
              <div className="sk sk-line" style={{ width: 132, height: 11, marginTop: 6 }} />
            </div>
          </div>
        </header>

        <div className="ai-credits-body">
          <div className="ai-credits-monthly">
            <div className="sk" style={{ width: 118, height: 22, borderRadius: 8 }} />
            <div className="ai-credits-monthly-main">
              <div className="ai-credits-monthly-copy" style={{ flex: 1 }}>
                <div className="sk sk-line" style={{ width: 150, height: 11 }} />
                <div className="sk sk-line" style={{ width: 180, height: 28, marginTop: 10 }} />
                <div className="sk" style={{ width: "100%", height: 10, borderRadius: 999, marginTop: 12 }} />
              </div>
              <span className="sk" style={{ width: 88, height: 88, borderRadius: 999, flex: "none" }} />
            </div>
            <div className="ai-credits-monthly-meta">
              <div className="sk sk-line" style={{ width: 120, height: 12 }} />
              <span className="ai-credits-monthly-meta-divider" aria-hidden />
              <div className="sk sk-line" style={{ width: 150, height: 12 }} />
            </div>
          </div>
          <div className="sk" style={{ width: "100%", height: 72, borderRadius: 16 }} />
          <div className="sk" style={{ width: "100%", height: 40, borderRadius: 12 }} />
        </div>

        <div className="ai-credits-section">
          <div className="sk sk-line" style={{ width: 96, height: 10 }} />
          <ul className="ai-credits-history-list">
            {[128, 112, 140, 104].map((width, index) => (
              <li key={index} aria-hidden>
                <span className="sk" style={{ width: 30, height: 30, borderRadius: 9, flex: "none" }} />
                <div className="ai-credits-history-copy">
                  <span className="sk sk-line" style={{ width, height: 13 }} />
                  <span className="sk sk-line" style={{ width: "52%", height: 10, marginTop: 6 }} />
                </div>
                <span className="sk sk-line" style={{ width: 64, height: 12, flex: "none" }} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Session cards under AI Digital Menu → History. */
export function MenuHistorySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading history">
      <div className="qhist-summary" style={{ marginBottom: 16 }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="qhist-summary-stat">
            <div className="sk sk-icon" style={{ borderRadius: 12 }} />
            <div className="qhist-summary-copy">
              <div className="sk sk-line" style={{ width: 34, height: 18 }} />
              <div className="sk sk-line" style={{ width: 64, marginTop: 7 }} />
            </div>
          </div>
        ))}
      </div>

      <section className="merchant-section">
        <div className="merchant-section-head">
          <div className="sk sk-line" style={{ width: 108, height: 13 }} />
        </div>
        <div className="panel-card menu-group">
          <ul className="menu-dish-list">
            {[132, 118, 148].map((width, index) => (
              <li key={index}>
                <div className="menu-dish" aria-hidden="true">
                  <div
                    className="menu-dish-main"
                    style={{ pointerEvents: "none", gap: 12 }}
                  >
                    <span className="menu-dish-copy" style={{ flex: 1 }}>
                      <span
                        className="sk sk-line"
                        style={{ width, height: 14 }}
                      />
                      <span
                        className="sk sk-line"
                        style={{ width: "58%", height: 11, marginTop: 8 }}
                      />
                    </span>
                    <span
                      className="sk"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 6,
                        flex: "none",
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
