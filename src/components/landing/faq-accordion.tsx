"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

const FAQS = [
  { q: "Is Froq difficult to set up?", a: "Not at all. Most businesses are ready within minutes." },
  { q: "Do customers need to download an app?", a: "No. Customers simply scan and join." },
  { q: "Can I customize rewards?", a: "Yes. Create rewards that fit your business." },
  { q: "Is there a contract?", a: "No." },
  {
    q: "What if Froq isn't right for my business?",
    a: "First-time subscriptions include an optional 7-day money-back guarantee. After that, payments are non-refundable. To request a refund, go to /help. You can cancel anytime to stop future renewals.",
  },
  { q: "What businesses can use Froq?", a: "Any business that benefits from repeat customers." },
];

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="lp-faq">
      {FAQS.map((faq, i) => {
        const isOpen = open === i;
        return (
          <div key={faq.q} className={`lp-faq-item${isOpen ? " lp-faq-item--open" : ""}`}>
            <button
              type="button"
              className="lp-faq-q"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span>{faq.q}</span>
              <span className="lp-faq-icon">
                <Plus size={16} strokeWidth={2.6} />
              </span>
            </button>
            <div className="lp-faq-a" hidden={!isOpen}>
              <p>{faq.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
