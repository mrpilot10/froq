/**
 * Pure-function checks for the anonymous menu endpoint throttle.
 * Run: npx --yes tsx src/lib/menu/guest-throttle.test.ts
 */
import assert from "node:assert/strict";
import { resetThrottle, throttle } from "./guest-throttle";

function section(name: string, fn: () => void) {
  resetThrottle();
  fn();
  console.log(`ok  ${name}`);
}

const rule = { limit: 3, windowMs: 60_000 };

section("a caller gets its allowance before being held back", () => {
  const now = 1_000_000;
  for (let i = 0; i < rule.limit; i += 1) {
    assert.equal(throttle("ip-a", rule, now).ok, true, `call ${i + 1} should pass`);
  }
  const blocked = throttle("ip-a", rule, now);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok === false && blocked.retryAfter, 60);
});

section("callers are counted separately", () => {
  const now = 1_000_000;
  for (let i = 0; i < rule.limit; i += 1) throttle("ip-a", rule, now);
  assert.equal(throttle("ip-b", rule, now).ok, true);
});

section("the window slides rather than resetting on the hour", () => {
  const start = 1_000_000;
  for (let i = 0; i < rule.limit; i += 1) throttle("ip-a", rule, start + i * 1_000);
  assert.equal(throttle("ip-a", rule, start + 3_000).ok, false);
  // The first call ages out, so exactly one slot reopens.
  assert.equal(throttle("ip-a", rule, start + 60_001).ok, true);
  assert.equal(throttle("ip-a", rule, start + 60_002).ok, false);
});

section("retryAfter counts down as the oldest call ages", () => {
  const start = 1_000_000;
  for (let i = 0; i < rule.limit; i += 1) throttle("ip-a", rule, start);
  const soon = throttle("ip-a", rule, start + 59_000);
  assert.equal(soon.ok === false && soon.retryAfter, 1);
});

console.log("\nall throttle checks passed");
