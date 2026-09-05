import { getSql } from "./db";

/**
 * Read access to the Cambridge syllabus directory and the spec-point content
 * parsed from the official PDFs. Both tables are shared across accounts and are
 * populated offline by scripts/import-shared-data.mjs; the app only reads them.
 */

export type SyllabusVersion = {
  recordId: string;
  board: string;
  qualification: string;
  subject: string;
  syllabusCode: string;
  yearFrom: number | null;
  yearTo: number | null;
  isCurrent: boolean;
  isLatest: boolean;
  pdfUrl: string | null;
  pageUrl: string | null;
  notes: string | null;
  /** The stages this syllabus splits into, or null to leave it to the qualification. */
  stages: string[] | null;
  chapters: number;
  points: number;
};

/**
 * What one component of a syllabus is worth, read from the board's own
 * assessment overview rather than assumed. A paper counting towards both the
 * AS and the full A Level appears once per award, because they are two
 * different qualifications with two different totals.
 */
export type AssessmentComponent = {
  syllabusCode: string;
  /** "Paper 4". */
  component: string;
  number: number;
  title: string | null;
  /** The raw total the paper is marked out of, where the syllabus states it. */
  marks: number | null;
  /** "Core", "Extended", "Mechanics" — empty where the syllabus has no branches. */
  route: string;
  /** "AS", "A Level", or "qualification" for a course awarded in one go. */
  award: string;
  weighting: number;
  /** "Compulsory for A Level", "Offered only as part of AS Level". */
  rule: string | null;
};

/**
 * Where a syllabus's own figures came from.
 *
 * The weightings and mark totals on the grade planner are read out of a
 * specific PDF, and a screen that quietly presents them as its own is asking to
 * be believed on a number it cannot defend. This is the citation: which
 * document, which exam window, and a link to the thing itself so a learner who
 * doubts a figure can check it in one press rather than take our word for it.
 */
export type SyllabusSource = {
  syllabusCode: string;
  board: string;
  qualification: string;
  subject: string;
  yearFrom: number | null;
  yearTo: number | null;
  isCurrent: boolean;
  pdfUrl: string | null;
  pageUrl: string | null;
};

export type SyllabusContentRow = {
  code: string;
  kind: "chapter" | "point";
  parentCode: string | null;
  title: string;
  academicLevel: string | null;
};

/**
 * The directory writes a syllabus's stages as `SL|HL`, and `none` for one with
 * no split at all — the IB Diploma core is examined without levels. An empty
 * column, which is every board that has nothing to say about it, reads as null
 * and leaves the split to the qualification's default.
 */
export function parseStages(value: unknown): string[] | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw === "none") return [];
  return raw.split("|").map((stage) => stage.trim()).filter(Boolean);
}

export async function getSyllabusVersions(): Promise<SyllabusVersion[]> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT v.*,
      (SELECT COUNT(*)::int FROM syllabus_content c WHERE c.record_id = v.record_id AND c.kind = 'chapter') AS chapters,
      (SELECT COUNT(*)::int FROM syllabus_content c WHERE c.record_id = v.record_id AND c.kind = 'point') AS points
    FROM syllabus_versions v
    ORDER BY v.subject, v.year_from DESC
  `;

  return rows.map((row) => ({
    recordId: String(row.record_id),
    board: String(row.board),
    qualification: String(row.qualification),
    subject: String(row.subject),
    syllabusCode: String(row.syllabus_code),
    yearFrom: row.year_from == null ? null : Number(row.year_from),
    yearTo: row.year_to == null ? null : Number(row.year_to),
    isCurrent: Boolean(row.is_current),
    isLatest: Boolean(row.is_latest),
    pdfUrl: row.pdf_url ? String(row.pdf_url) : null,
    pageUrl: row.page_url ? String(row.page_url) : null,
    notes: row.notes ? String(row.notes) : null,
    stages: parseStages(row.stages),
    chapters: Number(row.chapters ?? 0),
    points: Number(row.points ?? 0),
  }));
}

/** The parsed chapter/point tree for one syllabus version, in reading order. */
export async function getSyllabusContent(recordId: string): Promise<SyllabusContentRow[]> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT code, kind, parent_code, title, academic_level
    FROM syllabus_content
    WHERE record_id = ${recordId}
    ORDER BY seq
  `;

  return rows.map((row) => ({
    code: String(row.code),
    kind: row.kind === "chapter" ? "chapter" : "point",
    parentCode: row.parent_code ? String(row.parent_code) : null,
    title: String(row.title),
    academicLevel: row.academic_level ? String(row.academic_level) : null,
  }));
}


/**
 * Every component of a syllabus, best award first.
 *
 * Ordered so a planner can read the list straight down: the components of one
 * award together, in paper order. Empty for a syllabus whose overview could
 * not be read — every board but Cambridge, and a handful of Cambridge's own —
 * which is the planner's cue to ask the learner rather than to guess.
 */
export async function getSyllabusAssessment(syllabusCode: string): Promise<AssessmentComponent[]> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT syllabus_code, component, component_number, component_title, marks,
           route, award, weighting_percent, rule
    FROM syllabus_assessment
    WHERE syllabus_code = ${syllabusCode}
    ORDER BY award, component_number
  `;

  return rows.map((row) => ({
    syllabusCode: String(row.syllabus_code),
    component: String(row.component),
    number: Number(row.component_number),
    title: row.component_title ? String(row.component_title) : null,
    marks: row.marks == null ? null : Number(row.marks),
    route: String(row.route ?? ""),
    award: String(row.award),
    weighting: Number(row.weighting_percent),
    rule: row.rule ? String(row.rule) : null,
  }));
}

/**
 * One past session's grade boundaries, as a share of the whole award.
 *
 * `weight` is how much of the award the papers behind the figures add up to;
 * only a session that covers the lot is offered, because a boundary averaged
 * over half a course is not that course's boundary.
 */
export type SessionBoundaries = {
  year: number;
  season: string;
  variant: string | null;
  a: number;
  b: number;
  c: number;
};

/**
 * What each grade actually took in past sessions of a syllabus.
 *
 * The catalogue carries the board's published thresholds as raw marks per
 * paper; `syllabus_assessment` carries what each paper is marked out of and
 * what it is worth. Together they give the only figure the grade screens can
 * use: the share of the whole award a grade started at.
 *
 * Two approximations are worth naming, because the screen offering these says
 * so. Cambridge awards on a total scaled mark rather than by averaging its
 * components, so a weighted mean of component thresholds lands near the real
 * award boundary rather than on it. And the weightings are the syllabus's
 * current ones, which a revision between sessions can move.
 */
export async function getSessionBoundaries(
  syllabusCode: string,
  award: string,
): Promise<SessionBoundaries[]> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    WITH paper AS (
      SELECT c.year, c.season, c.variant,
             a.weighting_percent AS weight,
             100.0 * c.threshold_a / a.marks AS pct_a,
             100.0 * c.threshold_b / a.marks AS pct_b,
             100.0 * c.threshold_c / a.marks AS pct_c
      FROM catalogue_papers c
      JOIN syllabus_assessment a
        ON a.syllabus_code = c.syllabus_code
       AND a.component_number::text = c.component
      WHERE c.syllabus_code = ${syllabusCode}
        AND a.award = ${award}
        AND a.marks > 0
        AND c.threshold_a IS NOT NULL
        AND c.threshold_b IS NOT NULL
        AND c.threshold_c IS NOT NULL
    )
    SELECT year, season, variant,
           SUM(pct_a * weight) / SUM(weight) AS a,
           SUM(pct_b * weight) / SUM(weight) AS b,
           SUM(pct_c * weight) / SUM(weight) AS c
    FROM paper
    GROUP BY year, season, variant
    HAVING SUM(weight) >= 99 AND SUM(weight) <= 101
    ORDER BY year DESC, season, variant
    LIMIT 40
  `;

  return rows.map((row) => ({
    year: Number(row.year),
    season: String(row.season),
    variant: row.variant ? String(row.variant) : null,
    a: Math.round(Number(row.a) * 10) / 10,
    b: Math.round(Number(row.b) * 10) / 10,
    c: Math.round(Number(row.c) * 10) / 10,
  }));
}

/**
 * The document a syllabus's assessment figures were read from.
 *
 * A code can be listed for more than one exam window — 9702 runs 2025–2027 and
 * again 2028–2030 — and the one a candidate is sitting now is the one worth
 * citing, so the session in force wins, then the newest published, then the
 * latest window. Null for a code with no directory entry, which is the
 * planner's cue to say nothing rather than to cite a document it cannot name.
 */
export async function getSyllabusSource(syllabusCode: string): Promise<SyllabusSource | null> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT syllabus_code, board, qualification, subject,
           year_from, year_to, is_current, pdf_url, page_url
    FROM syllabus_versions
    WHERE syllabus_code = ${syllabusCode}
    ORDER BY is_current DESC, is_latest DESC, year_from DESC NULLS LAST
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;
  return {
    syllabusCode: String(row.syllabus_code),
    board: String(row.board),
    qualification: String(row.qualification),
    subject: String(row.subject),
    yearFrom: row.year_from == null ? null : Number(row.year_from),
    yearTo: row.year_to == null ? null : Number(row.year_to),
    isCurrent: Boolean(row.is_current),
    pdfUrl: row.pdf_url ? String(row.pdf_url) : null,
    pageUrl: row.page_url ? String(row.page_url) : null,
  };
}
