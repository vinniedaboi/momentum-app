import { getSql, series } from "./db";

/**
 * Read access to the shared Cambridge past-paper catalogue. This table is the
 * same for every account, so nothing here is workspace-scoped; the per-user
 * annotations on a catalogue paper live in `paper_meta` instead.
 */

export type CatalogueRow = {
  id: string;
  board: string;
  qualification: string;
  subject: string;
  syllabusCode: string;
  label: string;
  year: number;
  season: string;
  seasonCode: string;
  component: string | null;
  variant: string | null;
  paperUnitCode: string;
  stage: string | null;
  difficulty: string | null;
  thresholdA: number | null;
  thresholdB: number | null;
  thresholdC: number | null;
  qpUrl: string | null;
  msUrl: string | null;
  erUrl: string | null;
};

export type CatalogueFilters = {
  qualification?: string;
  subject?: string;
  stage?: string;
  years: number[];
  seasons: string[];
  components: string[];
  variants: string[];
  difficulties: string[];
  ids: string[];
  search?: string;
  sort: string;
  page: number;
  pageSize: number;
};

function mapRow(row: Record<string, unknown>): CatalogueRow {
  return {
    id: String(row.id),
    board: String(row.board),
    qualification: String(row.qualification),
    subject: String(row.subject),
    syllabusCode: String(row.syllabus_code),
    label: String(row.label),
    year: Number(row.year),
    season: String(row.season),
    seasonCode: String(row.season_code),
    component: row.component ? String(row.component) : null,
    variant: row.variant ? String(row.variant) : null,
    paperUnitCode: String(row.paper_unit_code),
    stage: row.stage ? String(row.stage) : null,
    difficulty: row.difficulty ? String(row.difficulty) : null,
    thresholdA: row.threshold_a == null ? null : Number(row.threshold_a),
    thresholdB: row.threshold_b == null ? null : Number(row.threshold_b),
    thresholdC: row.threshold_c == null ? null : Number(row.threshold_c),
    qpUrl: row.qp_url ? String(row.qp_url) : null,
    msUrl: row.ms_url ? String(row.ms_url) : null,
    erUrl: row.er_url ? String(row.er_url) : null,
  };
}

/**
 * Collects bind values and hands back the matching `$n` placeholder. The filter
 * set is combinatorial, so the WHERE clause is assembled rather than written
 * out; every user-supplied value still goes through a parameter.
 */
function binder() {
  const params: unknown[] = [];
  return {
    params,
    add(value: unknown) {
      params.push(value);
      return `$${params.length}`;
    },
  };
}

function buildWhere(filters: CatalogueFilters, bind: ReturnType<typeof binder>) {
  const clauses: string[] = [];

  if (filters.qualification) clauses.push(`qualification = ${bind.add(filters.qualification)}`);
  if (filters.subject) clauses.push(`subject = ${bind.add(filters.subject)}`);
  if (filters.stage) clauses.push(`stage = ${bind.add(filters.stage)}`);
  if (filters.years.length) clauses.push(`year = ANY(${bind.add(filters.years)}::int[])`);
  if (filters.seasons.length) clauses.push(`season_code = ANY(${bind.add(filters.seasons)}::text[])`);
  if (filters.components.length) clauses.push(`component = ANY(${bind.add(filters.components)}::text[])`);
  if (filters.variants.length) clauses.push(`variant = ANY(${bind.add(filters.variants)}::text[])`);
  if (filters.difficulties.length) clauses.push(`difficulty = ANY(${bind.add(filters.difficulties)}::text[])`);
  if (filters.ids.length) clauses.push(`id = ANY(${bind.add(filters.ids)}::text[])`);
  if (filters.search) {
    // ILIKE keeps the case-insensitive matching SQLite's LIKE gave for free.
    const needle = bind.add(`%${filters.search}%`);
    clauses.push(`(label ILIKE ${needle} OR syllabus_code ILIKE ${needle} OR subject ILIKE ${needle})`);
  }

  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

/** Whitelisted, never interpolated from user input. */
function orderBy(sort: string) {
  if (sort === "year-asc") return "year ASC, season_code ASC, subject ASC, paper_unit_code ASC";
  if (sort === "subject") return "subject ASC, year DESC, paper_unit_code ASC";
  if (sort === "difficulty") {
    return "CASE difficulty WHEN 'Easy' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Hard' THEN 3 ELSE 4 END, year DESC";
  }
  return "year DESC, season_code DESC, subject ASC, paper_unit_code ASC";
}

export async function queryCatalogue(filters: CatalogueFilters) {
  const sql = getSql();

  const countBind = binder();
  const countWhere = buildWhere(filters, countBind);
  const countRows = await sql.unsafe<{ total: number }[]>(
    `SELECT COUNT(*)::int AS total FROM catalogue_papers ${countWhere}`,
    countBind.params as never[],
  );
  const total = Number(countRows[0]?.total ?? 0);

  const bind = binder();
  const where = buildWhere(filters, bind);
  const limit = bind.add(filters.pageSize);
  const offset = bind.add(Math.max(0, (filters.page - 1) * filters.pageSize));

  const rows = await sql.unsafe<Record<string, unknown>[]>(
    `SELECT * FROM catalogue_papers ${where}
     ORDER BY ${orderBy(filters.sort)}
     LIMIT ${limit} OFFSET ${offset}`,
    bind.params as never[],
  );

  return { total, rows: rows.map(mapRow) };
}

export type CatalogueSubject = {
  qualification: string;
  board: string;
  subject: string;
  code: string;
  papers: number;
  /** True where the catalogue distinguishes AS from A2 for this subject. */
  hasStages: boolean;
};

/**
 * One row per subject a learner can pick, with its syllabus code.
 * Feeds the "pick a subject by its exam-board code" flow so a new subject can
 * be created without retyping its identity.
 *
 * The past-paper catalogue is one source and the syllabus directory is the
 * other, because a subject can be in either without being in both. Every
 * English board is in the second only — there are no AQA, OCR or Edexcel UK
 * past papers in the catalogue — and so are the International GCSEs. Listing
 * the papers alone is what left those subjects unreachable outside onboarding,
 * which had its own union of the two.
 */
export async function catalogueSubjectDirectory(): Promise<CatalogueSubject[]> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    WITH with_papers AS (
      SELECT
        c1.qualification AS qualification,
        MIN(c1.board) AS board,
        c1.subject AS subject,
        (
          SELECT c2.syllabus_code FROM catalogue_papers c2
          WHERE c2.qualification = c1.qualification AND c2.subject = c1.subject
          GROUP BY c2.syllabus_code
          -- Edexcel subjects spread evenly across their unit codes, so ties are the
          -- rule rather than the exception; without the final sort the subject's code
          -- varies between queries and stops matching its syllabus.
          ORDER BY COUNT(*) DESC, LENGTH(c2.syllabus_code), c2.syllabus_code
          LIMIT 1
        ) AS code,
        COUNT(*)::int AS papers,
        SUM(CASE WHEN c1.stage IS NOT NULL THEN 1 ELSE 0 END)::int AS staged
      FROM catalogue_papers c1
      GROUP BY c1.qualification, c1.subject
    ),
    syllabus_only AS (
      -- A syllabus code, not a subject name, decides whether the catalogue
      -- already covers this one: two boards can name a subject the same way.
      SELECT
        v.qualification AS qualification,
        MIN(v.board) AS board,
        v.subject AS subject,
        v.syllabus_code AS code,
        0 AS papers,
        0 AS staged
      FROM syllabus_versions v
      WHERE NOT EXISTS (
        SELECT 1 FROM catalogue_papers c WHERE c.syllabus_code = v.syllabus_code
      )
      GROUP BY v.qualification, v.subject, v.syllabus_code
    )
    SELECT * FROM with_papers
    UNION ALL
    SELECT * FROM syllabus_only
    ORDER BY qualification, subject, code
  `;

  return rows.map((row) => ({
    qualification: String(row.qualification),
    board: String(row.board ?? ""),
    subject: String(row.subject),
    code: String(row.code ?? ""),
    papers: Number(row.papers ?? 0),
    hasStages: Number(row.staged ?? 0) > 0,
  }));
}

export async function catalogueFacets(qualification?: string, subject?: string) {
  const sql = getSql();

  const scope: string[] = [];
  const params: unknown[] = [];
  if (qualification) {
    params.push(qualification);
    scope.push(`qualification = $${params.length}`);
  }
  if (subject) {
    params.push(subject);
    scope.push(`subject = $${params.length}`);
  }
  const where = scope.length ? `WHERE ${scope.join(" AND ")}` : "";
  const and = scope.length ? "AND" : "WHERE";

  const distinct = (column: string, extra = "") =>
    sql.unsafe<{ value: unknown }[]>(
      `SELECT DISTINCT ${column} AS value FROM catalogue_papers ${where} ${extra} ORDER BY value`,
      params as never[],
    );

  const [qualifications, subjects, years, seasons, components, variants, difficulties, totals] = await series([
    () => sql<{ value: string; count: number }[]>`
      SELECT qualification AS value, COUNT(*)::int AS count
      FROM catalogue_papers GROUP BY qualification ORDER BY qualification
    `,
    () => sql.unsafe<{ value: string; code: string; count: number }[]>(
      `SELECT subject AS value, syllabus_code AS code, COUNT(*)::int AS count
       FROM catalogue_papers ${qualification ? "WHERE qualification = $1" : ""}
       GROUP BY subject, syllabus_code ORDER BY subject`,
      (qualification ? [qualification] : []) as never[],
    ),
    () => sql.unsafe<{ value: number }[]>(
      `SELECT DISTINCT year AS value FROM catalogue_papers ${where} ORDER BY value DESC`,
      params as never[],
    ),
    () => distinct("season_code"),
    () => distinct("component", `${and} component IS NOT NULL`),
    () => distinct("variant", `${and} variant IS NOT NULL AND variant <> ''`),
    () => distinct("difficulty", `${and} difficulty IS NOT NULL`),
    () => sql<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM catalogue_papers`,
  ]);

  const values = (rows: { value: unknown }[]) => rows.map((row) => String(row.value));

  return {
    qualifications: qualifications.map((row) => ({ value: String(row.value), count: Number(row.count) })),
    subjects: subjects.map((row) => ({ value: String(row.value), code: String(row.code ?? ""), count: Number(row.count) })),
    years: years.map((row) => Number(row.value)),
    seasons: values(seasons),
    components: values(components),
    variants: values(variants),
    difficulties: values(difficulties),
    catalogueTotal: Number(totals[0]?.total ?? 0),
  };
}

export async function catalogueRowsByIds(ids: string[]) {
  if (!ids.length) return [];
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM catalogue_papers WHERE id = ANY(${ids}::text[])
  `;
  return rows.map(mapRow);
}
