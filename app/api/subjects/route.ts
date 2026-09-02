import {
  addSubject,
  deleteSubject,
  getSubjects,
  reorderSubjects,
  subjectStages,
  subjectUsage,
  updateSubject,
  SUBJECT_TONES,
  type SubjectTone,
} from "../../../lib/subjects-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

const TONES = new Set<string>(SUBJECT_TONES);

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return trimmed || null;
}

function cleanStages(value: unknown) {
  if (!Array.isArray(value)) return [];
  const stages: string[] = [];
  for (const item of value) {
    const stage = cleanText(item, 16);
    if (stage && !stages.includes(stage)) stages.push(stage);
    if (stages.length === 6) break;
  }
  return stages;
}

/** Only stages the subject actually has can be marked as already sat. */
function cleanCompletedStages(value: unknown, stages: string[]) {
  if (!Array.isArray(value)) return [];
  return stages.filter((stage) => value.some((item) => cleanText(item, 16) === stage));
}

function cleanPaperStages(value: unknown, stages: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const map: Record<string, string> = {};
  for (const [paper, stage] of Object.entries(value as Record<string, unknown>)) {
    const key = cleanText(paper, 16);
    const target = cleanText(stage, 16);
    if (key && target && stages.includes(target)) map[key] = target;
    if (Object.keys(map).length === 24) break;
  }
  return map;
}

export async function GET(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const id = new URL(request.url).searchParams.get("usage");
      if (id) return Response.json({ usage: await subjectUsage(workspaceId, id) });
      return Response.json({ subjects: await getSubjects(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your subjects." }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as Record<string, unknown>;
      const name = cleanText(body.name, 60);
      if (!name) return Response.json({ error: "Give the subject a name." }, { status: 400 });
      const tone = TONES.has(String(body.tone)) ? String(body.tone) as SubjectTone : "blue";
      const stages = cleanStages(body.stages);
      return Response.json({
        subject: await addSubject(workspaceId, {
          name,
          shortName: cleanText(body.shortName, 12),
          tone,
          board: cleanText(body.board, 40),
          qualification: cleanText(body.qualification, 80),
          syllabusCode: cleanText(body.syllabusCode, 16),
          stages,
          paperStages: cleanPaperStages(body.paperStages, stages),
        }),
      });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That subject could not be saved." }, { status: 500 });
    }
  });
}

export async function PATCH(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as Record<string, unknown>;

      if (Array.isArray(body.order)) {
        const ids = body.order.map((id) => String(id)).slice(0, 60);
        return Response.json({ subjects: await reorderSubjects(workspaceId, ids) });
      }

      const id = cleanText(body.id, 60);
      if (!id) return Response.json({ error: "That subject could not be found." }, { status: 400 });

      const stages = body.stages === undefined ? undefined : cleanStages(body.stages);
      // Validated against the stages the subject will have once this patch
      // lands, which is the incoming set when the split is being changed in
      // the same call and the stored one otherwise.
      const known = stages ?? (await subjectStages(workspaceId, id)) ?? [];
      return Response.json({
        subject: await updateSubject(workspaceId, id, {
          ...(body.name === undefined ? {} : { name: cleanText(body.name, 60) ?? undefined }),
          ...(body.shortName === undefined ? {} : { shortName: cleanText(body.shortName, 12) }),
          ...(body.tone === undefined ? {} : { tone: TONES.has(String(body.tone)) ? String(body.tone) as SubjectTone : "blue" }),
          ...(body.board === undefined ? {} : { board: cleanText(body.board, 40) }),
          ...(body.qualification === undefined ? {} : { qualification: cleanText(body.qualification, 80) }),
          ...(body.syllabusCode === undefined ? {} : { syllabusCode: cleanText(body.syllabusCode, 16) }),
          ...(stages === undefined ? {} : { stages }),
          ...(body.paperStages === undefined ? {} : { paperStages: cleanPaperStages(body.paperStages, known) }),
          ...(body.completedStages === undefined ? {} : { completedStages: cleanCompletedStages(body.completedStages, known) }),
          ...(body.archived === undefined ? {} : { archived: Boolean(body.archived) }),
        }),
      });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That subject could not be updated." }, { status: 500 });
    }
  });
}

export async function DELETE(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
      if (!id) return Response.json({ error: "That subject could not be found." }, { status: 400 });
      await deleteSubject(workspaceId, id);
      return new Response(null, { status: 204 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That subject could not be removed." }, { status: 500 });
    }
  });
}
