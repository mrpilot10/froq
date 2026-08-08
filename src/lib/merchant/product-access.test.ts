/**
 * Pure-function checks for teammate product access.
 * Run: npx --yes tsx src/lib/merchant/product-access.test.ts
 */
import assert from "node:assert/strict";
import {
  accessibleProducts,
  memberCanAccessProduct,
  memberIsProductStaff,
  normalizeMemberProductIds,
} from "./product-access";

function section(name: string, fn: () => void) {
  fn();
  console.log(`ok  ${name}`);
}


section("owners reach every product regardless of product ids", () => {
  assert.equal(memberCanAccessProduct("owner", [], "menu"), true);
  assert.equal(memberCanAccessProduct("owner", ["queue"], "menu"), true);
});

section("empty product ids means all products", () => {
  assert.equal(memberCanAccessProduct("staff", [], "menu"), true);
  assert.equal(memberCanAccessProduct("manager", [], "menu"), true);
});

section("a scoped teammate only reaches their own products", () => {
  assert.equal(memberCanAccessProduct("staff", ["queue"], "menu"), false);
  assert.equal(memberCanAccessProduct("staff", ["queue", "menu"], "menu"), true);
  assert.equal(memberCanAccessProduct("manager", ["reservation"], "menu"), false);
});

section("unknown product ids are dropped, empty stays empty", () => {
  assert.deepEqual(normalizeMemberProductIds(["menu", "nope", "queue"]), ["menu", "queue"]);
  assert.deepEqual(normalizeMemberProductIds([]), []);
  assert.deepEqual(normalizeMemberProductIds(null), []);
  assert.deepEqual(normalizeMemberProductIds(undefined), []);
});

/**
 * Regression: "menu" used to be missing from the mapper's allowlist, so a
 * teammate scoped to AI Menu alone normalised to [] — which reads as "all
 * products" and silently handed them every product in the rail.
 */
section("a menu-only teammate keeps their scope and is not widened to all", () => {
  assert.deepEqual(normalizeMemberProductIds(["menu"]), ["menu"]);
  assert.notEqual(normalizeMemberProductIds(["menu"]).length, 0);
  assert.equal(memberCanAccessProduct("staff", normalizeMemberProductIds(["menu"]), "menu"), true);
  assert.equal(
    memberCanAccessProduct("staff", normalizeMemberProductIds(["menu"]), "loyalty"),
    false,
  );
});

section("accessible products narrow for a scoped teammate", () => {
  assert.deepEqual(accessibleProducts("staff", ["queue"]), ["queue"]);
  assert.ok(accessibleProducts("owner", []).includes("loyalty"));
});

section("menu floor staff must have menu access", () => {
  // queue-only staff work the waitlist, not the floor
  assert.equal(
    memberIsProductStaff({ role: "staff", productIds: ["queue"], joined: true }, "menu"),
    false,
  );
  assert.equal(
    memberIsProductStaff({ role: "staff", productIds: ["menu"], joined: true }, "menu"),
    true,
  );
  // no scoping at all = every product, so they are on the floor
  assert.equal(
    memberIsProductStaff({ role: "staff", productIds: [], joined: true }, "menu"),
    true,
  );
});

section("owners count as floor staff even though they never accept an invite", () => {
  assert.equal(
    memberIsProductStaff({ role: "owner", productIds: [], joined: false }, "menu"),
    true,
  );
});

section("a pending invite is not on the floor yet", () => {
  assert.equal(
    memberIsProductStaff({ role: "staff", productIds: ["menu"], joined: false }, "menu"),
    false,
  );
  assert.equal(
    memberIsProductStaff({ role: "manager", productIds: [], joined: false }, "menu"),
    false,
  );
});

section("an unrecognised role is treated as staff, not waved through", () => {
  assert.equal(
    memberIsProductStaff(
      { role: "superuser", productIds: ["queue"], joined: true },
      "menu",
    ),
    false,
  );
  assert.equal(
    memberIsProductStaff({ role: null, productIds: [], joined: false }, "menu"),
    false,
  );
});

section("the same rule scopes other products", () => {
  assert.equal(
    memberIsProductStaff({ role: "staff", productIds: ["queue"], joined: true }, "queue"),
    true,
  );
});

console.log("\nall product access checks passed");
