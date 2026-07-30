import { useId, type SVGProps } from "react";

const SPARKLE =
  "M16.8 2.2 18.25 6.4 22.45 7.85 18.25 9.3 16.8 13.5 15.35 9.3 11.15 7.85 15.35 6.4Z";

/**
 * Digital AI Menu mark — three menu bars + AI sparkle.
 * Sparkle sits on the top-right of the bars with a knockout (negative) border.
 * Uses currentColor so rail hover/active match other icons.
 */
export function DigitalMenuIcon({
  size = 22,
  className,
  ...props
}: {
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "width" | "height">) {
  const s = typeof size === "number" ? size : Number(size) || 22;
  const maskId = `dm-sparkle-${useId().replace(/:/g, "")}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
      {...props}
    >
      <defs>
        {/* White = keep bars; black sparkle halo = cut a gap around the sparkle */}
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <rect x="0" y="0" width="24" height="24" fill="#fff" />
          <path
            d={SPARKLE}
            fill="#000"
            stroke="#000"
            strokeWidth="3.25"
            strokeLinejoin="round"
          />
        </mask>
      </defs>

      {/* Bars — longer so the sparkle can sit on the top-right corner */}
      <g mask={`url(#${maskId})`}>
        <rect x="1.5" y="6.5" width="16.5" height="3" rx="1.5" />
        <rect x="1.5" y="11.5" width="16.5" height="3" rx="1.5" />
        <rect x="1.5" y="16.5" width="16.5" height="3" rx="1.5" />
      </g>

      {/* Sparkle imposed on top-right of the bars */}
      <path d={SPARKLE} />
    </svg>
  );
}
