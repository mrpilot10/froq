"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * Marks a field the AI is currently filling. One write returns description,
 * cook time and spice together, so all three dim and spin at once — otherwise
 * only the description looks busy and the other two seem stuck.
 */
export function AiPending({
  busy,
  label,
  variant = "inline",
  children,
}: {
  busy: boolean;
  /** Announced to screen readers, e.g. "Writing cook time". */
  label: string;
  /** "block" fills the row; "top" also pins the spinner near the first line. */
  variant?: "inline" | "block" | "top";
  children: ReactNode;
}) {
  const shape =
    variant === "inline"
      ? ""
      : variant === "top"
        ? " menu-ai-pending--block menu-ai-pending--top"
        : " menu-ai-pending--block";

  return (
    <span
      className={`menu-ai-pending${shape}${busy ? " is-busy" : ""}`}
      aria-busy={busy || undefined}
    >
      {children}
      {busy ? (
        <span className="menu-ai-pending-veil">
          <Loader2 size={14} strokeWidth={2.6} className="menu-spin" aria-hidden="true" />
          <span className="sr-only">{label}</span>
        </span>
      ) : null}
    </span>
  );
}
