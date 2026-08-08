/**
 * Branch-level dining table inventory — shared by Waitlist, Reservations, and
 * AI Menu. Merchants configure seats × quantity; we expand that into numbered
 * tables.
 */

export interface TableLayoutRow {
  /** Seats at each table in this group. */
  seats: number;
  /** How many tables of this size. */
  quantity: number;
}

export interface DiningTable {
  id: string;
  branchId: string;
  number: number;
  seats: number;
  label: string | null;
  status: "active" | "inactive";
  sortOrder: number;
}

/** Expanded preview / editable draft before save. */
export interface GeneratedTable {
  number: number;
  seats: number;
}

export const DEFAULT_TABLE_LAYOUT: TableLayoutRow[] = [
  { seats: 2, quantity: 4 },
  { seats: 4, quantity: 6 },
  { seats: 6, quantity: 2 },
];

export function defaultGeneratedTables(): GeneratedTable[] {
  return expandLayoutToTables(DEFAULT_TABLE_LAYOUT);
}

/** Assumed dining turn when checking reservation overlaps (minutes). */
export const DEFAULT_TABLE_TURN_MINUTES = 90;

const MAX_LAYOUT_ROWS = 12;
const MAX_QUANTITY_PER_ROW = 40;
const MAX_SEATS = 50;
const MAX_TOTAL_TABLES = 80;

export function emptyLayoutRow(): TableLayoutRow {
  return { seats: 2, quantity: 1 };
}

export function parseTableLayout(raw: unknown): TableLayoutRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: TableLayoutRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const seats = Number((item as { seats?: unknown }).seats);
    const quantity = Number((item as { quantity?: unknown }).quantity);
    if (!Number.isFinite(seats) || !Number.isFinite(quantity)) continue;
    const s = Math.round(seats);
    const q = Math.round(quantity);
    if (s < 1 || q < 1) continue;
    rows.push({ seats: s, quantity: q });
  }
  return rows;
}

export function validateTableLayout(layout: TableLayoutRow[]): string | null {
  if (layout.length === 0) return "Add at least one table size.";
  if (layout.length > MAX_LAYOUT_ROWS) return "Too many size groups.";
  let total = 0;
  for (const row of layout) {
    if (!Number.isFinite(row.seats) || row.seats < 1 || row.seats > MAX_SEATS) {
      return `Seats must be between 1 and ${MAX_SEATS}.`;
    }
    if (
      !Number.isFinite(row.quantity) ||
      row.quantity < 1 ||
      row.quantity > MAX_QUANTITY_PER_ROW
    ) {
      return `Quantity must be between 1 and ${MAX_QUANTITY_PER_ROW}.`;
    }
    total += row.quantity;
  }
  if (total > MAX_TOTAL_TABLES) {
    return `At most ${MAX_TOTAL_TABLES} tables per branch.`;
  }
  return null;
}

/**
 * Expand seats×quantity into numbered tables, sorted by seats ascending then
 * creation order within a size (Table 1…N).
 */
export function expandLayoutToTables(layout: TableLayoutRow[]): GeneratedTable[] {
  const sorted = [...layout].sort((a, b) => a.seats - b.seats || a.quantity - b.quantity);
  const tables: GeneratedTable[] = [];
  let number = 1;
  for (const row of sorted) {
    for (let i = 0; i < row.quantity; i += 1) {
      tables.push({ number, seats: row.seats });
      number += 1;
    }
  }
  return tables;
}

/** Collapse individual tables back into seats × quantity for storage. */
export function layoutFromTables(
  tables: ReadonlyArray<{ seats: number }>,
): TableLayoutRow[] {
  const counts = new Map<number, number>();
  for (const table of tables) {
    const seats = Math.round(table.seats);
    if (seats < 1) continue;
    counts.set(seats, (counts.get(seats) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seats, quantity]) => ({ seats, quantity }));
}

export function nextTableNumber(
  tables: ReadonlyArray<{ number: number }>,
): number {
  let max = 0;
  for (const table of tables) {
    const n = Math.round(table.number);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export function validateDiningTableDraft(
  tables: ReadonlyArray<{ number: number; seats: number }>,
): string | null {
  if (tables.length > MAX_TOTAL_TABLES) {
    return `At most ${MAX_TOTAL_TABLES} tables per branch.`;
  }
  const seen = new Set<number>();
  for (const table of tables) {
    const number = Math.round(table.number);
    const seats = Math.round(table.seats);
    if (!Number.isFinite(number) || number < 1) {
      return "Table numbers must be 1 or higher.";
    }
    if (seen.has(number)) return `Table number ${number} is used twice.`;
    seen.add(number);
    if (!Number.isFinite(seats) || seats < 1 || seats > MAX_SEATS) {
      return `Seats must be between 1 and ${MAX_SEATS}.`;
    }
  }
  return null;
}

export function summarizeTableLayout(layout: TableLayoutRow[]): string {
  if (layout.length === 0) return "Not configured";
  const tables = expandLayoutToTables(layout);
  const sizes = [...new Set(tables.map((t) => t.seats))].sort((a, b) => a - b);
  const sizeBit =
    sizes.length <= 3
      ? sizes.map((s) => `${s}-seat`).join(" · ")
      : `${sizes[0]}–${sizes[sizes.length - 1]} seats`;
  return `${tables.length} table${tables.length === 1 ? "" : "s"} · ${sizeBit}`;
}

export function summarizeDiningTables(
  tables: ReadonlyArray<{ seats: number }>,
): string {
  return summarizeTableLayout(layoutFromTables(tables));
}

/**
 * Smallest active table that fits the party. Prefer tight fits so larger
 * tables stay free for bigger groups.
 */
export function pickBestTable<T extends { id: string; seats: number; status?: string }>(
  tables: readonly T[],
  partySize: number,
  occupiedIds: ReadonlySet<string> = new Set(),
): T | null {
  const candidates = tables
    .filter(
      (t) =>
        (t.status ?? "active") === "active" &&
        t.seats >= partySize &&
        !occupiedIds.has(t.id),
    )
    .sort((a, b) => a.seats - b.seats || 0);
  return candidates[0] ?? null;
}

/** Smallest seat capacity that can host this party (from inventory). */
export function requiredSeatsForParty(
  tables: ReadonlyArray<{ seats: number; status?: string }>,
  partySize: number,
): number | null {
  const sizes = [
    ...new Set(
      tables
        .filter((t) => (t.status ?? "active") === "active")
        .map((t) => t.seats)
        .filter((s) => s >= partySize),
    ),
  ].sort((a, b) => a - b);
  return sizes[0] ?? null;
}

/**
 * Among waiting parties, pick who should take a newly freed table — oldest
 * party that fits, preferring the tightest fit so we don't waste capacity.
 */
export function recommendPartyForTable<
  T extends { id: string; partySize: number; joinedAtMs: number },
>(
  tableSeats: number,
  waiting: readonly T[],
): T | null {
  const fits = waiting
    .filter((p) => p.partySize <= tableSeats)
    .sort((a, b) => {
      // Prefer parties that use the table more tightly, then FIFO.
      const wasteA = tableSeats - a.partySize;
      const wasteB = tableSeats - b.partySize;
      if (wasteA !== wasteB) return wasteA - wasteB;
      return a.joinedAtMs - b.joinedAtMs;
    });
  return fits[0] ?? null;
}

/**
 * Rough wait: parties ahead competing for the same size pool, accounting for
 * how many of those tables are free right now.
 */
export function estimateWaitForParty(input: {
  partySize: number;
  tables: ReadonlyArray<{ seats: number; status?: string }>;
  waitingAhead: ReadonlyArray<{ partySize: number }>;
  /** Seat counts of currently occupied tables. */
  occupiedSeats: readonly number[];
  minutesPerTurn: number;
}): number {
  const need = requiredSeatsForParty(input.tables, input.partySize);
  if (need == null) {
    return Math.max(0, input.waitingAhead.length) * input.minutesPerTurn;
  }

  const exact = input.tables.filter(
    (t) => (t.status ?? "active") === "active" && t.seats === need,
  );
  const pool =
    exact.length > 0
      ? exact
      : input.tables.filter(
          (t) => (t.status ?? "active") === "active" && t.seats >= need,
        );
  if (pool.length === 0) {
    return Math.max(0, input.waitingAhead.length) * input.minutesPerTurn;
  }

  const occupiedInPool = input.occupiedSeats.filter((s) =>
    exact.length > 0 ? s === need : s >= need,
  ).length;
  const freeNow = Math.max(0, pool.length - occupiedInPool);
  const maxPoolSeats = Math.max(...pool.map((t) => t.seats));

  const rivals = input.waitingAhead.filter((p) => {
    const theirNeed = requiredSeatsForParty(input.tables, p.partySize);
    if (theirNeed == null) return false;
    if (exact.length > 0) return theirNeed === need;
    return p.partySize <= maxPoolSeats;
  });

  const queued = rivals.length;
  if (freeNow > queued) return 0;
  const turns = Math.ceil((queued - freeNow + 1) / pool.length);
  return Math.max(0, turns) * input.minutesPerTurn;
}

/** HH:MM + minutes → HH:MM (same day, wraps past midnight for overlap math). */
export function addMinutesToTime(timeHHMM: string, minutes: number): number {
  const [h, m] = timeHHMM.split(":").map((n) => Number(n));
  const start = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  return start + minutes;
}

export function timesOverlap(
  aStartMin: number,
  aEndMin: number,
  bStartMin: number,
  bEndMin: number,
): boolean {
  return aStartMin < bEndMin && bStartMin < aEndMin;
}
