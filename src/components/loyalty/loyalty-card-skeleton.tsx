/**
 * Stand-in for the loyalty hub while the customer's card loads. The gates used
 * to render nothing here, which showed a blank white page on every visit to
 * /c/{token} until the server responded.
 */
export function LoyaltyCardSkeleton() {
  return (
    <div className="loyalty-page loyalty-page--collect">
      <div className="loyalty-screen loyalty-screen--collect" aria-busy="true">
        <span className="sr-only">Loading your card</span>

        <div className="loyalty-collect">
          <div className="hero-section">
            <div className="sk-block sk-logo" style={{ width: 64, height: 64 }} />
            <div className="sk-block sk-line sk-line--title" style={{ marginTop: 16 }} />
            <div className="sk-block sk-line sk-line--sub" />
          </div>

          <div className="sk-pass" style={{ borderRadius: 24, padding: 22, marginTop: 20 }}>
            <div className="sk-pass-top">
              <div className="sk-block sk-pass-mark" />
              <div className="sk-block sk-pass-brand" />
            </div>

            <div className="sk-pass-headline">
              <div className="sk-pass-headline-text">
                <div className="sk-block sk-line sk-line--title" />
                <div className="sk-block sk-line sk-line--sub" />
              </div>
              <div className="sk-block sk-pass-thumb" />
            </div>

            <div className="sk-stamp-grid">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="sk-block sk-stamp" />
              ))}
            </div>

            <div className="sk-pass-divider" />

            <div className="sk-pass-bottom">
              <div className="sk-block sk-pass-progress" />
              <div className="sk-block sk-pass-avatar" />
            </div>
          </div>

          <div className="sk-block sk-cta" style={{ marginTop: 20 }} />

          <div
            style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 20 }}
            aria-hidden="true"
          >
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="sk-block sk-social" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
