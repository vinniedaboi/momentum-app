import { getSql, nowIso } from "./db";
import type { GradeTarget, GradeTargetInput, OverallGrade } from "../app/grade-targets";

/**
 * The result a learner already holds for one stage, and the grade they are
 * working towards in the other.
 *
 * One row per subject, upserted: a learner revises the number they typed far
 * more often than they add a new one, and a second row for the same subject
 * would only ever contradict the first.
 */

function mapTarget(row: Record<string, unknown>): GradeTarget {
  return {
    subjectId: String(row.subject_id),
    completedStage: String(row.completed_stage),
    completedGrade: row.completed_grade ? String(row.completed_grade) : null,
    completedMark: row.completed_mark == null ? null : Number(row.completed_mark),
    completedMax: row.completed_max == null ? null : Number(row.completed_max),
    completedPercent: Number(row.completed_percent),
    completedWeight: Number(row.completed_weight),
    remainingStage: String(row.remaining_stage),
    targetGrade: String(row.target_grade) as OverallGrade,
    paperTargetPercent: row.paper_target_percent == null ? null : Number(row.paper_target_percent),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function getGradeTargets(workspaceId: string) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM grade_targets
    WHERE workspace_id = ${workspaceId}
    ORDER BY created_at, subject_id
  `;
  return rows.map(mapTarget);
}

export async function saveGradeTarget(workspaceId: string, input: GradeTargetInput) {
  const sql = getSql();
  const now = nowIso();
  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO grade_targets (
      workspace_id, subject_id, completed_stage, completed_grade, completed_mark,
      completed_max, completed_percent, completed_weight, remaining_stage,
      target_grade, paper_target_percent, created_at, updated_at
    ) VALUES (
      ${workspaceId}, ${input.subjectId}, ${input.completedStage}, ${input.completedGrade},
      ${input.completedMark}, ${input.completedMax}, ${input.completedPercent},
      ${input.completedWeight}, ${input.remainingStage}, ${input.targetGrade},
      ${input.paperTargetPercent}, ${now}, ${now}
    )
    ON CONFLICT (workspace_id, subject_id) DO UPDATE SET
      completed_stage = excluded.completed_stage,
      completed_grade = excluded.completed_grade,
      completed_mark = excluded.completed_mark,
      completed_max = excluded.completed_max,
      completed_percent = excluded.completed_percent,
      completed_weight = excluded.completed_weight,
      remaining_stage = excluded.remaining_stage,
      target_grade = excluded.target_grade,
      paper_target_percent = excluded.paper_target_percent,
      updated_at = excluded.updated_at
    RETURNING *
  `;
  if (!rows.length) throw new Error("Grade target was not saved.");
  return mapTarget(rows[0]);
}

export async function deleteGradeTarget(workspaceId: string, subjectId: string) {
  const sql = getSql();
  await sql`
    DELETE FROM grade_targets WHERE workspace_id = ${workspaceId} AND subject_id = ${subjectId}
  `;
}
