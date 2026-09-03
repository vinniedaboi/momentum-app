import { getSql, nowIso, type SqlClient } from "./db";
import {
  bankedFromComponents,
  isComponentStatus,
  isGradeScale,
  type GradeTarget,
  type GradeTargetInput,
  type TargetComponent,
} from "../app/grade-targets";

/**
 * The result a learner already holds for one stage, and the grade they are
 * working towards in the other.
 *
 * One row per subject, upserted: a learner revises the number they typed far
 * more often than they add a new one, and a second row for the same subject
 * would only ever contradict the first.
 */

function mapComponent(row: Record<string, unknown>): TargetComponent {
  return {
    component: String(row.component),
    title: row.title ? String(row.title) : null,
    weighting: Number(row.weighting),
    mark: row.mark == null ? null : Number(row.mark),
    maxMark: row.max_mark == null ? null : Number(row.max_mark),
    status: isComponentStatus(row.status) ? row.status : "todo",
    position: Number(row.position ?? 0),
  };
}

function mapTarget(row: Record<string, unknown>): GradeTarget {
  return {
    subjectId: String(row.subject_id),
    gradeScale: isGradeScale(row.grade_scale) ? row.grade_scale : "a-level",
    award: String(row.award ?? "A Level"),
    components: [],
    completedStage: row.completed_stage ? String(row.completed_stage) : null,
    completedGrade: row.completed_grade ? String(row.completed_grade) : null,
    completedMark: row.completed_mark == null ? null : Number(row.completed_mark),
    completedMax: row.completed_max == null ? null : Number(row.completed_max),
    completedPercent: Number(row.completed_percent),
    completedWeight: Number(row.completed_weight),
    remainingStage: String(row.remaining_stage),
    targetGrade: String(row.target_grade),
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
  const targets = rows.map(mapTarget);
  if (!targets.length) return targets;

  // One read for every target's papers rather than one per target: a learner
  // tracking nine subjects would otherwise open nine round trips to render a
  // screen that shows one of them.
  const componentRows = await sql<Record<string, unknown>[]>`
    SELECT * FROM grade_target_components
    WHERE workspace_id = ${workspaceId}
    ORDER BY position, component
  `;
  const bySubject = new Map<string, TargetComponent[]>();
  for (const row of componentRows) {
    const subjectId = String(row.subject_id);
    bySubject.set(subjectId, [...(bySubject.get(subjectId) ?? []), mapComponent(row)]);
  }
  for (const target of targets) target.components = bySubject.get(target.subjectId) ?? [];
  return targets;
}

/**
 * Writes the papers of one target, and reports what they bank.
 *
 * The whole set is replaced rather than merged: the rows are a route, and a
 * learner switching from Core to Extended is choosing different papers, not
 * editing the ones they had.
 */
async function writeComponents(
  tx: SqlClient,
  workspaceId: string,
  subjectId: string,
  components: TargetComponent[],
  now: string,
) {
  await tx`
    DELETE FROM grade_target_components
    WHERE workspace_id = ${workspaceId} AND subject_id = ${subjectId}
  `;
  if (!components.length) return;
  await tx`
    INSERT INTO grade_target_components ${tx(
      components.map((component, index) => ({
        workspace_id: workspaceId,
        subject_id: subjectId,
        component: component.component,
        title: component.title,
        weighting: component.weighting,
        mark: component.status === "todo" ? null : component.mark,
        max_mark: component.maxMark,
        status: component.status,
        position: component.position || index,
        created_at: now,
        updated_at: now,
      })),
      "workspace_id", "subject_id", "component", "title", "weighting",
      "mark", "max_mark", "status", "position", "created_at", "updated_at",
    )}
  `;
}

/**
 * Upserts a target and the papers behind it.
 *
 * Where there are papers, what is banked is counted from them rather than
 * taken from the caller: the browser can be wrong about arithmetic, and the
 * two numbers the ladder reads have to agree with the rows they came from or
 * the screen contradicts itself. A target with no papers keeps the figures it
 * was given, which is how a subject the parser cannot speak for still works.
 */
export async function saveGradeTarget(workspaceId: string, input: GradeTargetInput) {
  const sql = getSql();
  const now = nowIso();
  const banked = input.components.length
    ? bankedFromComponents(input.components)
    : { completedPercent: input.completedPercent, completedWeight: input.completedWeight };

  return sql.begin(async (tx) => {
    const target = await upsertTarget(tx, workspaceId, { ...input, ...banked }, now);
    await writeComponents(tx, workspaceId, input.subjectId, input.components, now);
    return { ...target, components: input.components };
  });
}

async function upsertTarget(
  tx: SqlClient,
  workspaceId: string,
  input: GradeTargetInput,
  now: string,
) {
  const rows = await tx<Record<string, unknown>[]>`
    INSERT INTO grade_targets (
      workspace_id, subject_id, grade_scale, award, completed_stage, completed_grade,
      completed_mark, completed_max, completed_percent, completed_weight,
      remaining_stage, target_grade, paper_target_percent, created_at, updated_at
    ) VALUES (
      ${workspaceId}, ${input.subjectId}, ${input.gradeScale}, ${input.award},
      ${input.completedStage}, ${input.completedGrade}, ${input.completedMark},
      ${input.completedMax}, ${input.completedPercent}, ${input.completedWeight},
      ${input.remainingStage}, ${input.targetGrade}, ${input.paperTargetPercent}, ${now}, ${now}
    )
    ON CONFLICT (workspace_id, subject_id) DO UPDATE SET
      grade_scale = excluded.grade_scale,
      award = excluded.award,
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
