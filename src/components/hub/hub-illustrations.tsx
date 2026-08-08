/**
 * Bento tile artwork for the guest landing page.
 *
 * These are miniature mock-ups of the real product screens — tilted white
 * cards with true shadows, a dark loyalty pass, floating chips — rather than
 * flat glyphs, so a tile shows a guest what they're about to open. Built from
 * elements instead of SVG because the look leans on layered box-shadows and
 * rotation, and colours come from the merchant's brand variables so every
 * mock-up repaints itself per shop.
 *
 * Each piece of art draws into a centered `.hart-stage` so the composition
 * sits in the middle of its tile, not flush against one edge.
 */

type ArtProps = { className?: string };

function root(kind: string, className?: string) {
  return `hart hart--${kind}${className ? ` ${className}` : ""}`;
}

function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.6 6.2 5 8.6l4.4-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A deck of dish cards fanned out, with the ask-anything button floating over it. */
export function MenuArt({ className }: ArtProps) {
  return (
    <div className={root("menu", className)} aria-hidden="true">
      <div className="hart-stage">
        <span className="hart-card hart-card--b2" />
        <span className="hart-card hart-card--b1" />

        <span className="hart-card hart-card--front">
          <span className="hart-thumb" />
          <span className="hart-rows">
            <span className="hart-line hart-line--lg" />
            <span className="hart-line hart-line--sm" />
            <span className="hart-tag">₹320</span>
          </span>
        </span>

        <span className="hart-ask">
          <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M6 0c.7 3.2 2.1 4.6 5.3 5.3C8.1 6 6.7 7.4 6 10.6 5.3 7.4 3.9 6 .7 5.3 3.9 4.6 5.3 3.2 6 0Z"
              fill="currentColor"
            />
          </svg>
          Ask
        </span>
      </div>
    </div>
  );
}

/** A loyalty stamp card — one card, no stack, just the stamps that matter. */
export function StampsArt({ className }: ArtProps) {
  const collected = 5;
  return (
    <div className={root("stamps", className)} aria-hidden="true">
      <div className="hart-stage">
        <span className="hart-pass">
          <span className="hart-pass-head">
            <span className="hart-pass-title" />
            <span className="hart-pass-count">5/8</span>
          </span>
          <span className="hart-pass-grid">
            {Array.from({ length: 8 }, (_, index) => (
              <span
                key={index}
                className={`hart-stamp${index < collected ? " hart-stamp--on" : ""}`}
              >
                {index < collected ? <CheckMark /> : null}
              </span>
            ))}
          </span>
        </span>
      </div>
    </div>
  );
}

/** A pulled ticket with its queue number — one card, no toast stack. */
export function QueueArt({ className }: ArtProps) {
  return (
    <div className={root("queue", className)} aria-hidden="true">
      <div className="hart-stage">
        <span className="hart-ticket">
          <span className="hart-line hart-line--sm" />
          <span className="hart-ticket-num">12</span>
          <span className="hart-ticket-meta">
            <span className="hart-line hart-line--xs" />
            <span className="hart-ticket-pills">
              <span className="hart-ticket-pill" />
              <span className="hart-ticket-pill" />
              <span className="hart-ticket-pill hart-ticket-pill--live" />
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}

/** A calendar with the night picked, and the chosen slot floating over it. */
export function ReservationArt({ className }: ArtProps) {
  return (
    <div className={root("book", className)} aria-hidden="true">
      <div className="hart-stage">
        <span className="hart-cal">
          <span className="hart-cal-top">
            <span className="hart-cal-top-line" />
          </span>
          <span className="hart-cal-grid">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} className={`hart-day${index === 6 ? " hart-day--on" : ""}`} />
            ))}
          </span>
        </span>

        <span className="hart-slot hart-slot--back" />
        <span className="hart-slot hart-slot--front">7:30 PM</span>
      </div>
    </div>
  );
}
