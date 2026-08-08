/**
 * Pure-function checks for reservation-held queue ordering + ETA.
 * Run: npx --yes tsx src/lib/queue/ordering.test.ts
 */
import assert from "node:assert/strict";
import {
  compareQueueOrder,
  estimatedWaitMinutes,
  isPastGrace,
  isReservationDue,
  lineEntries,
  nextCallableEntry,
  partiesAhead,
  queuePositionAmong,
  reservationDisplayPhase,
  shouldActivateHeld,
  sortQueueEntries,
  type QueueOrderable,
} from "./ordering";

function section(name: string, fn: () => void) {
  fn();
  console.log(`ok  ${name}`);
}

/** 5:00 / 5:10 / 5:30 / 5:40 on a fixed day (epoch ms). */
const T_5_00 = Date.parse("2026-07-31T17:00:00+05:30");
const T_5_10 = Date.parse("2026-07-31T17:10:00+05:30");
const T_5_30 = Date.parse("2026-07-31T17:30:00+05:30");
const T_5_40 = Date.parse("2026-07-31T17:40:00+05:30");

function walkin(id: string, joinedAtMs: number): QueueOrderable {
  return { id, status: "waiting", kind: "walkin", joinedAtMs };
}

function held(id: string, reservationAtMs: number): QueueOrderable {
  return { id, status: "held", kind: "reservation", joinedAtMs: reservationAtMs };
}

function waitingRes(id: string, reservationAtMs: number): QueueOrderable {
  return {
    id,
    status: "waiting",
    kind: "reservation",
    joinedAtMs: reservationAtMs,
  };
}

section("walk-ins insert around held reservation (5:00–5:40 example)", () => {
  const A = walkin("A", T_5_00);
  const B = walkin("B", T_5_10);
  const John = held("John", T_5_30);
  const C = walkin("C", T_5_40);

  const ordered = sortQueueEntries([C, John, B, A]);
  assert.deepEqual(
    ordered.map((e) => e.id),
    ["A", "B", "John", "C"],
  );

  assert.equal(queuePositionAmong([A, B, John, C], "A"), 1);
  assert.equal(queuePositionAmong([A, B, John, C], "B"), 2);
  assert.equal(queuePositionAmong([A, B, John, C], "John"), 3);
  assert.equal(queuePositionAmong([A, B, John, C], "C"), 4);

  // Walk-in C's ETA includes John ahead (2 walk-ins + 1 held → ahead=3, with self=4×10).
  assert.equal(partiesAhead([A, B, John, C], "C"), 3);
  assert.equal(
    estimatedWaitMinutes({ partiesAhead: 3, minutesPerParty: 10 }),
    40,
  );
});

section("held reservation is not pushed when later walk-in joins", () => {
  const A = walkin("A", T_5_00);
  const John = held("John", T_5_30);
  const before = queuePositionAmong([A, John], "John");
  const C = walkin("C", T_5_40);
  const after = queuePositionAmong([A, John, C], "John");
  assert.equal(before, 2);
  assert.equal(after, 2);
});

section("call-next prefers due reservation over later walk-in", () => {
  const John = held("John", T_5_30);
  const C = walkin("C", T_5_40);
  // At 5:30: John is due, C is later.
  const next = nextCallableEntry([C, John], T_5_30);
  assert.equal(next?.id, "John");
});

section("call-next skips future holds so earlier walk-ins go first", () => {
  const A = walkin("A", T_5_00);
  const John = held("John", T_5_30);
  const next = nextCallableEntry([John, A], T_5_10);
  assert.equal(next?.id, "A");
});

section("held activates to waiting at reservation time (same position)", () => {
  const John = held("John", T_5_30);
  assert.equal(shouldActivateHeld(John, T_5_10), false);
  assert.equal(shouldActivateHeld(John, T_5_30), true);
  assert.equal(isReservationDue(John, T_5_30), true);

  const activated = waitingRes("John", T_5_30);
  const A = walkin("A", T_5_00);
  const C = walkin("C", T_5_40);
  assert.equal(queuePositionAmong([A, activated, C], "John"), 2);
  assert.equal(reservationDisplayPhase(John, T_5_10), "upcoming");
  assert.equal(reservationDisplayPhase(activated, T_5_30), "waiting");
});

section("grace release after reservation_at + grace", () => {
  const John = held("John", T_5_30);
  assert.equal(
    isPastGrace({
      kind: "reservation",
      status: "held",
      joinedAtMs: T_5_30,
      graceMinutes: 15,
      nowMs: T_5_30 + 14 * 60_000,
    }),
    false,
  );
  assert.equal(
    isPastGrace({
      kind: "reservation",
      status: "held",
      joinedAtMs: T_5_30,
      graceMinutes: 15,
      nowMs: T_5_30 + 15 * 60_000 + 1,
    }),
    true,
  );
});

section("seated/left drop out of line; ETA recalculates", () => {
  const A = walkin("A", T_5_00);
  const B = { ...walkin("B", T_5_10), status: "seated" as const };
  const John = held("John", T_5_30);
  const C = walkin("C", T_5_40);
  assert.deepEqual(
    lineEntries([A, B, John, C]).map((e) => e.id),
    ["A", "John", "C"],
  );
  assert.equal(queuePositionAmong([A, B, John, C], "C"), 3);
  assert.equal(partiesAhead([A, B, John, C], "C"), 2);
});

section("stable tie-break on equal timestamps", () => {
  const a = walkin("aaa", T_5_00);
  const b = walkin("bbb", T_5_00);
  assert.ok(compareQueueOrder(a, b) < 0);
});

console.log("\nAll ordering tests passed.");
