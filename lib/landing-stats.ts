import { getSql } from "./db";

/**
 * The figures the landing page quotes about itself.
 *
 * Read from the shared reference tables rather than typed into the copy,
 * because a number on a public page is a claim: the catalogue grows every time
 * `npm run import:shared` runs, and a hand-written "9,000 past papers" is wrong
 * the first time it does.
 *
 * The fallbacks are the last verified counts. They exist so the front door
 * still renders if the database is unreachable — a marketing page is the worst
 * place to answer a visitor with a 500, and a slightly stale number is a far
 * smaller problem than no page at all.
 */
export type LandingStats = {
  subjects: number;
  syllabuses: number;
  papers: number;
  specPoints: number;
  qualifications: number;
};

const LAST_VERIFIED: LandingStats = {
  subjects: 484,
  syllabuses: 233,
  papers: 9393,
  specPoints: 12331,
  qualifications: 8,
};

/**
 * Held for an hour per warm instance. The landing page is server-rendered on
 * every request — it has to look the session up before it knows whether to be
 * marketing or the app — and counts that move a few times a year do not deserve
 * a database round trip on the front door's critical path.
 */
let cached: { at: number; stats: LandingStats } | null = null;
const TTL_MS = 60 * 60 * 1000;

export async function landingStats(): Promise<LandingStats> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.stats;
  try {
    const sql = getSql();
    const rows = await sql<Record<string, number>[]>`
      SELECT
        (SELECT COUNT(*)::int FROM catalogue_papers) AS papers,
        (SELECT COUNT(*)::int FROM syllabus_content WHERE kind = 'point') AS spec_points,
        (SELECT COUNT(DISTINCT record_id)::int FROM syllabus_content) AS syllabuses,
        (SELECT COUNT(DISTINCT qualification)::int FROM syllabus_versions) AS qualifications
    `;
    const row = rows[0];
    if (!row) return LAST_VERIFIED;
    const stats: LandingStats = {
      // The sign-up list is assembled from the catalogue and the directory
      // together, which is more work than a landing page should do on a cold
      // request. It moves far more slowly than the rest, so it stays pinned.
      subjects: LAST_VERIFIED.subjects,
      syllabuses: Number(row.syllabuses) || LAST_VERIFIED.syllabuses,
      papers: Number(row.papers) || LAST_VERIFIED.papers,
      specPoints: Number(row.spec_points) || LAST_VERIFIED.specPoints,
      qualifications: Number(row.qualifications) || LAST_VERIFIED.qualifications,
    };
    cached = { at: Date.now(), stats };
    return stats;
  } catch {
    // Not cached: a database that is down now may be up on the next request,
    // and pinning the fallback for an hour would outlast the outage.
    return LAST_VERIFIED;
  }
}
