import type { CSSProperties } from "react";

export function CardSkeleton({ brandColor }: { brandColor?: string }) {
  const style = brandColor ? ({ "--brand": brandColor } as CSSProperties) : undefined;
  return (
    <div className="loyalty-page" style={style} aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your card…</span>
      <div className="loyalty-screen">
        <div className="hero-section">
          <div className="header">
            <div className="logo-wrap sk-block sk-logo" />
            <div className="biz-details">
              <div className="sk-block sk-line sk-line--title" />
              <div className="sk-block sk-line sk-line--sub" />
            </div>
          </div>

          <div className="pass-stack">
            <div className="pass sk-pass">
              <div className="sk-pass-top">
                <div className="sk-block sk-pass-mark" />
                <div className="sk-block sk-line sk-pass-brand" />
              </div>
              <div className="sk-pass-headline">
                <div className="sk-pass-headline-text">
                  <div className="sk-block sk-line sk-line--title" />
                  <div className="sk-block sk-line sk-line--sub" />
                </div>
                <div className="sk-block sk-pass-thumb" />
              </div>
              <div className="sk-stamp-grid">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="sk-block sk-stamp" />
                ))}
              </div>
              <div className="sk-pass-divider" />
              <div className="sk-pass-bottom">
                <div className="sk-block sk-line sk-pass-progress" />
                <div className="sk-block sk-pass-avatar" />
              </div>
            </div>
          </div>
        </div>

        <div className="cta-block">
          <div className="sk-block sk-cta" />
        </div>

        <div className="social-row">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="sk-block sk-social" />
          ))}
        </div>
      </div>
    </div>
  );
}
