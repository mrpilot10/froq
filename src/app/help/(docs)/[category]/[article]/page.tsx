import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  HELP_READING_ORDER,
  articleNeighbours,
  articleSummary,
  categoryHref,
  getArticle,
} from "@/lib/support/help-content";

interface PageProps {
  params: Promise<{ category: string; article: string }>;
}

export function generateStaticParams() {
  return HELP_READING_ORDER.map((entry) => ({
    category: entry.category.id,
    article: entry.article.id,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, article } = await params;
  const found = getArticle(category, article);
  if (!found) return { title: "Documentation — Froq Help" };

  return {
    title: `${found.article.question} — Froq Help`,
    description: articleSummary(found.article),
  };
}

export default async function HelpArticlePage({ params }: PageProps) {
  const { category: categoryId, article: articleId } = await params;
  const found = getArticle(categoryId, articleId);
  if (!found) notFound();

  const { article, category } = found;
  const { previous, next } = articleNeighbours(categoryId, articleId);

  return (
    <article className="docs-article">
      <nav className="docs-crumbs" aria-label="Breadcrumb">
        <Link href="/help">Documentation</Link>
        <span aria-hidden="true">/</span>
        <Link href={categoryHref(category.id)}>{category.label}</Link>
      </nav>

      <header className="docs-head">
        <h1>{article.question}</h1>
      </header>

      <div className="docs-prose">
        {article.body.map((paragraph) => (
          <p key={paragraph.slice(0, 32)}>{paragraph}</p>
        ))}
        {article.bullets ? (
          <ul className="docs-bullets">
            {article.bullets.map((bullet) => (
              <li key={bullet.slice(0, 32)}>{bullet}</li>
            ))}
          </ul>
        ) : null}
        {article.steps ? (
          <ol className="docs-steps">
            {article.steps.map((step) => (
              <li key={step.slice(0, 32)}>{step}</li>
            ))}
          </ol>
        ) : null}
      </div>

      {/* Reading order runs across sections, so "next" keeps going rather than
          dead-ending at the last article of a section. */}
      <nav className="docs-pager" aria-label="Article navigation">
        {previous ? (
          <Link href={previous.href} className="docs-pager-link">
            <ArrowLeft size={15} strokeWidth={2.4} />
            <span>
              <small>Previous</small>
              {previous.article.question}
            </span>
          </Link>
        ) : null}
        {next ? (
          <Link href={next.href} className="docs-pager-link docs-pager-link--next">
            <span>
              <small>Next</small>
              {next.article.question}
            </span>
            <ArrowRight size={15} strokeWidth={2.4} />
          </Link>
        ) : null}
      </nav>

      <section className="docs-callout docs-callout--slim">
        <div>
          <h2>Did this answer your question?</h2>
          <p>If something is still unclear, raise a ticket and we&apos;ll help you directly.</p>
        </div>
        <Link href="/help/ticket" className="lp-btn lp-btn--accent">
          Raise a ticket
        </Link>
      </section>
    </article>
  );
}
