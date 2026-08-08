/**
 * Pure-function checks for menu search / sort / filter.
 * Run: npx --yes tsx src/lib/menu/filter.test.ts
 */
import assert from "node:assert/strict";
import {
  applyMenuFilters,
  countActiveFilters,
  countMenuItems,
  EMPTY_MENU_FILTERS,
  isMenuFiltered,
  toggleFacet,
  type MenuFilters,
} from "./filter";
import type { DietTag, MenuCategory, MenuItem } from "./types";

function section(name: string, fn: () => void) {
  fn();
  console.log(`ok  ${name}`);
}

let seq = 0;
function dish(name: string, patch: Partial<MenuItem> = {}): MenuItem {
  seq += 1;
  return {
    id: `item-${seq}`,
    categoryId: "cat",
    name,
    description: "Crisp and golden.",
    price: 100,
    imageUrl: "data:image/jpeg;base64,x",
    diet: [],
    allergens: [],
    spiceLevel: null,
    prepMinutes: 10,
    calories: null,
    isAvailable: true,
    status: "live",
    source: "manual",
    sortOrder: seq,
    ...patch,
  };
}

function menu(...groups: Array<[string, MenuItem[]]>): MenuCategory[] {
  return groups.map(([name, items], index) => ({
    id: `cat-${index}`,
    name,
    sortOrder: index,
    items,
  }));
}

function filters(patch: Partial<MenuFilters> = {}): MenuFilters {
  return { ...EMPTY_MENU_FILTERS, ...patch };
}

const names = (categories: MenuCategory[]) =>
  categories.flatMap((category) => category.items.map((item) => item.name));

section("no filters passes the menu through untouched", () => {
  const source = menu(["Fries", [dish("Salted"), dish("Peri Peri")]]);
  const out = applyMenuFilters(source, filters());
  assert.deepEqual(names(out), ["Salted", "Peri Peri"]);
  assert.equal(countMenuItems(out), 2);
  assert.equal(isMenuFiltered(filters()), false);
});

section("search matches name, description and section name", () => {
  const source = menu([
    "Crispy Fries",
    [
      dish("Simply Salted", { description: "tossed in fine sea salt" }),
      dish("Peri Peri", { description: "african birds eye chilli" }),
    ],
  ]);

  assert.deepEqual(names(applyMenuFilters(source, filters({ query: "salted" }))), [
    "Simply Salted",
  ]);
  // description hit
  assert.deepEqual(names(applyMenuFilters(source, filters({ query: "chilli" }))), [
    "Peri Peri",
  ]);
  // section hit returns the whole section
  assert.equal(
    countMenuItems(applyMenuFilters(source, filters({ query: "crispy" }))),
    2,
  );
});

section("search is case-insensitive and every word must land", () => {
  const source = menu(["Fries", [dish("Peri Peri (Jumbo)"), dish("Peri Peri")]]);
  assert.deepEqual(
    names(applyMenuFilters(source, filters({ query: "  PERI   jumbo " }))),
    ["Peri Peri (Jumbo)"],
  );
  assert.equal(
    countMenuItems(applyMenuFilters(source, filters({ query: "peri wings" }))),
    0,
  );
});

section("empty sections drop out instead of showing a bare header", () => {
  const source = menu(
    ["Fries", [dish("Salted")]],
    ["Drinks", [dish("Cola")]],
  );
  const out = applyMenuFilters(source, filters({ query: "cola" }));
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Drinks");
});

section("status narrows to live or draft", () => {
  const source = menu([
    "Fries",
    [dish("Live one"), dish("Draft one", { status: "draft" })],
  ]);
  assert.deepEqual(names(applyMenuFilters(source, filters({ status: "live" }))), [
    "Live one",
  ]);
  assert.deepEqual(names(applyMenuFilters(source, filters({ status: "draft" }))), [
    "Draft one",
  ]);
});

section("two tags widen the result, tag plus status narrows it", () => {
  const veg: DietTag[] = ["veg"];
  const source = menu([
    "Mains",
    [
      dish("Paneer", { diet: ["veg"] }),
      dish("Falafel", { diet: ["vegan"] }),
      dish("Chicken", { diet: ["nonveg"] }),
      dish("Draft paneer", { diet: ["veg"], status: "draft" }),
    ],
  ]);

  // within a facet: OR
  assert.deepEqual(
    names(applyMenuFilters(source, filters({ diet: ["veg", "vegan"] }))),
    ["Paneer", "Falafel", "Draft paneer"],
  );
  // across facets: AND
  assert.deepEqual(
    names(applyMenuFilters(source, filters({ diet: veg, status: "draft" }))),
    ["Draft paneer"],
  );
});

section("needs-work flags find the gaps after an import", () => {
  const source = menu([
    "Mains",
    [
      dish("Complete"),
      dish("No photo", { imageUrl: null }),
      dish("No words", { description: "   " }),
      dish("No price", { price: null }),
      dish("Sold out", { isAvailable: false }),
    ],
  ]);

  assert.deepEqual(names(applyMenuFilters(source, filters({ flags: ["no_photo"] }))), [
    "No photo",
  ]);
  assert.deepEqual(names(applyMenuFilters(source, filters({ flags: ["no_price"] }))), [
    "No price",
  ]);
  assert.deepEqual(names(applyMenuFilters(source, filters({ flags: ["sold_out"] }))), [
    "Sold out",
  ]);
  // OR inside the facet
  assert.deepEqual(
    names(applyMenuFilters(source, filters({ flags: ["no_photo", "no_desc"] }))),
    ["No photo", "No words"],
  );
});

section("sorts order within a section and park nulls last", () => {
  const source = menu([
    "Fries",
    [
      dish("Medium", { price: 100, prepMinutes: 20 }),
      dish("Cheapest", { price: 60, prepMinutes: 30 }),
      dish("Market price", { price: null, prepMinutes: null }),
      dish("Priciest", { price: 200, prepMinutes: 5 }),
    ],
  ]);

  assert.deepEqual(names(applyMenuFilters(source, filters({ sort: "price_asc" }))), [
    "Cheapest",
    "Medium",
    "Priciest",
    "Market price",
  ]);
  assert.deepEqual(names(applyMenuFilters(source, filters({ sort: "price_desc" }))), [
    "Priciest",
    "Medium",
    "Cheapest",
    "Market price",
  ]);
  assert.deepEqual(names(applyMenuFilters(source, filters({ sort: "time_asc" }))), [
    "Priciest",
    "Medium",
    "Cheapest",
    "Market price",
  ]);
  assert.deepEqual(names(applyMenuFilters(source, filters({ sort: "name" }))), [
    "Cheapest",
    "Market price",
    "Medium",
    "Priciest",
  ]);
  // menu order is the untouched server order
  assert.deepEqual(names(applyMenuFilters(source, filters({ sort: "menu" }))), [
    "Medium",
    "Cheapest",
    "Market price",
    "Priciest",
  ]);
});

section("sorting never regroups sections", () => {
  const source = menu(
    ["Fries", [dish("Salted", { price: 60 })]],
    ["Drinks", [dish("Cola", { price: 40 })]],
  );
  const out = applyMenuFilters(source, filters({ sort: "price_asc" }));
  assert.deepEqual(
    out.map((category) => category.name),
    ["Fries", "Drinks"],
  );
});

section("active-filter count ignores sort and search", () => {
  assert.equal(countActiveFilters(filters({ sort: "name" })), 0);
  assert.equal(countActiveFilters(filters({ query: "peri" })), 0);
  assert.equal(
    countActiveFilters(filters({ status: "draft", diet: ["veg"], flags: ["no_photo"] })),
    3,
  );
  // ...but search alone still counts as "the list is filtered"
  assert.equal(isMenuFiltered(filters({ query: "peri" })), true);
  assert.equal(isMenuFiltered(filters({ query: "   " })), false);
  assert.equal(isMenuFiltered(filters({ sort: "name" })), false);
});

section("toggleFacet adds then removes", () => {
  assert.deepEqual(toggleFacet<DietTag>([], "veg"), ["veg"]);
  assert.deepEqual(toggleFacet<DietTag>(["veg", "jain"], "veg"), ["jain"]);
});

section("filtering leaves the source menu alone", () => {
  const source = menu(["Fries", [dish("B", { price: 200 }), dish("A", { price: 10 })]]);
  applyMenuFilters(source, filters({ sort: "price_asc" }));
  assert.deepEqual(names(source), ["B", "A"]);
});

console.log("\nall menu filter checks passed");
