/**
 * Pure-function checks for queue open/close automation helpers.
 * Run: npx --yes tsx src/lib/merchant/queue-hours.test.ts
 */
import assert from "node:assert/strict";
import {
  areQueueHoursUsable,
  isWithinOpenWindow,
  shouldAutoCloseSessions,
  shouldAutoStartSessions,
  type ZonedClock,
} from "./queue-hours";

const OPEN_DAYS = [1, 2, 3, 4, 5]; // Mon–Fri
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function clock(day: number, hhmm: string): ZonedClock {
  const [h, m] = hhmm.split(":").map(Number);
  return { day, minutes: h * 60 + m, dateKey: "2026-07-31" };
}

function section(name: string, fn: () => void) {
  fn();
  console.log(`ok  ${name}`);
}

section("areQueueHoursUsable fail-open", () => {
  assert.equal(areQueueHoursUsable("10:00", "22:00", OPEN_DAYS), true);
  assert.equal(areQueueHoursUsable("10:00", "10:00", OPEN_DAYS), false);
  assert.equal(areQueueHoursUsable("25:00", "22:00", OPEN_DAYS), false);
  assert.equal(areQueueHoursUsable("10:00", "22:00", []), false);
  assert.equal(areQueueHoursUsable("10:00", "22:00", [9]), false);
});

section("same-day: within open window", () => {
  assert.equal(isWithinOpenWindow(clock(1, "09:59"), "10:00", "22:00", OPEN_DAYS), false);
  assert.equal(isWithinOpenWindow(clock(1, "10:00"), "10:00", "22:00", OPEN_DAYS), true);
  assert.equal(isWithinOpenWindow(clock(1, "21:59"), "10:00", "22:00", OPEN_DAYS), true);
  assert.equal(isWithinOpenWindow(clock(1, "22:00"), "10:00", "22:00", OPEN_DAYS), false);
  assert.equal(isWithinOpenWindow(clock(0, "12:00"), "10:00", "22:00", OPEN_DAYS), false);
});

section("same-day: auto-close only after close / closed day (not pre-open)", () => {
  // Pre-open Monday — must NOT auto-close (manual early start stays live)
  assert.equal(shouldAutoCloseSessions(clock(1, "09:30"), "10:00", "22:00", OPEN_DAYS), false);
  // During hours
  assert.equal(shouldAutoCloseSessions(clock(1, "15:00"), "10:00", "22:00", OPEN_DAYS), false);
  // After close
  assert.equal(shouldAutoCloseSessions(clock(1, "22:00"), "10:00", "22:00", OPEN_DAYS), true);
  assert.equal(shouldAutoCloseSessions(clock(1, "23:30"), "10:00", "22:00", OPEN_DAYS), true);
  // Closed Sunday
  assert.equal(shouldAutoCloseSessions(clock(0, "12:00"), "10:00", "22:00", OPEN_DAYS), true);
  // Invalid hours → fail open
  assert.equal(shouldAutoCloseSessions(clock(1, "23:00"), "10:00", "10:00", OPEN_DAYS), false);
  assert.equal(shouldAutoCloseSessions(clock(1, "23:00"), "10:00", "22:00", []), false);
});

section("same-day: auto-start only inside open window", () => {
  assert.equal(shouldAutoStartSessions(clock(1, "09:30"), "10:00", "22:00", OPEN_DAYS), false);
  assert.equal(shouldAutoStartSessions(clock(1, "10:00"), "10:00", "22:00", OPEN_DAYS), true);
  assert.equal(shouldAutoStartSessions(clock(1, "15:00"), "10:00", "22:00", OPEN_DAYS), true);
  assert.equal(shouldAutoStartSessions(clock(1, "22:00"), "10:00", "22:00", OPEN_DAYS), false);
  assert.equal(shouldAutoStartSessions(clock(0, "12:00"), "10:00", "22:00", OPEN_DAYS), false);
});

section("overnight: within / after close / before open", () => {
  // 18:00–02:00
  assert.equal(isWithinOpenWindow(clock(1, "17:59"), "18:00", "02:00", ALL_DAYS), false);
  assert.equal(isWithinOpenWindow(clock(1, "18:00"), "18:00", "02:00", ALL_DAYS), true);
  assert.equal(isWithinOpenWindow(clock(1, "23:00"), "18:00", "02:00", ALL_DAYS), true);
  assert.equal(isWithinOpenWindow(clock(2, "01:00"), "18:00", "02:00", ALL_DAYS), true);
  assert.equal(isWithinOpenWindow(clock(2, "02:00"), "18:00", "02:00", ALL_DAYS), false);

  // After close (early morning) → auto-close
  assert.equal(shouldAutoCloseSessions(clock(2, "02:30"), "18:00", "02:00", ALL_DAYS), true);
  // Before open (afternoon) → do NOT auto-close
  assert.equal(shouldAutoCloseSessions(clock(2, "17:00"), "18:00", "02:00", ALL_DAYS), false);
  // During overnight hours → never auto-close
  assert.equal(shouldAutoCloseSessions(clock(1, "20:00"), "18:00", "02:00", ALL_DAYS), false);
});

section("start vs close are independent predicates", () => {
  // Pre-open: start idle, close idle
  assert.equal(shouldAutoStartSessions(clock(1, "09:00"), "10:00", "22:00", OPEN_DAYS), false);
  assert.equal(shouldAutoCloseSessions(clock(1, "09:00"), "10:00", "22:00", OPEN_DAYS), false);
  // During: start yes, close no
  assert.equal(shouldAutoStartSessions(clock(1, "12:00"), "10:00", "22:00", OPEN_DAYS), true);
  assert.equal(shouldAutoCloseSessions(clock(1, "12:00"), "10:00", "22:00", OPEN_DAYS), false);
  // After close: start no, close yes
  assert.equal(shouldAutoStartSessions(clock(1, "22:30"), "10:00", "22:00", OPEN_DAYS), false);
  assert.equal(shouldAutoCloseSessions(clock(1, "22:30"), "10:00", "22:00", OPEN_DAYS), true);
});

console.log("\nAll queue-hours checks passed.");
