"use client";

import { AI_CREDITS_TOOLTIP } from "@/lib/ai/credits-config";

/** Renders plan feature copy with numeric values emphasized. */
export function FeatureText({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,]*)/g);
  const body = (
    <span className="feature-text">
      {parts.map((part, index) =>
        /^\d[\d,]*$/.test(part) ? (
          <strong key={`${part}-${index}`}>{part}</strong>
        ) : (
          part
        ),
      )}
    </span>
  );

  if (!/AI Credits/i.test(text)) return body;

  return (
    <span className="pricing-feature-with-tip">
      {body}
      <span
        className="pricing-feature-tip"
        title={AI_CREDITS_TOOLTIP}
        tabIndex={0}
        aria-label={AI_CREDITS_TOOLTIP}
      >
        ?
      </span>
    </span>
  );
}
