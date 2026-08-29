import { getSql, nowIso, type SqlClient } from "./db";
import { pacedDates, type PaceMode } from "./pacing";
import type { SyllabusStage } from "../app/syllabus-stage";

/**
 * Exam planner.
 *
 * A syllabus goal paces a whole stage and parks its plan in `topics.goal_due`.
 * An exam covers a chosen subset, and the same topic can belong to several
 * exams at once, so each exam keeps its own dates in `exam_topics.revise_on`.
 * Nothing here touches `goal_due`; the two plans coexist.
 */

export type ExamTopic = {
  topicId: string;
  /** Scheduled revision date, or null once the topic is already finished. */
  reviseOn: string | null;
};

export type Exam = {
  id: number;
  subjectId: string;
  title: string;
  /** Null when the subject has no AS/A2 split, or the exam spans both. */
  stage: SyllabusStage | null;
  examDate: string;
  startDate: string;
  weeklyHours: number;
  studyDays: number;
  paceMode: PaceMode;
  notes: string | null;
  scheduleAppliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  topics: ExamTopic[];
};

export type ExamInput = {
  subjectId: string;
  title: string;
  stage: SyllabusStage | null;
  examDate: string;
  startDate: string;
  weeklyHours: number;
  studyDays: number;
  paceMode: PaceMode;
  notes: string | null;
  topicIds: string[];
};

/** How many topics one exam may cover — a full A Level syllabus and then some. */
export const MAX_EXAM_TOPICS = 1000;

function mapExam(row: Record<string, unknown>, topics: ExamTopic[]): Exam {
  return {
    id: Number(row.id),
    subjectId: String(row.subject_id),
    title: String(row.title),
    stage: row.stage ? String(row.stage) : null,
    examDate: String(row.exam_date),
    startDate: String(row.start_date),
    weeklyHours: Number(row.weekly_hours ?? 10),
    studyDays: Number(row.study_days ?? 5),
    paceMode: row.pace_mode === "front-loaded" || row.pace_mode === "finish-line" ? row.pace_mode : "steady",
    notes: row.notes ? String(row.notes) : null,
    scheduleAppliedAt: row.schedule_applied_at ? String(row.schedule_applied_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    topics,
  };
}

/**
 * Writes a revision date onto every selected topic, in syllabus order, spread
 * across the run-up to the exam. Topics already at Covered or Exam Ready get
 * null so the plan only ever lists outstanding work.
 */
async function scheduleExam(executor: SqlClient, workspaceId: string, examId: number, exam: {
  startDate: string;
  examDate: string;
  paceMode: PaceMode;
  studyDays: number;
}) {
  const selected = await executor<{ topic_id: string; covered: boolean; status: string }[]>`
    SELECT et.topic_id, t.covered, t.status
    FROM exam_topics et
    JOIN topics t ON t.workspace_id = et.workspace_id AND t.id = et.topic_id
    WHERE et.workspace_id = ${workspaceId} AND et.exam_id = ${examId}
    ORDER BY t.source_row
  `;
  if (!selected.length) return;

  const schedule = pacedDates(selected.length, {
    startDate: exam.startDate,
    endDate: exam.examDate,
    paceMode: exam.paceMode,
    studyDays: exam.studyDays,
  });

  const ids: string[] = [];
  const dates: (string | null)[] = [];
  selected.forEach((topic, index) => {
    const complete = topic.covered || topic.status === "Exam Ready";
    ids.push(topic.topic_id);
    dates.push(complete ? null : schedule[index]);
  });

  await executor`
    UPDATE exam_topics SET revise_on = plan.revise_on
    FROM unnest(${ids}::text[], ${dates}::text[]) AS plan(topic_id, revise_on)
    WHERE exam_topics.workspace_id = ${workspaceId}
      AND exam_topics.exam_id = ${examId}
      AND exam_topics.topic_id = plan.topic_id
  `;
}

async function topicsByExam(executor: SqlClient, workspaceId: string) {
  const rows = await executor<{ exam_id: number; topic_id: string; revise_on: string | null }[]>`
    SELECT et.exam_id, et.topic_id, et.revise_on
    FROM exam_topics et
    JOIN topics t ON t.workspace_id = et.workspace_id AND t.id = et.topic_id
    WHERE et.workspace_id = ${workspaceId}
    ORDER BY t.source_row
  `;
  const byExam = new Map<number, ExamTopic[]>();
  for (const row of rows) {
    const examId = Number(row.exam_id);
    const bucket = byExam.get(examId) ?? [];
    bucket.push({ topicId: row.topic_id, reviseOn: row.revise_on });
    byExam.set(examId, bucket);
  }
  return byExam;
}

/**
 * Soonest exam first. Any plan that has not been written yet is applied here,
 * so an interrupted save recovers on the next read.
 */
export async function getExams(workspaceId: string): Promise<Exam[]> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM exams WHERE workspace_id = ${workspaceId}
    ORDER BY exam_date, id
  `;
  if (!rows.length) return [];

  const pending = rows.filter((row) => !row.schedule_applied_at);
  if (pending.length) {
    await sql.begin(async (tx) => {
      for (const row of pending) {
        const id = Number(row.id);
        await scheduleExam(tx, workspaceId, id, {
          startDate: String(row.start_date),
          examDate: String(row.exam_date),
          paceMode: row.pace_mode as PaceMode,
          studyDays: Number(row.study_days ?? 5),
        });
        const stamp = nowIso();
        await tx`
          UPDATE exams SET schedule_applied_at = ${stamp}
          WHERE workspace_id = ${workspaceId} AND id = ${id}
        `;
        row.schedule_applied_at = stamp;
      }
    });
  }

  const byExam = await topicsByExam(sql, workspaceId);
  return rows.map((row) => mapExam(row, byExam.get(Number(row.id)) ?? []));
}

export async function getExam(workspaceId: string, id: number): Promise<Exam | null> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM exams WHERE workspace_id = ${workspaceId} AND id = ${id}
  `;
  if (!rows.length) return null;
  const byExam = await topicsByExam(sql, workspaceId);
  return mapExam(rows[0], byExam.get(id) ?? []);
}

/**
 * Creates or replaces an exam and its topic selection in one transaction, then
 * re-paces it. Passing `id` updates in place; the selection is replaced whole
 * rather than merged, because that is what the picker sends.
 */
export async function saveExam(workspaceId: string, input: ExamInput & { id?: number }): Promise<Exam> {
  const sql = getSql();
  const now = nowIso();
  const topicIds = [...new Set(input.topicIds)].slice(0, MAX_EXAM_TOPICS);

  const examId = await sql.begin(async (tx) => {
    // Every selected topic must belong to the exam's subject, so a crafted
    // request cannot pull another subject's rows into the plan.
    if (topicIds.length) {
      const valid = await tx<{ id: string }[]>`
        SELECT id FROM topics
        WHERE workspace_id = ${workspaceId}
          AND subject_id = ${input.subjectId}
          AND id = ANY(${topicIds}::text[])
      `;
      if (valid.length !== topicIds.length) throw new Error("A selected topic is not in this subject.");
    }

    let id: number;
    if (input.id) {
      const updated = await tx<{ id: number }[]>`
        UPDATE exams SET
          subject_id = ${input.subjectId},
          title = ${input.title},
          stage = ${input.stage},
          exam_date = ${input.examDate},
          start_date = ${input.startDate},
          weekly_hours = ${input.weeklyHours},
          study_days = ${input.studyDays},
          pace_mode = ${input.paceMode},
          notes = ${input.notes},
          schedule_applied_at = NULL,
          updated_at = ${now}
        WHERE workspace_id = ${workspaceId} AND id = ${input.id}
        RETURNING id
      `;
      if (!updated.length) throw new Error("Exam not found.");
      id = Number(updated[0].id);
      await tx`DELETE FROM exam_topics WHERE workspace_id = ${workspaceId} AND exam_id = ${id}`;
    } else {
      const created = await tx<{ id: number }[]>`
        INSERT INTO exams (
          workspace_id, subject_id, title, stage, exam_date, start_date,
          weekly_hours, study_days, pace_mode, notes, schedule_applied_at, created_at, updated_at
        ) VALUES (
          ${workspaceId}, ${input.subjectId}, ${input.title}, ${input.stage}, ${input.examDate},
          ${input.startDate}, ${input.weeklyHours}, ${input.studyDays}, ${input.paceMode},
          ${input.notes}, NULL, ${now}, ${now}
        )
        RETURNING id
      `;
      id = Number(created[0].id);
    }

    if (topicIds.length) {
      for (let start = 0; start < topicIds.length; start += 500) {
        const chunk = topicIds.slice(start, start + 500);
        await tx`
          INSERT INTO exam_topics ${tx(
            chunk.map((topicId) => ({ workspace_id: workspaceId, exam_id: id, topic_id: topicId })),
            "workspace_id",
            "exam_id",
            "topic_id",
          )}
        `;
      }
    }

    await scheduleExam(tx, workspaceId, id, {
      startDate: input.startDate,
      examDate: input.examDate,
      paceMode: input.paceMode,
      studyDays: input.studyDays,
    });
    await tx`
      UPDATE exams SET schedule_applied_at = ${nowIso()}
      WHERE workspace_id = ${workspaceId} AND id = ${id}
    `;

    return id;
  });

  const exam = await getExam(workspaceId, examId);
  if (!exam) throw new Error("Exam was not saved.");
  return exam;
}

export async function deleteExam(workspaceId: string, id: number) {
  const sql = getSql();
  // exam_topics cascades from the exam's foreign key.
  await sql`DELETE FROM exams WHERE workspace_id = ${workspaceId} AND id = ${id}`;
}
