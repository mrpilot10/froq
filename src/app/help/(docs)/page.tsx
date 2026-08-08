import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LifeBuoy } from "lucide-react";
import { HELP_CATEGORIES } from "@/lib/support/help-content";

export const metadata: Metadata = {
  title: "Documentation — Froq Help",
  description:
    "Guides for Froq Loyalty Stamps and Smart Queue, plus answers on billing, plans and your account.",
};

export default function HelpIndexPage() {
  return (
    <article className="docs-article">
      <header className="docs-head">
        <span className="docs-kicker">Documentation</span>
        <h1>Froq help centre</h1>
        <p className="docs-lead">
          Everything you need to run Loyalty Stamps and Smart Queue, from first setup to
          billing. Pick a section below, or search the docs from the sidebar.
        </p>
      </header>

      <div className="docs-cards">
        {HELP_CATEGORIES.map((category) => (
          <Link key={category.id} href={`/help/${category.id}`} className="docs-card">
            <h2>{category.label}</h2>
            <p>{category.blurb}</p>
            <span className="docs-card-meta">
              {category.articles.length} article{category.articles.length === 1 ? "" : "s"}
              <ArrowRight size={14} strokeWidth={2.4} />
            </span>
          </Link>
        ))}
      </div>

      <section className="docs-callout">
        <LifeBuoy size={22} strokeWidth={2.2} />
        <div>
          <h2>Can&apos;t find an answer?</h2>
          <p>
            Raise a ticket and a human will get back to you by email, usually within one
            business day.
          </p>
        </div>
        <Link href="/help/ticket" className="lp-btn lp-btn--accent">
          Raise a ticket
        </Link>
      </section>
    </article>
  );
}
