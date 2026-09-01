import { getSql, nowIso, type SqlClient } from "./db";
import { REVIEW_INTERVALS } from "../app/topics";
import { seedTopics } from "./seed-data";
import { recordTopicActivities } from "./topic-activity-db";
import { subjectSlug } from "./subjects-db";

export const STATUSES = [
  "Not Started",
  "Learning",
  "Practising",
  "Covered",
  "Exam Ready",
] as const;

export type StudyStatus = (typeof STATUSES)[number];

/** Statuses the column actually stores; "Covered" is `covered = true`. */
type StoredStatus = Exclude<StudyStatus, "Covered">;

export type TopicRecord = {
  id: string;
  subjectId: string;
  sourceRow: number;
  paper: string | null;
  academicLevel: string | null;
  retake: boolean;
  section: string | null;
  code: string;
  title: string;
  kind: "chapter" | "point";
  parentId: string | null;
  inScope: boolean;
  status: StudyStatus;
  confidence: number | null;
  reviewedOn: string | null;
  reviewedAt: string | null;
  reviewDue: string | null;
  goalDue: string | null;
  examQuestions: number;
  lastTestPct: number | null;
  priority: string | null;
  notes: string | null;
  updatedAt: string;
};

/**
 * Review scheduling works in the learner's local calendar day, not UTC — a
 * 23:00 review should not be dated tomorrow. Callers may override the zone;
 * the default matches the single-user build this SaaS grew out of.
 */
export const DEFAULT_TIME_ZONE = "Asia/Singapore";

function localDate(timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function intervalFor(status: StudyStatus) {
  return REVIEW_INTERVALS[status];
}

function storedFor(status: StudyStatus): StoredStatus {
  return status === "Covered" ? "Practising" : status;
}

function displayStatus(stored: StoredStatus, covered: boolean): StudyStatus {
  return covered && stored !== "Exam Ready" ? "Covered" : stored;
}

function mapTopic(row: Record<string, unknown>): TopicRecord {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    sourceRow: Number(row.source_row),
    paper: row.paper ? String(row.paper) : null,
    academicLevel: row.academic_level ? String(row.academic_level) : null,
    retake: Boolean(row.retake),
    section: row.section ? String(row.section) : null,
    code: String(row.code),
    title: String(row.title),
    kind: row.kind as "chapter" | "point",
    parentId: row.parent_id ? String(row.parent_id) : null,
    inScope: Boolean(row.in_scope),
    status: displayStatus(row.status as StoredStatus, Boolean(row.covered)),
    confidence: row.confidence == null ? null : Number(row.confidence),
    reviewedOn: row.reviewed_on ? String(row.reviewed_on) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewDue: row.review_due ? String(row.review_due) : null,
    goalDue: row.goal_due ? String(row.goal_due) : null,
    examQuestions: Number(row.exam_questions ?? 0),
    lastTestPct: row.last_test_pct == null ? null : Number(row.last_test_pct),
    priority: row.priority ? String(row.priority) : null,
    notes: row.notes ? String(row.notes) : null,
    updatedAt: String(row.updated_at),
  };
}

/** Topics in subject order, then syllabus order. */
export async function getTopics(workspaceId: string) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT topics.* FROM topics
    LEFT JOIN subjects
      ON subjects.workspace_id = topics.workspace_id
     AND subjects.id = topics.subject_id
    WHERE topics.workspace_id = ${workspaceId}
    ORDER BY COALESCE(subjects.position, 999), topics.source_row
  `;
  return rows.map(mapTopic);
}

export type ImportTopicRow = {
  code: string;
  title: string;
  kind: "chapter" | "point";
  /** Chapter code this point belongs under; ignored for chapters. */
  parentCode: string | null;
  paper: string | null;
  section: string | null;
  academicLevel: string | null;
};

type TopicInsert = {
  workspace_id: string;
  id: string;
  subject_id: string;
  source_row: number;
  paper: string | null;
  academic_level: string | null;
  retake: boolean;
  section: string | null;
  code: string;
  title: string;
  kind: "chapter" | "point";
  parent_id: string | null;
  in_scope: boolean;
  status: StoredStatus;
  covered: boolean;
  exam_questions: number;
  priority: string | null;
  updated_at: string;
};

const TOPIC_INSERT_COLUMNS = [
  "workspace_id",
  "id",
  "subject_id",
  "source_row",
  "paper",
  "academic_level",
  "retake",
  "section",
  "code",
  "title",
  "kind",
  "parent_id",
  "in_scope",
  "status",
  "covered",
  "exam_questions",
  "priority",
  "updated_at",
] as const;

/**
 * Chapters must land before points: parent_id is a self-referencing foreign key
 * checked per statement, so a point whose chapter is not in yet would fail.
 */
async function insertTopics(executor: SqlClient, rows: TopicInsert[]) {
  const chapters = rows.filter((row) => row.kind === "chapter");
  const points = rows.filter((row) => row.kind === "point");
  for (const group of [chapters, points]) {
    // ~65k bind parameters per statement is the wire-protocol ceiling; 500 rows
    // across 18 columns stays comfortably inside it.
    for (let start = 0; start < group.length; start += 500) {
      const chunk = group.slice(start, start + 500);
      if (!chunk.length) continue;
      await executor`
        INSERT INTO topics ${executor(chunk, ...TOPIC_INSERT_COLUMNS)}
        ON CONFLICT (workspace_id, id) DO NOTHING
      `;
    }
  }
}

/**
 * Replaces a subject's whole syllabus with an imported tree. Chapters carry
 * their points via matching parent codes. Existing progress for the subject is
 * discarded, so this is an explicit "load this syllabus" action, not a merge.
 */
export async function importSubjectTopics(workspaceId: string, subjectId: string, rows: ImportTopicRow[]) {
  const sql = getSql();
  const now = nowIso();

  const chapters = rows.filter((row) => row.kind === "chapter");
  const points = rows.filter((row) => row.kind === "point");
  const chapterIdByCode = new Map<string, string>();

  const inserts: TopicInsert[] = [];
  let sourceRow = 0;

  const base = (row: ImportTopicRow, id: string, parentId: string | null): TopicInsert => ({
    workspace_id: workspaceId,
    id,
    subject_id: subjectId,
    source_row: sourceRow,
    paper: row.paper,
    academic_level: row.academicLevel,
    retake: false,
    section: row.section,
    code: row.code,
    title: row.title,
    kind: row.kind,
    parent_id: parentId,
    in_scope: false,
    status: "Not Started",
    covered: false,
    exam_questions: 0,
    priority: null,
    updated_at: now,
  });

  for (const chapter of chapters) {
    sourceRow += 1;
    const id = `${subjectId}-${sourceRow}`;
    chapterIdByCode.set(chapter.code, id);
    inserts.push(base(chapter, id, null));
  }
  for (const point of points) {
    sourceRow += 1;
    const id = `${subjectId}-${sourceRow}`;
    inserts.push(base(point, id, point.parentCode ? chapterIdByCode.get(point.parentCode) ?? null : null));
  }

  await sql.begin(async (tx) => {
    await tx`DELETE FROM topics WHERE workspace_id = ${workspaceId} AND subject_id = ${subjectId}`;
    await insertTopics(tx, inserts);
  });

  return { chapters: chapters.length, points: points.length };
}

/**
 * Loads the bundled CAIE syllabus tree for a starter subject, with all progress
 * cleared. This is what makes a fresh account useful on day one: onboarding
 * picks subjects, and each one arrives with its full chapter/point structure.
 */
export async function seedSubjectTopicsFromTemplate(workspaceId: string, subjectId: string) {
  const sql = getSql();
  const now = nowIso();

  const template = seedTopics.filter((topic) => subjectSlug(topic.subject) === subjectId);
  if (!template.length) return { chapters: 0, points: 0 };

  const inserts: TopicInsert[] = template.map((topic) => ({
    workspace_id: workspaceId,
    id: topic.id,
    subject_id: subjectId,
    source_row: topic.sourceRow,
    paper: topic.paper,
    academic_level: topic.academicLevel,
    retake: topic.retake,
    section: topic.section,
    code: topic.code,
    title: topic.title,
    kind: topic.kind,
    parent_id: topic.parentId,
    // The template ships syllabus structure only. Progress starts empty.
    in_scope: false,
    status: "Not Started",
    covered: false,
    exam_questions: 0,
    priority: null,
    updated_at: now,
  }));

  await sql.begin(async (tx) => {
    await tx`DELETE FROM topics WHERE workspace_id = ${workspaceId} AND subject_id = ${subjectId}`;
    await insertTopics(tx, inserts);
  });

  return {
    chapters: inserts.filter((row) => row.kind === "chapter").length,
    points: inserts.filter((row) => row.kind === "point").length,
  };
}

export async function updateStudyTracking(workspaceId: string, input: {
  id: string;
  status?: StudyStatus;
  reviewedNow?: boolean;
  wholeChapter?: boolean;
  timeZone?: string;
}) {
  const sql = getSql();

  return sql.begin(async (tx) => {
    const currentRows = await tx<{ status: StoredStatus; covered: boolean; kind: "chapter" | "point" }[]>`
      SELECT status, covered, kind FROM topics
      WHERE workspace_id = ${workspaceId} AND id = ${input.id}
    `;
    if (!currentRows.length) throw new Error("Topic not found.");
    const current = currentRows[0];

    const currentStatus = displayStatus(current.status, current.covered);
    const status = input.status ?? (currentStatus === "Not Started" ? "Learning" : currentStatus);
    if (!STATUSES.includes(status)) throw new Error("Invalid study status.");

    const spreadToChapter = Boolean(input.wholeChapter) && current.kind === "chapter";
    const today = localDate(input.timeZone);
    const now = nowIso();
    const reviewedOn = status === "Not Started" ? null : today;
    const reviewedAt = status === "Not Started" ? null : now;
    const reviewDue = status === "Not Started" ? null : addDays(today, intervalFor(status));

    const previous = spreadToChapter
      ? await tx<{ id: string; status: StoredStatus; covered: boolean }[]>`
          SELECT id, status, covered FROM topics
          WHERE workspace_id = ${workspaceId} AND (id = ${input.id} OR parent_id = ${input.id})
        `
      : await tx<{ id: string; status: StoredStatus; covered: boolean }[]>`
          SELECT id, status, covered FROM topics
          WHERE workspace_id = ${workspaceId} AND id = ${input.id}
        `;

    // Clearing the goal date marks a scheduled point as handled; reverting to
    // "Not Started" leaves it on the plan.
    const keepGoalDue = status === "Not Started";

    if (spreadToChapter) {
      await tx`
        UPDATE topics SET
          status = ${storedFor(status)},
          covered = ${status === "Covered"},
          reviewed_on = ${reviewedOn},
          reviewed_at = ${reviewedAt},
          review_due = ${reviewDue},
          goal_due = CASE WHEN ${keepGoalDue} THEN goal_due ELSE NULL END,
          in_scope = true,
          updated_at = ${now}
        WHERE workspace_id = ${workspaceId} AND (id = ${input.id} OR parent_id = ${input.id})
      `;
    } else {
      await tx`
        UPDATE topics SET
          status = ${storedFor(status)},
          covered = ${status === "Covered"},
          reviewed_on = ${reviewedOn},
          reviewed_at = ${reviewedAt},
          review_due = ${reviewDue},
          goal_due = CASE WHEN ${keepGoalDue} THEN goal_due ELSE NULL END,
          in_scope = true,
          updated_at = ${now}
        WHERE workspace_id = ${workspaceId} AND id = ${input.id}
      `;
    }

    await recordTopicActivities(
      workspaceId,
      previous.flatMap((topic) => {
        const fromStatus = displayStatus(topic.status, topic.covered);
        if (!input.reviewedNow && fromStatus === status) return [];
        return [{
          topicId: topic.id,
          eventType: input.reviewedNow ? "review" as const : "status" as const,
          fromStatus,
          toStatus: status,
          occurredAt: now,
        }];
      }),
      tx,
    );

    const updated = spreadToChapter
      ? await tx<Record<string, unknown>[]>`
          SELECT * FROM topics
          WHERE workspace_id = ${workspaceId} AND (id = ${input.id} OR parent_id = ${input.id})
          ORDER BY source_row
        `
      : await tx<Record<string, unknown>[]>`
          SELECT * FROM topics
          WHERE workspace_id = ${workspaceId} AND id = ${input.id}
          ORDER BY source_row
        `;

    return updated.map(mapTopic);
  });
}

export async function updateSelectedStudyTracking(workspaceId: string, input: {
  ids: string[];
  status?: StudyStatus;
  reviewedNow?: boolean;
  timeZone?: string;
}) {
  const sql = getSql();
  const ids = [...new Set(input.ids)].slice(0, 200);
  if (!ids.length) return [];
  if (input.status && !STATUSES.includes(input.status)) throw new Error("Invalid study status.");

  return sql.begin(async (tx) => {
    const current = await tx<{ id: string; status: StoredStatus; covered: boolean }[]>`
      SELECT id, status, covered FROM topics
      WHERE workspace_id = ${workspaceId} AND kind = 'point' AND id = ANY(${ids}::text[])
    `;

    const today = localDate(input.timeZone);
    const now = nowIso();
    const activityEntries: Array<{
      topicId: string;
      eventType: "status" | "review";
      fromStatus: string;
      toStatus: string;
      occurredAt: string;
    }> = [];

    for (const topic of current) {
      const currentStatus = displayStatus(topic.status, topic.covered);
      const status = input.status ?? (currentStatus === "Not Started" ? "Learning" : currentStatus);
      const reviewedOn = status === "Not Started" ? null : today;
      const reviewedAt = status === "Not Started" ? null : now;
      const reviewDue = status === "Not Started" ? null : addDays(today, intervalFor(status));

      if (input.reviewedNow || currentStatus !== status) {
        activityEntries.push({
          topicId: topic.id,
          eventType: input.reviewedNow ? "review" : "status",
          fromStatus: currentStatus,
          toStatus: status,
          occurredAt: now,
        });
      }

      await tx`
        UPDATE topics SET
          status = ${storedFor(status)},
          covered = ${status === "Covered"},
          reviewed_on = ${reviewedOn},
          reviewed_at = ${reviewedAt},
          review_due = ${reviewDue},
          goal_due = CASE WHEN ${status === "Not Started"} THEN goal_due ELSE NULL END,
          in_scope = true,
          updated_at = ${now}
        WHERE workspace_id = ${workspaceId} AND id = ${topic.id} AND kind = 'point'
      `;
    }

    await recordTopicActivities(workspaceId, activityEntries, tx);

    const updated = await tx<Record<string, unknown>[]>`
      SELECT topics.* FROM topics
      LEFT JOIN subjects
        ON subjects.workspace_id = topics.workspace_id
       AND subjects.id = topics.subject_id
      WHERE topics.workspace_id = ${workspaceId}
        AND topics.kind = 'point'
        AND topics.id = ANY(${ids}::text[])
      ORDER BY COALESCE(subjects.position, 999), topics.source_row
    `;
    return updated.map(mapTopic);
  });
}

/**
 * Marks topics reviewed on a specific date, as logging a past study session
 * does. Selecting a chapter also reviews every point beneath it.
 */
export async function reviewStudyTopics(
  workspaceId: string,
  input: { ids: string[]; subjectId: string; reviewedOn: string; timeZone?: string },
  executor?: SqlClient,
) {
  const ids = [...new Set(input.ids)].slice(0, 200);
  if (!ids.length) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reviewedOn)) throw new Error("Invalid review date.");

  const run = async (tx: SqlClient) => {
    const selected = await tx<{ id: string; kind: "chapter" | "point" }[]>`
      SELECT id, kind FROM topics
      WHERE workspace_id = ${workspaceId} AND subject_id = ${input.subjectId} AND id = ANY(${ids}::text[])
    `;
    if (selected.length !== ids.length) throw new Error("A selected syllabus topic is invalid.");

    const reviewIds = new Set(selected.map((topic) => topic.id));
    const chapterIds = selected.filter((topic) => topic.kind === "chapter").map((topic) => topic.id);
    if (chapterIds.length) {
      const children = await tx<{ id: string }[]>`
        SELECT id FROM topics
        WHERE workspace_id = ${workspaceId}
          AND subject_id = ${input.subjectId}
          AND parent_id = ANY(${chapterIds}::text[])
      `;
      children.forEach((topic) => reviewIds.add(topic.id));
    }

    const reviewIdList = [...reviewIds];
    const current = await tx<{ id: string; status: StoredStatus; covered: boolean }[]>`
      SELECT id, status, covered FROM topics
      WHERE workspace_id = ${workspaceId} AND id = ANY(${reviewIdList}::text[])
    `;

    const now = nowIso();
    const occurredAt = input.reviewedOn === localDate(input.timeZone) ? now : `${input.reviewedOn}T12:00:00+08:00`;
    const activities: Array<{
      topicId: string;
      eventType: "review";
      fromStatus: string;
      toStatus: string;
      occurredAt: string;
    }> = [];

    for (const topic of current) {
      const currentStatus = displayStatus(topic.status, topic.covered);
      const status = currentStatus === "Not Started" ? "Learning" : currentStatus;
      activities.push({ topicId: topic.id, eventType: "review", fromStatus: currentStatus, toStatus: status, occurredAt });

      await tx`
        UPDATE topics SET
          status = ${storedFor(status)},
          covered = ${status === "Covered"},
          reviewed_on = ${input.reviewedOn},
          reviewed_at = ${occurredAt},
          review_due = ${addDays(input.reviewedOn, intervalFor(status))},
          goal_due = NULL,
          in_scope = true,
          updated_at = ${now}
        WHERE workspace_id = ${workspaceId} AND id = ${topic.id}
      `;
    }

    await recordTopicActivities(workspaceId, activities, tx);

    const updated = await tx<Record<string, unknown>[]>`
      SELECT topics.* FROM topics
      LEFT JOIN subjects
        ON subjects.workspace_id = topics.workspace_id
       AND subjects.id = topics.subject_id
      WHERE topics.workspace_id = ${workspaceId}
        AND topics.id = ANY(${reviewIdList}::text[])
      ORDER BY COALESCE(subjects.position, 999), topics.source_row
    `;
    return updated.map(mapTopic);
  };

  // Reused inside addStudySession's transaction so the session and the reviews
  // it triggers commit together.
  return executor ? run(executor) : getSql().begin(run);
}

/** How many syllabus rows the bundled template holds for a starter subject. */
export function templateTopicCount(subjectId: string) {
  return seedTopics.reduce(
    (total, topic) => (subjectSlug(topic.subject) === subjectId ? total + 1 : total),
    0,
  );
}

/**
 * Marks every point under the named chapters as `Learning`, and returns how many
 * chapters were found.
 *
 * Onboarding calls this with what a learner said they are already working on.
 * It is the same move the review board makes when a chapter is set from its own
 * header — status, review date and activity all cascade to the points beneath —
 * so a learner arriving in the app finds the state they would have made by hand,
 * and a review date that brings them back in three days.
 *
 * Chapters are named by code because the picking happened before the import,
 * when no topic had an id yet.
 */
export async function startChapters(
  workspaceId: string,
  subjectId: string,
  chapterCodes: string[],
  timeZone?: string,
) {
  const sql = getSql();
  const codes = [...new Set(chapterCodes)].slice(0, 40);
  if (!codes.length) return 0;

  const chapters = await sql<{ id: string }[]>`
    SELECT id FROM topics
    WHERE workspace_id = ${workspaceId}
      AND subject_id = ${subjectId}
      AND kind = 'chapter'
      AND code = ANY(${codes}::text[])
  `;

  for (const chapter of chapters) {
    await updateStudyTracking(workspaceId, {
      id: chapter.id,
      status: "Learning",
      wholeChapter: true,
      timeZone,
    });
  }
  return chapters.length;
}
