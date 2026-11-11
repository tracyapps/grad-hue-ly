/**
 * One tagged-template SQL helper for every route:
 *   const rows = await sql`select … where id = ${id}`;
 * Production uses Neon's HTTP driver. Tests swap in an in-memory Postgres
 * (setTestSql) so the real queries run against a real database engine.
 */

import { neon } from "@neondatabase/serverless";

export type Row = Record<string, unknown>;
export type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;

let override: Sql | null = null;
let prod: Sql | null = null;

/** Tests only. */
export function setTestSql(fn: Sql | null) {
  override = fn;
}

export const sql: Sql = (strings, ...values) => {
  if (override) return override(strings, ...values);
  if (!prod) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured");
    prod = neon(url) as unknown as Sql;
  }
  return prod(strings, ...values);
};
