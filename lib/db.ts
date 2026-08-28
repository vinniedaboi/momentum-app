import postgres from "postgres";

/**
 * Postgres access for route handlers.
 *
 * The app connects through Supabase's transaction pooler as the `postgres`
 * role, which bypasses row level security. Tenant isolation is therefore the
 * responsibility of the callers in lib/*-db.ts: every statement filters on
 * `workspace_id`. The RLS policies in supabase/migrations/0004 cover the
 * separate PostgREST surface that the browser's publishable key can reach.
 */

type Sql = ReturnType<typeof postgres>;

/**
 * Accepts either the pool or a transaction handle, so a helper can be reused
 * inside `sql.begin()` without opening a second connection — which would sit
 * outside the caller's transaction and see none of its uncommitted rows.
 *
 * `ISql` is the query-issuing surface both `Sql` and `TransactionSql` extend;
 * the pool-only lifecycle methods (END, listen, …) are deliberately excluded.
 */
export type SqlClient = postgres.ISql;

declare global {
  // Reused across hot reloads in development so `next dev` does not open a new
  // pool on every edit.
  var __studyTrackerSql: Sql | undefined;
}

let client: Sql | undefined = globalThis.__studyTrackerSql;

/**
 * Lazy so that a missing DATABASE_URL fails on the first query rather than at
 * module load, which would break `next build`.
 */
export function getSql(): Sql {
  if (client) return client;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy the transaction pooler connection string from " +
        "Supabase -> Project Settings -> Database into .env.local.",
    );
  }

  client = postgres(connectionString, {
    // The transaction pooler (port 6543) multiplexes connections, so named
    // prepared statements cannot be reused between queries.
    prepare: false,
    // On Vercel every warm function instance holds its own pool, and there can
    // be hundreds of them. One connection each keeps the fleet inside
    // Supabase's pooler limit; locally a handful is friendlier to `next dev`,
    // which serves many requests from a single process.
    max: process.env.VERCEL ? 1 : 5,
    // Idle connections are useless once a serverless instance freezes, and
    // holding them just occupies a pooler slot.
    idle_timeout: process.env.VERCEL ? 5 : 20,
    connect_timeout: 15,
  });

  if (process.env.NODE_ENV !== "production") globalThis.__studyTrackerSql = client;
  return client;
}

/**
 * Awaits database work one item at a time.
 *
 * `Promise.all` is the obvious tool for independent queries and is safe almost
 * everywhere — but not against this pool. On Vercel `max` is 1, and issuing
 * concurrent queries on that single connection *after it has already served a
 * query* deadlocks: nothing rejects, nothing times out, the request simply
 * never returns and the function is killed with no status code in the log.
 *
 * The first query of a request is not enough to trigger it, which is what makes
 * this so easy to miss — a page whose very first act is `Promise.all` is fine,
 * and the same call placed after any other query hangs forever. It does not
 * reproduce locally either, where `max` is 5.
 *
 * Sequential costs a few hundred milliseconds and always completes. Prefer it
 * over `Promise.all` for anything that touches the database.
 */
export async function series<T extends readonly (() => Promise<unknown>)[]>(
  tasks: readonly [...T],
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = [];
  for (const task of tasks) results.push(await task());
  return results as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}

/** ISO-8601 UTC, the timestamp format every text timestamp column stores. */
export function nowIso() {
  return new Date().toISOString();
}
