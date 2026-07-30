import type { SVGProps } from "react";

/** Single filled sparkle inside the bubble. */
const SPARKLE =
  "M12 6.2 13.15 9.05 16 10.2 13.15 11.35 12 14.2 10.85 11.35 8 10.2 10.85 9.05Z";

/**
 * AI Reviews mark — outlined square chat bubble with a filled sparkle inside.
 * Uses currentColor so rail hover/active match other icons.
 */
export function AiReviewsIcon({
  size = 22,
  className,
  strokeWidth = 2,
  ...props
}: {
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "width" | "height">) {
  const s = typeof size === "number" ? size : Number(size) || 22;
  const sw = typeof strokeWidth === "number" ? strokeWidth : Number(strokeWidth) || 2;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      {/* Outlined square chat bubble */}
      <path d="M6.5 3.25h11A4.25 4.25 0 0 1 21.75 7.5v6a4.25 4.25 0 0 1-4.25 4.25H10.35l-5.2 3.15a.6.6 0 0 1-.92-.64l.95-3.2A4.25 4.25 0 0 1 2.25 13.5v-6A4.25 4.25 0 0 1 6.5 3.25Z" />
      {/* Filled sparkle */}
      <path d={SPARKLE} fill="currentColor" stroke="none" />
    </svg>
  );
}
