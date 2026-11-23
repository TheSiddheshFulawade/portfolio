// Spec 003 V11-03 (REQ-COUNT-002, REQ-COUNT-004): D1 storage for the visitor counter.
// Schema: migrations/0001_visits.sql. One visit is a single D1 batch, which D1 runs as one transaction:
//   1. record (day, hash), ignoring a repeat;
//   2. set today's count to the number of distinct hashes today (exact, whatever the interleaving);
//   3. delete hashes older than two days (REQ-COUNT-003).

/** The part of the Cloudflare D1 API this store uses (kept local, so no type package is needed). */
export interface D1PreparedStatement {
  bind(...values: (string | number | null)[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface Totals {
  total: number;
  today: number;
}

/** Days of visitor hashes to keep: today and yesterday. */
const KEEP_DAYS = 2;

function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export async function recordVisit(db: D1Database, day: string, hash: string): Promise<Totals> {
  await db.batch([
    db
      .prepare('INSERT OR IGNORE INTO daily_visitors (day, visitor_hash) VALUES (?1, ?2)')
      .bind(day, hash),
    db
      .prepare(
        `INSERT INTO totals (day, unique_visitors)
         SELECT ?1, COUNT(*) FROM daily_visitors WHERE day = ?1
         ON CONFLICT (day) DO UPDATE SET unique_visitors = excluded.unique_visitors`,
      )
      .bind(day),
    db.prepare('DELETE FROM daily_visitors WHERE day < ?1').bind(daysBefore(day, KEEP_DAYS - 1)),
  ]);
  return readTotals(db, day);
}

export async function readTotals(db: D1Database, day: string): Promise<Totals> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(unique_visitors), 0) AS total,
              COALESCE(SUM(CASE WHEN day = ?1 THEN unique_visitors END), 0) AS today
       FROM totals`,
    )
    .bind(day)
    .first<Totals>();
  return { total: Number(row?.total ?? 0), today: Number(row?.today ?? 0) };
}
