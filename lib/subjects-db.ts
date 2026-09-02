import { getSql, nowIso, type SqlClient } from "./db";

/**
 * Subjects are the tenant-configurable spine of the tracker. Every other table
 * references a subject by its stable `id`, never by the display name, so a
 * rename is a one-row update rather than a data migration.
 *
 * `id` is unique per workspace, not globally: two accounts can both own a
 * subject called `mathematics`. That is why the primary key, and every foreign
 * key pointing here, is the pair (workspace_id, id).
 */

export const SUBJECT_TONES = ["blue", "violet", "coral", "teal", "amber", "rose", "lime", "slate"] as const;
export type SubjectTone = (typeof SUBJECT_TONES)[number];

export type Subject = {
  id: string;
  workspaceId: string;
  name: string;
  shortName: string | null;
  tone: SubjectTone;
  board: string | null;
  qualification: string | null;
  syllabusCode: string | null;
  /** Empty means the subject has no stage split (IGCSE and similar). */
  stages: string[];
  /** Maps a paper label to a stage, e.g. { "P1": "AS", "P5": "AS" }. */
  paperStages: Record<string, string>;
  position: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SubjectInput = {
  name: string;
  shortName: string | null;
  tone: SubjectTone;
  board: string | null;
  qualification: string | null;
  syllabusCode: string | null;
  stages: string[];
  paperStages: Record<string, string>;
};

/**
 * The subjects onboarding offers as a starting point, with the paper/stage
 * rules that used to live as if-statements in syllabus-stage.ts. Nothing is
 * created automatically: a new account picks from this list, or builds its own.
 */
export const STARTER_SUBJECTS: Array<Omit<Subject, "createdAt" | "updatedAt" | "workspaceId">> = [
  {
    id: "mathematics", name: "Mathematics", shortName: "Math", tone: "blue",
    board: "CAIE", qualification: "Cambridge International AS & A Level", syllabusCode: "9709",
    stages: ["AS", "A2"], paperStages: { P1: "AS", P5: "AS" }, position: 0, archived: false,
  },
  {
    id: "further-math", name: "Further Math", shortName: "FMath", tone: "violet",
    board: "CAIE", qualification: "Cambridge International AS & A Level", syllabusCode: "9231",
    stages: ["AS", "A2"], paperStages: { P1: "AS", P3: "AS" }, position: 1, archived: false,
  },
  {
    id: "physics", name: "Physics", shortName: "Phy", tone: "coral",
    board: "CAIE", qualification: "Cambridge International AS & A Level", syllabusCode: "9702",
    stages: ["AS", "A2"], paperStages: { "P1/P2": "AS", P3: "AS" }, position: 2, archived: false,
  },
  {
    id: "computer-science", name: "Computer Science", shortName: "CS", tone: "teal",
    board: "CAIE", qualification: "Cambridge International AS & A Level", syllabusCode: "9618",
    stages: ["AS", "A2"], paperStages: { P1: "AS", P2: "AS" }, position: 3, archived: false,
  },
  {
    id: "general", name: "General", shortName: null, tone: "slate",
    board: null, qualification: null, syllabusCode: null,
    stages: [], paperStages: {}, position: 4, archived: false,
  },
];

/** Tables that carry a subject reference, used for the delete-impact preview. */
const SUBJECT_TABLES = [
  "topics",
  "study_sessions",
  "study_tasks",
  "study_goals",
  "flashcard_decks",
  "past_papers",
  "note_files",
] as const;

export function subjectSlug(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || `subject-${Date.now().toString(36)}`;
}

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return parsed == null ? fallback : parsed as T;
  } catch {
    return fallback;
  }
}

function mapSubject(row: Record<string, unknown>): Subject {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    shortName: row.short_name ? String(row.short_name) : null,
    tone: (SUBJECT_TONES as readonly string[]).includes(String(row.tone)) ? String(row.tone) as SubjectTone : "blue",
    board: row.board ? String(row.board) : null,
    qualification: row.qualification ? String(row.qualification) : null,
    syllabusCode: row.syllabus_code ? String(row.syllabus_code) : null,
    stages: parseJson<string[]>(row.stages_json, []),
    paperStages: parseJson<Record<string, string>>(row.paper_stages_json, {}),
    position: Number(row.position ?? 0),
    archived: Boolean(row.archived),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getSubjects(workspaceId: string, executor: SqlClient = getSql()) {
  const rows = await executor<Record<string, unknown>[]>`
    SELECT * FROM subjects
    WHERE workspace_id = ${workspaceId}
    ORDER BY position, name
  `;
  return rows.map(mapSubject);
}

/**
 * `executor` defaults to the pool, but a caller already inside `sql.begin()`
 * must pass its transaction handle. Reaching for the pool from within a
 * transaction deadlocks on Vercel, where the pool is one connection wide: the
 * transaction holds it, the second query queues behind the transaction that is
 * waiting on it, and the request never returns.
 */
export async function getSubject(workspaceId: string, id: string, executor: SqlClient = getSql()) {
  const rows = await executor<Record<string, unknown>[]>`
    SELECT * FROM subjects WHERE workspace_id = ${workspaceId} AND id = ${id}
  `;
  return rows.length ? mapSubject(rows[0]) : null;
}

export async function isKnownSubject(workspaceId: string, id: string | null | undefined) {
  if (!id) return false;
  return Boolean(await getSubject(workspaceId, id));
}

/**
 * The stages a subject splits into, or null when it is not one of this
 * workspace's. Anything that files a goal, exam, deck or note under a stage
 * validates against this rather than a fixed pair, because the stage names are
 * the subject's own: AS and A2 for an A Level, SL and HL for an IB course.
 */
export async function subjectStages(workspaceId: string, id: string | null | undefined) {
  if (!id) return null;
  return (await getSubject(workspaceId, id))?.stages ?? null;
}

export async function addSubject(workspaceId: string, input: SubjectInput) {
  const sql = getSql();
  const base = subjectSlug(input.name);
  let id = base;
  let suffix = 2;
  while (await getSubject(workspaceId, id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  const now = nowIso();
  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO subjects (
      workspace_id, id, name, short_name, tone, board, qualification, syllabus_code,
      stages_json, paper_stages_json, position, archived, created_at, updated_at
    )
    SELECT
      ${workspaceId}, ${id}, ${input.name}, ${input.shortName}, ${input.tone},
      ${input.board}, ${input.qualification}, ${input.syllabusCode},
      ${JSON.stringify(input.stages)}, ${JSON.stringify(input.paperStages)},
      COALESCE(MAX(position), -1) + 1, false, ${now}, ${now}
    FROM subjects WHERE workspace_id = ${workspaceId}
    RETURNING *
  `;
  if (!rows.length) throw new Error("Subject was not created.");
  return mapSubject(rows[0]);
}

export type SubjectSpec = SubjectInput & { id: string };

/**
 * Creates subjects with ids chosen by the caller, used by onboarding. Unlike
 * `addSubject` the id is not derived from the name: a bundled subject has to
 * keep its canonical id so the seeded topic ids line up with it.
 *
 * Duplicates are ignored, so re-running onboarding is harmless.
 */
export async function createSubjects(workspaceId: string, specs: SubjectSpec[]) {
  const sql = getSql();
  if (!specs.length) return [];
  const now = nowIso();

  await sql.begin(async (tx) => {
    for (const [index, subject] of specs.entries()) {
      await tx`
        INSERT INTO subjects (
          workspace_id, id, name, short_name, tone, board, qualification, syllabus_code,
          stages_json, paper_stages_json, position, archived, created_at, updated_at
        ) VALUES (
          ${workspaceId}, ${subject.id}, ${subject.name}, ${subject.shortName}, ${subject.tone},
          ${subject.board}, ${subject.qualification}, ${subject.syllabusCode},
          ${JSON.stringify(subject.stages)}, ${JSON.stringify(subject.paperStages)},
          ${index}, false, ${now}, ${now}
        )
        ON CONFLICT (workspace_id, id) DO NOTHING
      `;
    }
  });

  return getSubjects(workspaceId);
}

export async function updateSubject(
  workspaceId: string,
  id: string,
  input: Partial<SubjectInput> & { archived?: boolean; position?: number },
) {
  const sql = getSql();
  const current = await getSubject(workspaceId, id);
  if (!current) throw new Error("Subject not found.");
  const now = nowIso();
  const rows = await sql<Record<string, unknown>[]>`
    UPDATE subjects SET
      name = ${input.name ?? current.name},
      short_name = ${input.shortName === undefined ? current.shortName : input.shortName},
      tone = ${input.tone ?? current.tone},
      board = ${input.board === undefined ? current.board : input.board},
      qualification = ${input.qualification === undefined ? current.qualification : input.qualification},
      syllabus_code = ${input.syllabusCode === undefined ? current.syllabusCode : input.syllabusCode},
      stages_json = ${JSON.stringify(input.stages ?? current.stages)},
      paper_stages_json = ${JSON.stringify(input.paperStages ?? current.paperStages)},
      position = ${input.position ?? current.position},
      archived = ${input.archived ?? current.archived},
      updated_at = ${now}
    WHERE workspace_id = ${workspaceId} AND id = ${id}
    RETURNING *
  `;
  if (!rows.length) throw new Error("Subject was not updated.");
  return mapSubject(rows[0]);
}

export async function reorderSubjects(workspaceId: string, ids: string[]) {
  const sql = getSql();
  const now = nowIso();
  await sql.begin(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx`
        UPDATE subjects SET position = ${index}, updated_at = ${now}
        WHERE workspace_id = ${workspaceId} AND id = ${id}
      `;
    }
  });
  return getSubjects(workspaceId);
}

/** How much data a subject owns, so deleting it can be an informed choice. */
export async function subjectUsage(workspaceId: string, id: string) {
  const sql = getSql();
  const counts: Record<string, number> = {};
  for (const table of SUBJECT_TABLES) {
    const rows = await sql<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM ${sql(table)}
      WHERE workspace_id = ${workspaceId} AND subject_id = ${id}
    `;
    counts[table] = Number(rows[0]?.total ?? 0);
  }
  return counts;
}

/**
 * Deleting a subject takes its topics, sessions, tasks, goals, decks, papers
 * and notes with it. The cascade is declared on the foreign keys, so this is a
 * single statement rather than a fan-out of deletes.
 */
export async function deleteSubject(workspaceId: string, id: string) {
  const sql = getSql();
  await sql`DELETE FROM subjects WHERE workspace_id = ${workspaceId} AND id = ${id}`;
}
