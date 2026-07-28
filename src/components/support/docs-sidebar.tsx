"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  LifeBuoy,
  Menu,
  Rocket,
  Search,
  Stamp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  articleHref,
  categoryHref,
  searchHelp,
  type HelpCategoryId,
} from "@/lib/support/help-content";

/** Product sections reuse the icons the dashboard already uses for them. */
const CATEGORY_ICONS: Record<HelpCategoryId, LucideIcon> = {
  "getting-started": Rocket,
  loyalty: Stamp,
  queue: Users,
  billing: CreditCard,
  account: Users,
};

/**
 * Persistent docs navigation: every article in the manual, grouped by section.
 * The search box filters the tree in place rather than navigating, so the
 * reader can see which section an answer lives in before they click.
 *
 * On narrow screens the same tree collapses behind a "Browse topics" toggle.
 */
export function DocsSidebar() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const categories = useMemo(() => searchHelp(query), [query]);
  const searching = query.trim().length > 0;

  return (
    <aside className={`docs-side${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="docs-side-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <X size={16} strokeWidth={2.4} /> : <Menu size={16} strokeWidth={2.4} />}
        <span>Browse topics</span>
      </button>

      <div className="docs-side-inner">
        <div className="docs-search">
          <Search size={15} strokeWidth={2.2} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the docs"
            aria-label="Search the documentation"
          />
        </div>

        <nav className="docs-nav" aria-label="Documentation">
          {categories.length === 0 ? (
            <p className="docs-nav-empty">
              Nothing matches “{query.trim()}”. Try another word, or raise a ticket.
            </p>
          ) : (
            categories.map((category) => {
              const sectionPath = categoryHref(category.id);
              const inSection = pathname === sectionPath || pathname.startsWith(`${sectionPath}/`);
              const Icon = CATEGORY_ICONS[category.id];

              return (
                <div key={category.id} className="docs-nav-group">
                  <Link
                    href={sectionPath}
                    className={`docs-nav-head${pathname === sectionPath ? " is-current" : ""}${
                      inSection ? " is-active" : ""
                    }`}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={15} strokeWidth={2.2} />
                    {category.label}
                  </Link>

                  {/* Article links only clutter the tree unless you're in the
                      section or actively searching for something. */}
                  {inSection || searching ? (
                    <ul className="docs-nav-list">
                      {category.articles.map((article) => {
                        const href = articleHref(category.id, article.id);
                        return (
                          <li key={article.id}>
                            <Link
                              href={href}
                              className={`docs-nav-link${pathname === href ? " is-current" : ""}`}
                              aria-current={pathname === href ? "page" : undefined}
                              onClick={() => setOpen(false)}
                            >
                              {article.question}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              );
            })
          )}
        </nav>

        <Link href="/help/ticket" className="docs-side-cta" onClick={() => setOpen(false)}>
          <LifeBuoy size={16} strokeWidth={2.3} />
          <span>
            <strong>Still stuck?</strong>
            Raise a support ticket
          </span>
        </Link>
      </div>
    </aside>
  );
}
