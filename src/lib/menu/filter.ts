import type { DietTag, MenuCategory, MenuItem } from "./types";

/**
 * Search / sort / filter for the merchant menu list. Kept pure so the screen
 * only owns the control state and the rules stay testable.
 *
 * Facets combine the way merchants expect from every other filter UI: picking
 * two values inside one facet widens the result (veg OR vegan), while facets
 * narrow each other (veg AND draft).
 */

export const MENU_SORTS = [
  { key: "menu", label: "Sort" },
  { key: "name", label: "Name A–Z" },
  { key: "price_desc", label: "Price: high to low" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "time_asc", label: "Cook time: fastest" },
] as const;
export type MenuSort = (typeof MENU_SORTS)[number]["key"];

export const MENU_STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "draft", label: "Draft" },
] as const;
export type MenuStatusFilter = (typeof MENU_STATUS_FILTERS)[number]["key"];

/** Gaps a merchant tends to hunt for after an AI import. */
export const MENU_FLAGS = [
  { key: "sold_out", label: "Sold out" },
  { key: "no_photo", label: "No photo" },
  { key: "no_desc", label: "No description" },
  { key: "no_price", label: "No price" },
] as const;
export type MenuFlag = (typeof MENU_FLAGS)[number]["key"];

export interface MenuFilters {
  query: string;
  status: MenuStatusFilter;
  diet: DietTag[];
  flags: MenuFlag[];
  sort: MenuSort;
}

export const EMPTY_MENU_FILTERS: MenuFilters = {
  query: "",
  status: "all",
  diet: [],
  flags: [],
  sort: "menu",
};

/** Sort isn't counted — reordering the list never hides a dish. */
export function countActiveFilters(filters: MenuFilters): number {
  return (
    (filters.status === "all" ? 0 : 1) + filters.diet.length + filters.flags.length
  );
}

export function isMenuFiltered(filters: MenuFilters): boolean {
  return filters.query.trim() !== "" || countActiveFilters(filters) > 0;
}

/** Every word has to land somewhere, so "peri jumbo" finds "Peri Peri (Jumbo)". */
function matchesQuery(item: MenuItem, categoryName: string, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack =
    `${item.name} ${item.description} ${categoryName}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function matchesFlag(item: MenuItem, flag: MenuFlag): boolean {
  switch (flag) {
    case "sold_out":
      return !item.isAvailable;
    case "no_photo":
      return !item.imageUrl;
    case "no_desc":
      return item.description.trim() === "";
    case "no_price":
      return item.price == null;
  }
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** Dishes with no price or no cook time sort last whichever way we're going. */
function compareNullable(
  a: number | null,
  b: number | null,
  direction: 1 | -1,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * direction;
}

function sortItems(items: MenuItem[], sort: MenuSort): MenuItem[] {
  if (sort === "menu") return items;
  // Sort is stable, so ties keep the merchant's own menu order.
  return [...items].sort((a, b) => {
    switch (sort) {
      case "name":
        return collator.compare(a.name, b.name);
      case "price_asc":
        return compareNullable(a.price, b.price, 1);
      case "price_desc":
        return compareNullable(a.price, b.price, -1);
      case "time_asc":
        return compareNullable(a.prepMinutes, b.prepMinutes, 1);
      default:
        return 0;
    }
  });
}

/** Sections that end up empty drop out entirely rather than showing a bare header. */
export function applyMenuFilters(
  categories: MenuCategory[],
  filters: MenuFilters,
): MenuCategory[] {
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const result: MenuCategory[] = [];
  for (const category of categories) {
    const items = category.items.filter(
      (item) =>
        matchesQuery(item, category.name, terms) &&
        (filters.status === "all" || item.status === filters.status) &&
        (filters.diet.length === 0 ||
          filters.diet.some((tag) => item.diet.includes(tag))) &&
        (filters.flags.length === 0 ||
          filters.flags.some((flag) => matchesFlag(item, flag))),
    );
    if (items.length === 0) continue;
    result.push({ ...category, items: sortItems(items, filters.sort) });
  }
  return result;
}

export function countMenuItems(categories: MenuCategory[]): number {
  return categories.reduce((total, category) => total + category.items.length, 0);
}

/** Add or drop one value inside a multi-select facet. */
export function toggleFacet<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value];
}
