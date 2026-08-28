import { getSql, nowIso } from "./db";

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type StudyTask = {
  id: number;
  title: string;
  subjectId: string;
  dueDate: string;
  priority: TaskPriority;
  labels: string[];
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapTask(row: Record<string, unknown>): StudyTask {
  let labels: string[] = [];
  try {
    const parsed = JSON.parse(String(row.labels_json ?? "[]"));
    if (Array.isArray(parsed)) labels = parsed.filter((label): label is string => typeof label === "string");
  } catch {
    labels = [];
  }
  return {
    id: Number(row.id),
    title: String(row.title),
    subjectId: String(row.subject_id),
    dueDate: String(row.due_date),
    priority: row.priority as TaskPriority,
    labels,
    completed: Boolean(row.completed),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/** Open tasks first, soonest due first, then by priority. */
export async function getStudyTasks(workspaceId: string) {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    SELECT * FROM study_tasks
    WHERE workspace_id = ${workspaceId}
    ORDER BY completed ASC, due_date ASC,
      CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      id DESC
  `;
  return rows.map(mapTask);
}

export async function addStudyTask(workspaceId: string, input: {
  title: string;
  subjectId: string;
  dueDate: string;
  priority: TaskPriority;
  labels: string[];
}) {
  const sql = getSql();
  const now = nowIso();
  const rows = await sql<Record<string, unknown>[]>`
    INSERT INTO study_tasks (
      workspace_id, title, subject_id, due_date, priority, labels_json,
      completed, completed_at, created_at, updated_at
    ) VALUES (
      ${workspaceId}, ${input.title}, ${input.subjectId}, ${input.dueDate}, ${input.priority},
      ${JSON.stringify(input.labels)}, false, NULL, ${now}, ${now}
    )
    RETURNING *
  `;
  if (!rows.length) throw new Error("Task was not created.");
  return mapTask(rows[0]);
}

export async function updateStudyTask(workspaceId: string, input: {
  id: number;
  title?: string;
  subjectId?: string;
  dueDate?: string;
  priority?: TaskPriority;
  labels?: string[];
  completed?: boolean;
}) {
  const sql = getSql();
  const currentRows = await sql<Record<string, unknown>[]>`
    SELECT * FROM study_tasks WHERE workspace_id = ${workspaceId} AND id = ${input.id}
  `;
  if (!currentRows.length) throw new Error("Task not found.");
  const existing = mapTask(currentRows[0]);

  const completed = input.completed ?? existing.completed;
  const now = nowIso();
  const rows = await sql<Record<string, unknown>[]>`
    UPDATE study_tasks SET
      title = ${input.title ?? existing.title},
      subject_id = ${input.subjectId ?? existing.subjectId},
      due_date = ${input.dueDate ?? existing.dueDate},
      priority = ${input.priority ?? existing.priority},
      labels_json = ${JSON.stringify(input.labels ?? existing.labels)},
      completed = ${completed},
      completed_at = ${completed ? existing.completedAt ?? now : null},
      updated_at = ${now}
    WHERE workspace_id = ${workspaceId} AND id = ${input.id}
    RETURNING *
  `;
  if (!rows.length) throw new Error("Task was not updated.");
  return mapTask(rows[0]);
}

export async function deleteStudyTask(workspaceId: string, id: number) {
  const sql = getSql();
  await sql`DELETE FROM study_tasks WHERE workspace_id = ${workspaceId} AND id = ${id}`;
}
