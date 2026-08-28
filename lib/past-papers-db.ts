import { getSql, nowIso } from "./db";

export const PAPER_SESSIONS = ["Feb/March", "May/June", "Oct/Nov", "Specimen", "Other"] as const;
export type PaperSession = (typeof PAPER_SESSIONS)[number];

export const PAPER_CONDITIONS = ["Timed", "Untimed", "Open book"] as const;
export type PaperConditions = (typeof PAPER_CONDITIONS)[number];

export const PAPER_STATUSES = ["planned", "done"] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

export const PAPER_GRADES = ["A*", "A", "B", "C", "D", "E", "U"] as const;
export type PaperGrade = (typeof PAPER_GRADES)[number];

export const PAPER_DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type PaperDifficulty = (typeof PAPER_DIFFICULTIES)[number];

/** Per-catalogue-paper notes the student sets themselves. */
export type PaperMeta = {
  paperId: string;
  difficulty: PaperDifficulty | null;
  resourceUrl: string | null;
  updatedAt: string;
};

export type PastPaper = {
  id: number;
  paperId: string | null;
  subjectId: string;
  stage: "AS" | "A2";
  board: string | null;
  paper: string;
  variant: string | null;
  session: PaperSession;
  year: number;
  attemptDate: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  grade: PaperGrade | null;
  durationMinutes: number | null;
  conditions: PaperConditions;
  status: PaperStatus;
  weakTopics: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PastPaperInput = {
  paperId: string | null;
  subjectId: string;
  stage: "AS" | "A2";
  board: string | null;
  paper: string;
  variant: string | null;
  session: PaperSession;
  year: number;
  attemptDate: string;
  score: number | null;
  maxScore: number | null;
  grade: PaperGrade | null;
  durationMinutes: number | null;
  conditions: PaperConditions;
  status: PaperStatus;
  weakTopics: string[];
  notes: string | null;
};

function mapMeta(row: Record<string, unknown>): PaperMeta {
  return {
    paperId: String(row.paper_id),
    difficulty: row.difficulty ? (row.difficulty as PaperDifficulty) : null,
    resourceUrl: row.resource_url ? String(row.resource_url) : null,
    updatedAt: String(row.updated_at),
  };
}

export async function getPaperMeta(workspaceId: string) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM paper_meta WHERE workspace_id = ${workspaceId}
  `;
  return rows.map(mapMeta);
}

export async function savePaperMeta(workspaceId: string, input: {
  paperId: string;
  difficulty: PaperDifficulty | null;
  resourceUrl: string | null;
}) {
  const sql = getSql();
  const now = nowIso();

  // Clearing both fields removes the annotation rather than storing an empty row.
  if (!input.difficulty && !input.resourceUrl) {
    await sql`
      DELETE FROM paper_meta WHERE workspace_id = ${workspaceId} AND paper_id = ${input.paperId}
    `;
    return { paperId: input.paperId, difficulty: null, resourceUrl: null, updatedAt: now } satisfies PaperMeta;
  }

  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO paper_meta (workspace_id, paper_id, difficulty, resource_url, updated_at)
    VALUES (${workspaceId}, ${input.paperId}, ${input.difficulty}, ${input.resourceUrl}, ${now})
    ON CONFLICT (workspace_id, paper_id) DO UPDATE SET
      difficulty = excluded.difficulty,
      resource_url = excluded.resource_url,
      updated_at = excluded.updated_at
    RETURNING *
  `;
  if (!rows.length) throw new Error("Paper details were not saved.");
  return mapMeta(rows[0]);
}

export function paperPercentage(score: number | null, maxScore: number | null) {
  if (score == null || !maxScore) return null;
  return Math.round((score / maxScore) * 1000) / 10;
}

function mapPaper(row: Record<string, unknown>): PastPaper {
  let weakTopics: string[] = [];
  try {
    const parsed = JSON.parse(String(row.weak_topics_json ?? "[]"));
    if (Array.isArray(parsed)) weakTopics = parsed.filter((topic): topic is string => typeof topic === "string");
  } catch {
    weakTopics = [];
  }
  return {
    id: Number(row.id),
    paperId: row.paper_id ? String(row.paper_id) : null,
    subjectId: String(row.subject_id),
    stage: row.stage === "AS" ? "AS" : "A2",
    board: row.board ? String(row.board) : null,
    paper: String(row.paper),
    variant: row.variant ? String(row.variant) : null,
    session: row.session as PaperSession,
    year: Number(row.year),
    attemptDate: String(row.attempt_date),
    score: row.score == null ? null : Number(row.score),
    maxScore: row.max_score == null ? null : Number(row.max_score),
    percentage: row.percentage == null ? null : Number(row.percentage),
    grade: row.grade ? (row.grade as PaperGrade) : null,
    durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    conditions: row.conditions as PaperConditions,
    status: row.status === "planned" ? "planned" : "done",
    weakTopics,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getPastPapers(workspaceId: string) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM past_papers
    WHERE workspace_id = ${workspaceId}
    ORDER BY attempt_date DESC, id DESC
  `;
  return rows.map(mapPaper);
}

export async function addPastPaper(workspaceId: string, input: PastPaperInput) {
  const sql = getSql();
  const now = nowIso();
  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO past_papers (
      workspace_id, paper_id, subject_id, stage, board, paper, variant, session, year,
      attempt_date, score, max_score, percentage, grade, duration_minutes, conditions,
      status, weak_topics_json, notes, created_at, updated_at
    ) VALUES (
      ${workspaceId}, ${input.paperId}, ${input.subjectId}, ${input.stage}, ${input.board},
      ${input.paper}, ${input.variant}, ${input.session}, ${input.year}, ${input.attemptDate},
      ${input.score}, ${input.maxScore}, ${paperPercentage(input.score, input.maxScore)},
      ${input.grade}, ${input.durationMinutes}, ${input.conditions}, ${input.status},
      ${JSON.stringify(input.weakTopics)}, ${input.notes}, ${now}, ${now}
    )
    RETURNING *
  `;
  if (!rows.length) throw new Error("Past paper was not created.");
  return mapPaper(rows[0]);
}

export async function updatePastPaper(workspaceId: string, id: number, input: Partial<PastPaperInput>) {
  const sql = getSql();
  const currentRows = await sql<Record<string, unknown>[]>`
    SELECT * FROM past_papers WHERE workspace_id = ${workspaceId} AND id = ${id}
  `;
  if (!currentRows.length) throw new Error("Past paper not found.");
  const existing = mapPaper(currentRows[0]);

  const score = input.score === undefined ? existing.score : input.score;
  const maxScore = input.maxScore === undefined ? existing.maxScore : input.maxScore;
  const now = nowIso();

  const rows = await sql<Record<string, unknown>[]>`
    UPDATE past_papers SET
      paper_id = ${input.paperId === undefined ? existing.paperId : input.paperId},
      subject_id = ${input.subjectId ?? existing.subjectId},
      stage = ${input.stage ?? existing.stage},
      board = ${input.board === undefined ? existing.board : input.board},
      paper = ${input.paper ?? existing.paper},
      variant = ${input.variant === undefined ? existing.variant : input.variant},
      session = ${input.session ?? existing.session},
      year = ${input.year ?? existing.year},
      attempt_date = ${input.attemptDate ?? existing.attemptDate},
      score = ${score},
      max_score = ${maxScore},
      percentage = ${paperPercentage(score, maxScore)},
      grade = ${input.grade === undefined ? existing.grade : input.grade},
      duration_minutes = ${input.durationMinutes === undefined ? existing.durationMinutes : input.durationMinutes},
      conditions = ${input.conditions ?? existing.conditions},
      status = ${input.status ?? existing.status},
      weak_topics_json = ${JSON.stringify(input.weakTopics ?? existing.weakTopics)},
      notes = ${input.notes === undefined ? existing.notes : input.notes},
      updated_at = ${now}
    WHERE workspace_id = ${workspaceId} AND id = ${id}
    RETURNING *
  `;
  if (!rows.length) throw new Error("Past paper was not updated.");
  return mapPaper(rows[0]);
}

export async function deletePastPaper(workspaceId: string, id: number) {
  const sql = getSql();
  await sql`DELETE FROM past_papers WHERE workspace_id = ${workspaceId} AND id = ${id}`;
}
