import { addStudyTask, deleteStudyTask, getStudyTasks, TASK_PRIORITIES, updateStudyTask, type TaskPriority } from "../../../lib/tasks-db";
import { isKnownSubject } from "../../../lib/subjects-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normaliseLabels(value: unknown) {
  if (!Array.isArray(value)) return [];
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const label = item.trim().replace(/\s+/g, " ").slice(0, 24);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    labels.push(label);
    seen.add(key);
    if (labels.length === 5) break;
  }
  return labels;
}

export async function GET() {
  return withWorkspace(async (workspaceId) => {
    try {
      return Response.json({ tasks: await getStudyTasks(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your tasks." }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as { title?: string; subjectId?: string; dueDate?: string; priority?: TaskPriority; labels?: unknown };
      const title = body.title?.trim().slice(0, 160) ?? "";
      if (!title) return Response.json({ error: "Give your task a name." }, { status: 400 });
      if (!body.subjectId || !(await isKnownSubject(workspaceId, body.subjectId))) return Response.json({ error: "Choose a valid subject." }, { status: 400 });
      if (!body.dueDate || !DATE_PATTERN.test(body.dueDate)) return Response.json({ error: "Choose a valid due date." }, { status: 400 });
      const priority = body.priority ?? "medium";
      if (!TASK_PRIORITIES.includes(priority)) return Response.json({ error: "Choose a valid priority." }, { status: 400 });
      const task = await addStudyTask(workspaceId, { title, subjectId: body.subjectId, dueDate: body.dueDate, priority, labels: normaliseLabels(body.labels) });
      return Response.json({ task }, { status: 201 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your task could not be saved." }, { status: 500 });
    }
  });
}

export async function PATCH(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as { id?: number; title?: string; subjectId?: string; dueDate?: string; priority?: TaskPriority; labels?: unknown; completed?: boolean };
      const id = Number(body.id);
      if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Choose a valid task." }, { status: 400 });
      const title = body.title === undefined ? undefined : body.title.trim().slice(0, 160);
      if (title !== undefined && !title) return Response.json({ error: "Give your task a name." }, { status: 400 });
      if (body.subjectId !== undefined && !(await isKnownSubject(workspaceId, body.subjectId))) return Response.json({ error: "Choose a valid subject." }, { status: 400 });
      if (body.dueDate !== undefined && !DATE_PATTERN.test(body.dueDate)) return Response.json({ error: "Choose a valid due date." }, { status: 400 });
      if (body.priority !== undefined && !TASK_PRIORITIES.includes(body.priority)) return Response.json({ error: "Choose a valid priority." }, { status: 400 });
      const task = await updateStudyTask(workspaceId, { id, title, subjectId: body.subjectId, dueDate: body.dueDate, priority: body.priority, labels: body.labels === undefined ? undefined : normaliseLabels(body.labels), completed: body.completed });
      return Response.json({ task });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your task could not be updated." }, { status: 500 });
    }
  });
}

export async function DELETE(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const id = Number(new URL(request.url).searchParams.get("id"));
      if (!Number.isInteger(id) || id < 1) return Response.json({ error: "Choose a valid task." }, { status: 400 });
      await deleteStudyTask(workspaceId, id);
      return new Response(null, { status: 204 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That task could not be deleted." }, { status: 500 });
    }
  });
}
