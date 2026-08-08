"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export interface AiProgressState {
  done: number;
  total: number;
  /** What the AI is working on right now. */
  label: string;
  /** Wall-clock start of the whole run. */
  startedAt: number;
  /** When the current step began — used to count down within a step. */
  stepStartedAt: number;
  /**
   * Measured average ms per completed step. Null until the first step
   * finishes — we fall back to `seedMs` for the first ETA.
   */
  avgMs: number | null;
  /** Prior estimate used before any step has finished. */
  seedMs: number;
  /**
   * When true (menu OCR), the bar fills from elapsed/seed while the single
   * server call runs. Bulk generate keeps this false — only real steps move it.
   */
  timed?: boolean;
}

/** Human wait copy from a millisecond estimate. */
export function formatWait(ms: number): string {
  const sec = Math.max(1, Math.round(ms / 1000));
  if (sec < 60) return `~${sec}s left`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 3 && rem > 0) return `~${min}m ${rem}s left`;
  return `~${min} min left`;
}

export function formatElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}:${String(rem).padStart(2, "0")}`;
}

/**
 * Rolling average after each completed step. Keeps the ETA honest as Gemini
 * slows down or speeds up mid-run.
 */
export function nextAvgMs(
  prev: number | null,
  completed: number,
  elapsedMs: number,
): number {
  if (completed <= 0) return prev ?? 0;
  const measured = elapsedMs / completed;
  if (prev == null || completed === 1) return measured;
  // Light EMA so one slow dish doesn't spike the whole estimate.
  return prev * 0.35 + measured * 0.65;
}

/** Seconds of wait we expect before the first real sample lands. */
export const AI_STEP_SEED_MS = {
  copy: 5_000,
  photo: 9_000,
  everythingStep: 7_000,
  singleDesc: 5_000,
  singlePhoto: 9_000,
  singleAll: 14_000,
  readPage: 18_000,
} as const;

interface MenuAiProgressProps {
  progress: AiProgressState;
  /** Optional short status above the bar. Prefer sheet title instead. */
  kicker?: string;
}

/**
 * Compact progress for menu AI jobs. Timed mode (OCR) estimates from elapsed
 * time; bulk generate advances from completed steps.
 */
export function MenuAiProgress({ progress, kicker }: MenuAiProgressProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(id);
  }, [progress.startedAt, progress.stepStartedAt, progress.total]);

  const elapsed = Math.max(0, now - progress.startedAt);
  const remainingSteps = Math.max(0, progress.total - progress.done);
  const perStep = progress.avgMs ?? progress.seedMs;
  const stepAge = Math.max(0, now - progress.stepStartedAt);

  let pct: number;
  let etaMs: number;

  if (progress.timed) {
    const ratio = Math.min(0.92, elapsed / Math.max(1, progress.seedMs));
    pct = Math.round(ratio * 100);
    etaMs = Math.max(1_000, progress.seedMs - elapsed);
  } else {
    pct =
      progress.total <= 0
        ? 0
        : Math.min(100, Math.round((progress.done / progress.total) * 100));
    etaMs =
      remainingSteps <= 0
        ? 0
        : Math.max(
            1_000,
            perStep * remainingSteps - Math.min(stepAge, perStep * 0.85),
          );
  }

  const finishing = remainingSteps === 0 && !progress.timed;
  const barWidth = pct <= 0 ? 0 : Math.max(pct, 6);
  const status =
    progress.label.trim() ||
    (kicker ? kicker : progress.timed ? "Working…" : "Generating…");
  const meta = finishing
    ? "Finishing…"
    : progress.timed
      ? formatWait(etaMs)
      : `${progress.done}/${progress.total} · ${formatWait(etaMs)}`;

  return (
    <div
      className="menu-ai-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={status}
    >
      <div className="menu-ai-progress-top">
        <Loader2
          size={16}
          strokeWidth={2.4}
          className="menu-spin menu-ai-progress-spinner"
          aria-hidden
        />
        <span className="menu-ai-progress-label">{status}</span>
        <span className="menu-ai-progress-pct">{pct}%</span>
      </div>

      <div className="menu-ai-progress-track">
        <div
          className="menu-ai-progress-fill"
          style={{ width: `${barWidth}%` }}
        />
      </div>

      <p className="menu-ai-progress-meta">{meta}</p>
    </div>
  );
}

/** @deprecated Prefer a one-line note in the sheet; kept for callers. */
export function MenuAiStayOpen({ children }: { children: ReactNode }) {
  return (
    <p className="menu-ai-stay-open menu-ai-stay-open--quiet" role="status">
      {children}
    </p>
  );
}
