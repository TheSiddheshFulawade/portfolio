// Test support only: a D1-shaped wrapper over Node's built-in SQLite, so the counter's SQL runs against a real
// SQLite engine in tests (spec 003 V11-03). Implements just the D1 calls the store uses.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Database, D1PreparedStatement } from './visit-store.ts';

type Value = string | number | null;

class Statement implements D1PreparedStatement {
  readonly db: DatabaseSync;
  readonly sql: string;
  readonly values: Value[];

  constructor(db: DatabaseSync, sql: string, values: Value[] = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: Value[]): D1PreparedStatement {
    return new Statement(this.db, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async run(): Promise<unknown> {
    return this.db.prepare(this.sql).run(...this.values);
  }
}

/** An in-memory database with the migrations applied. `batch` runs in one transaction, like D1. */
export function sqliteD1(migrations: string[]): D1Database & { close(): void } {
  const db = new DatabaseSync(':memory:');
  for (const file of migrations) db.exec(readFileSync(file, 'utf8'));
  return {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(statements: D1PreparedStatement[]) {
      db.exec('BEGIN');
      try {
        const results = statements.map((s) => {
          const st = s as Statement;
          return st.db.prepare(st.sql).run(...st.values);
        });
        db.exec('COMMIT');
        return results;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => db.close(),
  };
}
