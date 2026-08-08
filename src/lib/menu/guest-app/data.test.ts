/**
 * Pure-function checks for the catalogue → design-artifact mapping.
 * Run: npx --yes tsx src/lib/menu/guest-app/data.test.ts
 */
import assert from "node:assert/strict";
import {
  accentFor,
  assistantPrompts,
  buildGuestMenuApp,
  categoryIds,
  dietCodes,
  formatGuestHoursLabel,
  metaLine,
  pickHeroPhoto,
  pickPopularItems,
} from "./data";
import type { MenuCategory, MenuItem } from "@/lib/menu/types";

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
    description: "Wood-fired, cultured butter. Served warm.",
    price: 180,
    imageUrl: null,
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

function category(name: string, items: MenuItem[]): MenuCategory {
  return { id: `cat-${name}`, name, sortOrder: 0, items };
}

section("category ids are url-safe and unique", () => {
  const ids = categoryIds([
    category("To start", []),
    category("Mains", []),
    category("To start", []),
    category("!!!", []),
  ]);
  assert.deepEqual(ids, ["to-start", "mains", "to-start-2", "section-4"]);
});

section("meta line names the most specific diet, then heat", () => {
  assert.equal(metaLine(dish("A", { diet: ["vegan"], spiceLevel: 2 })), "Vegan · medium");
  assert.equal(metaLine(dish("B", { diet: ["jain", "veg"] })), "Jain");
  assert.equal(
    metaLine(dish("C", { diet: ["veg", "gluten_free"] })),
    "Veg · Gluten-free",
  );
  // Heat 0 is "no chilli", not a claim worth printing.
  assert.equal(metaLine(dish("D", { diet: [], spiceLevel: 0 })), "");
});

section("diet codes collapse onto the guest-menu marks", () => {
  assert.deepEqual(dietCodes(dish("A", { diet: ["jain"] })), ["veg"]);
  assert.deepEqual(dietCodes(dish("B", { diet: ["vegan", "gluten_free"] })), ["vegan", "gf"]);
  // Veg and Jain both map to "veg" — the mark must not double up.
  assert.deepEqual(dietCodes(dish("C", { diet: ["veg", "jain"] })), ["veg"]);
  assert.deepEqual(dietCodes(dish("D", { diet: ["nonveg"] })), ["nonveg"]);
});

section("assistant chips ask common questions, not dish names", () => {
  const prompts = assistantPrompts([
    dish("Peri Peri", { diet: ["veg"], spiceLevel: 2, prepMinutes: 10, price: 70 }),
    dish("Thali", { diet: ["jain", "veg"], spiceLevel: 1, prepMinutes: 20, price: 220 }),
    dish("Salad", { diet: ["vegan", "gluten_free"], spiceLevel: 0, prepMinutes: 8, price: 160 }),
    dish("Short rib", { diet: ["chef_choice", "nonveg"], spiceLevel: 1, prepMinutes: 25, price: 890 }),
  ]);
  assert.ok(prompts.chips.includes("What's the spiciest?"));
  assert.ok(prompts.chips.includes("Any Jain options?"));
  assert.ok(prompts.chips.includes("Vegan dishes"));
  assert.ok(prompts.chips.includes("Gluten-free options"));
  assert.ok(prompts.chips.includes("Chef's favourites"));
  assert.ok(prompts.chips.includes("Ready in under 10 min"));
  // Never put a dish name on a chip — guests haven't ordered yet.
  for (const chip of [...prompts.chips, ...prompts.followups]) {
    assert.equal(chip.includes("Peri Peri"), false, chip);
    assert.equal(chip.includes("Short rib"), false, chip);
  }
});

section("assistant chips use the guest chrome pack when a translator is passed", () => {
  const t = (key: string, fallback: string) =>
    key === "p:spiciest" ? "ସବୁଠାରୁ ଅଧିକ ରାଗ କଣ?" : fallback;
  const prompts = assistantPrompts(
    [dish("Peri Peri", { diet: ["veg"], spiceLevel: 2, price: 70 })],
    {},
    t,
  );
  assert.ok(prompts.chips.includes("ସବୁଠାରୁ ଅଧିକ ରାଗ କଣ?"));
});

section("OR build localizes chef badge and suggestion chips", () => {
  const app = buildGuestMenuApp({
    slug: "meers-kitchen",
    businessName: "Meer's Kitchen",
    brandColor: "#16593F",
    lang: "OR",
    categories: [
      category("ମୁଖ୍ୟ", [
        dish("ଶର୍ଟ ରିବ୍", {
          diet: ["chef_choice"],
          spiceLevel: 2,
          prepMinutes: 20,
          price: 890,
        }),
      ]),
    ],
  });
  assert.equal(app.data.lang, "OR");
  assert.equal(app.data.menu[0].items[0].badge, "ଶେଫ୍‌ଙ୍କ ଚୟନ");
  assert.ok(app.data.chips.some((chip) => /[\u0B00-\u0B7F]/.test(chip)));
  assert.ok(app.data.chrome.OR?.["u:greeting"]);
});

section("accents stay readable under the header's white text", () => {
  const contrast = (hex: string) => {
    const [r, g, b] = hex.replace("#", "").match(/../g)!.map((p) => parseInt(p, 16) / 255);
    const ch = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 1.05 / (0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b) + 0.05);
  };

  // Dark brands pass through untouched.
  assert.equal(accentFor("#1F3A5F").accent, "#1f3a5f");
  // Pale brands are deepened rather than dropped, so the brand still reads.
  for (const pale of ["#F2E14A", "#CF9F5E", "#FFFFFF"]) {
    assert.ok(contrast(accentFor(pale).accent) >= 4.5, `${pale} must reach 4.5:1`);
  }
  // Only an unusable value falls back to the design's own colour.
  assert.equal(accentFor(null).accent, "#16593F");
  assert.equal(accentFor("not-a-colour").accent, "#16593F");
  assert.match(accentFor("#CF9F5E").accentSoft, /^#[0-9a-f]{6}$/);
});

section("the hero prefers a featured dish that has a photo", () => {
  const plain = dish("No photo");
  const later = dish("Later dish", { imageUrl: "/api/menu/photo/later" });
  const featured = dish("Featured fries", {
    diet: ["chef_choice"],
    imageUrl: "/api/menu/photo/featured",
  });
  assert.equal(pickHeroPhoto([featured, later], [plain, later, featured]), "/api/menu/photo/featured");
  assert.equal(pickHeroPhoto([plain], [plain, later]), "/api/menu/photo/later");
  assert.equal(pickHeroPhoto([plain], [plain]), null);
});

section("build maps a catalogue onto the artifact's contract", () => {
  const app = buildGuestMenuApp({
    slug: "meers-kitchen",
    businessName: "Meer's Kitchen",
    brandColor: "#16593F",
    tableNumber: 12,
    categories: [
      category("To start", [
        dish("Charred flatbread", { diet: ["veg"], allergens: ["gluten", "dairy"], price: 180 }),
      ]),
      category("Mains", [
        dish("Short rib", { diet: ["chef_choice"], prepMinutes: 20, price: 890 }),
      ]),
    ],
  });

  assert.deepEqual(
    app.data.menu.map((c) => c.id),
    ["to-start", "mains"],
  );
  assert.equal(app.data.menu[1].items[0].badge, "Chef's pick");
  assert.deepEqual(app.data.diet["Charred flatbread"], ["veg"]);
  assert.deepEqual(app.data.allergens["Charred flatbread"], ["gluten", "dairy"]);
  // Chef's choice tags lead the featured rail.
  assert.equal(app.data.featured[0].name, "Short rib");
  assert.equal(app.data.featured[0].why, "Wood-fired, cultured butter.");
  assert.deepEqual(app.data.signal, {});
  assert.equal(app.props.brand, "Meer's Kitchen");
  assert.equal(app.props.table, "T12");
  assert.deepEqual(app.data.offers, []);
  assert.equal(app.data.tableNumber, 12);
});

section("chef's choice rail prefers tagged picks over recent orders", () => {
  const flatbread = dish("Charred flatbread", { diet: ["veg"], sortOrder: 1 });
  const rib = dish("Short rib", { diet: ["chef_choice"], sortOrder: 2 });
  const fries = dish("Fries", { diet: ["veg"], sortOrder: 3 });
  const ranked = pickPopularItems(
    [flatbread, rib, fries],
    {
      byItemId: { [fries.id]: 9, [flatbread.id]: 4 },
      byName: {},
    },
    3,
  );
  assert.deepEqual(
    ranked.items.map((item) => item.name),
    ["Fries", "Charred flatbread", "Short rib"],
  );
  assert.deepEqual(ranked.signal, { Fries: 9, "Charred flatbread": 4 });

  const app = buildGuestMenuApp({
    slug: "meers-kitchen",
    businessName: "Meer's Kitchen",
    brandColor: null,
    tableNumber: null,
    categories: [category("Mains", [flatbread, rib, fries])],
    recentOrders: {
      byItemId: { [fries.id]: 9, [flatbread.id]: 4 },
      byName: {},
    },
  });
  assert.equal(app.data.featured[0].name, "Short rib");
  assert.deepEqual(app.data.signal, {});
});

section("a browsing guest with no table still gets a menu", () => {
  const app = buildGuestMenuApp({
    slug: "meers-kitchen",
    businessName: "Meer's Kitchen",
    brandColor: null,
    tableNumber: null,
    categories: [category("Mains", [dish("Curry", { price: null })])],
  });
  assert.equal(app.props.table, "");
  assert.equal(app.props.serviceNote, "");
  assert.equal(app.data.menu[0].items[0].price, 0);
  assert.equal(app.data.featured.length, 1);
});

section("dishes with no description still get a featured line", () => {
  const app = buildGuestMenuApp({
    slug: "meers-kitchen",
    businessName: "X",
    brandColor: null,
    tableNumber: null,
    categories: [category("Mains", [dish("Curry", { description: "   " })])],
  });
  assert.equal(app.data.featured[0].why, "A kitchen favourite.");
});

section("guest hours label for the hero topbar", () => {
  assert.equal(formatGuestHoursLabel("10:00", "22:00"), "Open 10:00 am – 10:00 pm");
  assert.equal(formatGuestHoursLabel(null, "22:00"), "");
  assert.equal(formatGuestHoursLabel("10:00", "10:00"), "");
  const app = buildGuestMenuApp({
    slug: "meers-kitchen",
    businessName: "X",
    brandColor: null,
    tableNumber: 4,
    categories: [category("Mains", [dish("Curry")])],
    openTime: "11:30",
    closeTime: "23:00",
  });
  assert.equal(app.props.hoursLabel, "Open 11:30 am – 11:00 pm");
  assert.equal(app.props.hasHours, true);
});

section("calories reach the guest keyed by dish name, and only when known", () => {
  const app = buildGuestMenuApp({
    slug: "meers-kitchen",
    businessName: "X",
    brandColor: null,
    tableNumber: null,
    categories: [
      category("Mains", [
        dish("Butter chicken", { calories: 700 }),
        dish("Dal", { calories: null }),
        // A dish the kitchen zeroed out is still "no figure", not "0 kcal".
        dish("Water", { calories: 0 }),
      ]),
    ],
  });
  assert.deepEqual(app.data.kcal, { "Butter chicken": 700 });
});

console.log("\nall guest-app data checks passed");
