import { getSql, nowIso, type SqlClient } from "./db";
import { pacedDates, type PaceMode } from "./pacing";
import { getTopicStage, type SyllabusStage } from "../app/syllabus-stage";
import { getSubject, getSubjects, type Subject } from "./subjects-db";

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

/**
 * Every topic of the given subjects, in syllabus order, grouped by subject.
 *
 * Read for all of them at once rather than a query per goal: a learner with a
 * goal on each subject and stage turned the read below into a round trip per
 * goal, and the two stages of one subject read the same rows twice.
 */
async function subjectTopics(executor: SqlClient, workspaceId: string, subjectIds: string[]) {
  const rows = await executor<Record<string, unknown>[]>`
    SELECT id, subject_id, paper, academic_level, kind, parent_id, source_row, status, covered
    FROM topics
    WHERE workspace_id = ${workspaceId} AND subject_id = ANY(${subjectIds}::text[])
    ORDER BY source_row
  `;
  const bySubject = new Map<string, ScheduleTopic[]>();
  for (const row of rows) {
    const subjectId = String(row.subject_id);
    const bucket = bySubject.get(subjectId) ?? [];
    bucket.push({
      id: String(row.id),
      subjectId,
      paper: row.paper ? String(row.paper) : null,
      academicLevel: row.academic_level ? String(row.academic_level) : null,
      kind: row.kind === "chapter" ? "chapter" : "point",
      parentId: row.parent_id ? String(row.parent_id) : null,
      sourceRow: Number(row.source_row),
      status: String(row.status),
      covered: Boolean(row.covered),
    });
    bySubject.set(subjectId, bucket);
  }
  return bySubject;
}

/** The subject's points for one stage. Stage rules live on the subject. */
function stagePoints(topics: ScheduleTopic[], stage: StudyGoal["stage"], subject: Subject | null) {
  return topics.filter((topic) =>
    topic.kind === "point" && getTopicStage(topic, topics, subject) === stage);
}

type GoalDuePlan = { ids: string[]; dueDates: (string | null)[] };

/**
 * Spreads the stage's outstanding points across the goal window, giving each a
 * `goal_due` date. Already-finished points get null, so the plan only ever
 * shows work that is still left.
 */
function goalDuePlan(points: ScheduleTopic[], goal: StudyGoal, into: GoalDuePlan) {
  if (!points.length) return into;
  const schedule = pacedDates(points.length, {
    startDate: goal.startDate,
    endDate: goal.targetDate,
    paceMode: goal.paceMode,
    studyDays: goal.studyDays,
  });
  points.forEach((point, index) => {
    // Finished points drop off the plan, so it only ever shows work left.
    const complete = point.covered || point.status === "Exam Ready";
    into.ids.push(point.id);
    into.dueDates.push(complete ? null : schedule[index]);
  });
  return into;
}

/**
 * Writes a whole plan in one statement rather than a per-point round trip: a
 * full A Level syllabus is several hundred points, and a learner tracking every
 * subject has several of those to place at once.
 */
async function writeGoalDue(executor: SqlClient, workspaceId: string, plan: GoalDuePlan) {
  if (!plan.ids.length) return;
  await executor`
    UPDATE topics SET goal_due = plan.goal_due, updated_at = ${nowIso()}
    FROM unnest(${plan.ids}::text[], ${plan.dueDates}::text[]) AS plan(id, goal_due)
    WHERE topics.workspace_id = ${workspaceId} AND topics.id = plan.id
  `;
}

async function scheduleStudyGoal(
  executor: SqlClient,
  workspaceId: string,
  goal: StudyGoal,
  subject: Subject | null,
) {
  const topics = (await subjectTopics(executor, workspaceId, [goal.subjectId])).get(goal.subjectId) ?? [];
  await writeGoalDue(executor, workspaceId, goalDuePlan(
    stagePoints(topics, goal.stage, subject),
    goal,
    { ids: [], dueDates: [] },
  ));
}

async function clearStudyGoalSchedule(
  executor: SqlClient,
  workspaceId: string,
  subjectId: string,
  stage: StudyGoal["stage"],
  subject: Subject | null,
) {
  const topics = (await subjectTopics(executor, workspaceId, [subjectId])).get(subjectId) ?? [];
  const points = stagePoints(topics, stage, subject);
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

  // Whatever is outstanding is placed together: four statements for the lot,
  // rather than a transaction and three round trips for each goal. Every point
  // belongs to exactly one subject and stage, so the plans never overlap and
  // can be written as a single update.
  const pending = goals.filter((goal) => !goal.scheduleAppliedAt);
  if (!pending.length) return goals;

  const stamp = nowIso();
  await sql.begin(async (tx) => {
    const subjects = new Map((await getSubjects(workspaceId, tx)).map((subject) => [subject.id, subject]));
    const bySubject = await subjectTopics(tx, workspaceId, [...new Set(pending.map((goal) => goal.subjectId))]);
    const plan: GoalDuePlan = { ids: [], dueDates: [] };
    for (const goal of pending) {
      const topics = bySubject.get(goal.subjectId) ?? [];
      goalDuePlan(stagePoints(topics, goal.stage, subjects.get(goal.subjectId) ?? null), goal, plan);
    }
    await writeGoalDue(tx, workspaceId, plan);
    await tx`
      UPDATE study_goals SET schedule_applied_at = ${stamp}
      FROM unnest(
        ${pending.map((goal) => goal.subjectId)}::text[],
        ${pending.map((goal) => goal.stage)}::text[]
      ) AS applied(subject_id, stage)
      WHERE study_goals.workspace_id = ${workspaceId}
        AND study_goals.subject_id = applied.subject_id
        AND study_goals.stage = applied.stage
    `;
  });
  for (const goal of pending) goal.scheduleAppliedAt = stamp;

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
}, subject?: Subject | null) {
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
    const known = subject ?? await getSubject(workspaceId, input.subjectId, tx);
    await scheduleStudyGoal(tx, workspaceId, goal, known);
    const appliedAt = nowIso();
    await tx`
      UPDATE study_goals SET schedule_applied_at = ${appliedAt}
      WHERE workspace_id = ${workspaceId} AND subject_id = ${goal.subjectId} AND stage = ${goal.stage}
    `;
    goal.scheduleAppliedAt = appliedAt;
    return goal;
  });
}

export async function deleteStudyGoal(
  workspaceId: string,
  subjectId: string,
  stage: SyllabusStage,
  subject?: Subject | null,
) {
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM study_goals
      WHERE workspace_id = ${workspaceId} AND subject_id = ${subjectId} AND stage = ${stage}
    `;
    const known = subject ?? await getSubject(workspaceId, subjectId, tx);
    await clearStudyGoalSchedule(tx, workspaceId, subjectId, stage, known);
  });
}
