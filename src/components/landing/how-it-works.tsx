"use client";

import { Gift, QrCode, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";
import { useInView } from "./use-in-view";

interface Step {
  Icon: LucideIcon;
  title: string;
  desc: string;
}

const STEPS: Step[] = [
  {
    Icon: QrCode,
    title: "Customer scans & joins",
    desc: "They scan your QR at checkout and join your loyalty program in one tap — no app, no sign-up forms.",
  },
  {
    Icon: Gift,
    title: "They collect on every visit",
    desc: "Each visit adds a stamp and moves them closer to a reward they actually want.",
  },
  {
    Icon: RefreshCw,
    title: "They come back for more",
    desc: "Rewards give first-timers a reason to return — turning one-off buyers into regulars.",
  },
];

export function HowItWorks() {
  const { ref, inView } = useInView<HTMLOListElement>({ threshold: 0.2 });

  return (
    <ol ref={ref} className={`lp-how${inView ? " is-in" : ""}`}>
      <span className="lp-how-line" aria-hidden="true" />
      {STEPS.map(({ Icon, title, desc }, i) => (
        <li key={title} className="lp-how-step" style={{ "--i": i } as CSSProperties}>
          <span className="lp-how-num" aria-hidden="true">
            {i + 1}
          </span>
          <span className="lp-how-icon" aria-hidden="true">
            <Icon size={22} strokeWidth={2.1} />
          </span>
          <span className="lp-how-body">
            <span className="lp-how-title">{title}</span>
            <span className="lp-how-desc">{desc}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
