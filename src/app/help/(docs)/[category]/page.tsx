import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  HELP_CATEGORIES,
  articleHref,
  articleSummary,
  getCategory,
} from "@/lib/support/help-content";

interface PageProps {
  params: Promise<{ category: string }>;
}

export function generateStaticParams() {
  return HELP_CATEGORIES.map((category) => ({ category: category.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category: id } = await params;
  const category = getCategory(id);
  if (!category) return { title: "Documentation — Froq Help" };

  return { title: `${category.label} — Froq Help`, description: category.blurb };
}

export default async function HelpCategoryPage({ params }: PageProps) {
  const { category: id } = await params;
  const category = getCategory(id);
  if (!category) notFound();

  return (
    <article className="docs-article">
      <nav className="docs-crumbs" aria-label="Breadcrumb">
        <Link href="/help">Documentation</Link>
        <span aria-hidden="true">/</span>
        <span>{category.label}</span>
      </nav>

      <header className="docs-head">
        <h1>{category.label}</h1>
        <p className="docs-lead">{category.blurb}</p>
      </header>

      <ul className="docs-toc">
        {category.articles.map((article) => (
          <li key={article.id}>
            <Link href={articleHref(category.id, article.id)} className="docs-toc-item">
              <span className="docs-toc-copy">
                <strong>{article.question}</strong>
                <small>{articleSummary(article)}</small>
              </span>
              <ArrowRight size={15} strokeWidth={2.4} />
            </Link>
          </li>
        ))}
      </ul>

      <section className="docs-callout docs-callout--slim">
        <div>
          <h2>Can&apos;t find it here?</h2>
          <p>Raise a ticket and we&apos;ll answer you directly by email.</p>
        </div>
        <Link href="/help/ticket" className="lp-btn lp-btn--accent">
          Raise a ticket
        </Link>
      </section>
    </article>
  );
}
