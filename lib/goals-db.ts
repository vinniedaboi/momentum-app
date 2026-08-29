import { getSql, nowIso, type SqlClient } from "./db";
import { pacedDates, type PaceMode } from "./pacing";
import { getTopicStage, type SyllabusStage } from "../app/syllabus-stage";
import { getSubject } from "./subjects-db";

export type StudyGoal = {
  subjectId: string;
  stage: SyllabusStage;
  startDate: string;
  targetDate: string;
  weeklyHours: number;
  studyDays: number;
  paceMode: PaceMode;
  scheduleAppliedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ScheduleTopic = {
  id: string;
  subjectId: string;
  paper: string | null;
  academicLevel: string | null;
  kind: "chapter" | "point";
  parentId: string | null;
  sourceRow: number;
  status: string;
  covered: boolean;
};

function mapGoal(row: Record<string, unknown>): StudyGoal {
  return {
    subjectId: String(row.subject_id),
    stage: String(row.stage),
    startDate: String(row.start_date),
    targetDate: String(row.target_date),
    weeklyHours: Number(row.weekly_hours),
    studyDays: Number(row.study_days ?? 5),
    paceMode: row.pace_mode === "front-loaded" || row.pace_mode === "finish-line" ? row.pace_mode : "steady",
    scheduleAppliedAt: row.schedule_applied_at ? String(row.schedule_applied_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** The subject's points for one stage. Stage rules live on the subject. */
async function syllabusTopics(
  executor: SqlClient,
  workspaceId: string,
  subjectId: string,
  stage: StudyGoal["stage"],
) {
  const rows = await executor<Record<string, unknown>[]>`
    SELECT id, subject_id, paper, academic_level, kind, parent_id, source_row, status, covered
    FROM topics
    WHERE workspace_id = ${workspaceId} AND subject_id = ${subjectId}
    ORDER BY source_row
  `;
  const topics: ScheduleTopic[] = rows.map((row) => ({
    id: String(row.id),
    subjectId: String(row.subject_id),
    paper: row.paper ? String(row.paper) : null,
    academicLevel: row.academic_level ? String(row.academic_level) : null,
    kind: row.kind === "chapter" ? "chapter" : "point",
    parentId: row.parent_id ? String(row.parent_id) : null,
    sourceRow: Number(row.source_row),
    status: String(row.status),
    covered: Boolean(row.covered),
  }));
  const subject = await getSubject(workspaceId, subjectId);
  return topics.filter((topic) => getTopicStage(topic, topics, subject) === stage);
}

/**
 * Spreads the stage's outstanding points across the goal window and writes a
 * `goal_due` date onto each. Already-finished points get null, so the plan only
 * ever shows work that is still left.
 */
async function scheduleStudyGoal(executor: SqlClient, workspaceId: string, goal: StudyGoal) {
  const points = (await syllabusTopics(executor, workspaceId, goal.subjectId, goal.stage))
    .filter((topic) => topic.kind === "point");
  if (!points.length) return;

  const now = nowIso();
  const schedule = pacedDates(points.length, {
    startDate: goal.startDate,
    endDate: goal.targetDate,
    paceMode: goal.paceMode,
    studyDays: goal.studyDays,
  });

  const ids: string[] = [];
  const dueDates: (string | null)[] = [];
  points.forEach((point, index) => {
    // Finished points drop off the plan, so it only ever shows work left.
    const complete = point.covered || point.status === "Exam Ready";
    ids.push(point.id);
    dueDates.push(complete ? null : schedule[index]);
  });

  // One statement rather than a per-point round trip: a full A Level syllabus
  // is several hundred points.
  await executor`
    UPDATE topics SET goal_due = plan.goal_due, updated_at = ${now}
    FROM unnest(${ids}::text[], ${dueDates}::text[]) AS plan(id, goal_due)
    WHERE topics.workspace_id = ${workspaceId} AND topics.id = plan.id
  `;
}

async function clearStudyGoalSchedule(
  executor: SqlClient,
  workspaceId: string,
  subjectId: string,
  stage: StudyGoal["stage"],
) {
  const points = (await syllabusTopics(executor, workspaceId, subjectId, stage))
    .filter((topic) => topic.kind === "point");
  if (!points.length) return;
  await executor`
    UPDATE topics SET goal_due = NULL
    WHERE workspace_id = ${workspaceId} AND id = ANY(${points.map((point) => point.id)}::text[])
  `;
}

/**
 * Reads the goals, applying any schedule that has not been written yet. A goal
 * is saved with `schedule_applied_at = NULL` so an interrupted save still gets
 * its plan on the next read.
 */
export async function getStudyGoals(workspaceId: string) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM study_goals
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at, subject_id
  `;
  const goals = rows.map(mapGoal);

  for (const goal of goals) {
    if (goal.scheduleAppliedAt) continue;
    const appliedAt = await sql.begin(async (tx) => {
      await scheduleStudyGoal(tx, workspaceId, goal);
      const stamp = nowIso();
      await tx`
        UPDATE study_goals SET schedule_applied_at = ${stamp}
        WHERE workspace_id = ${workspaceId} AND subject_id = ${goal.subjectId} AND stage = ${goal.stage}
      `;
      return stamp;
    });
    goal.scheduleAppliedAt = appliedAt;
  }

  return goals;
}

export async function saveStudyGoal(workspaceId: string, input: {
  subjectId: string;
  stage: SyllabusStage;
  startDate: string;
  targetDate: string;
  weeklyHours: number;
  studyDays: number;
  paceMode: PaceMode;
}) {
  const sql = getSql();
  const now = nowIso();

  return sql.begin(async (tx) => {
    const rows = await tx<Record<string, unknown>[]>`
      INSERT INTO study_goals (
        workspace_id, subject_id, stage, start_date, target_date, weekly_hours,
        study_days, pace_mode, schedule_applied_at, created_at, updated_at
      ) VALUES (
        ${workspaceId}, ${input.subjectId}, ${input.stage}, ${input.startDate}, ${input.targetDate},
        ${input.weeklyHours}, ${input.studyDays}, ${input.paceMode}, NULL, ${now}, ${now}
      )
      ON CONFLICT (workspace_id, subject_id, stage) DO UPDATE SET
        start_date = excluded.start_date,
        target_date = excluded.target_date,
        weekly_hours = excluded.weekly_hours,
        study_days = excluded.study_days,
        pace_mode = excluded.pace_mode,
        schedule_applied_at = NULL,
        updated_at = excluded.updated_at
      RETURNING *
    `;
    if (!rows.length) throw new Error("Study goal was not saved.");

    const goal = mapGoal(rows[0]);
    await scheduleStudyGoal(tx, workspaceId, goal);
    const appliedAt = nowIso();
    await tx`
      UPDATE study_goals SET schedule_applied_at = ${appliedAt}
      WHERE workspace_id = ${workspaceId} AND subject_id = ${goal.subjectId} AND stage = ${goal.stage}
    `;
    goal.scheduleAppliedAt = appliedAt;
    return goal;
  });
}

export async function deleteStudyGoal(workspaceId: string, subjectId: string, stage: SyllabusStage) {
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM study_goals
      WHERE workspace_id = ${workspaceId} AND subject_id = ${subjectId} AND stage = ${stage}
    `;
    await clearStudyGoalSchedule(tx, workspaceId, subjectId, stage);
  });
}
