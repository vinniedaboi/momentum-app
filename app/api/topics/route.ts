import { getTopics, importSubjectTopics, STATUSES, updateSelectedStudyTracking, updateStudyTracking, type ImportTopicRow, type StudyStatus } from "../../../lib/topics-db";
import { isKnownSubject } from "../../../lib/subjects-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

const MAX_IMPORT_ROWS = 2000;

export async function GET() {
  return withWorkspace(async (workspaceId) => {
    try {
      return Response.json({ topics: await getTopics(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your study tracker." }, { status: 500 });
    }
  });
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return trimmed || null;
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as { subjectId?: string; topics?: unknown };
      const subjectId = body.subjectId?.trim() ?? "";
      if (!subjectId || !(await isKnownSubject(workspaceId, subjectId))) {
        return Response.json({ error: "Choose a valid subject." }, { status: 400 });
      }
      if (!Array.isArray(body.topics) || !body.topics.length) {
        return Response.json({ error: "Add at least one chapter or point to import." }, { status: 400 });
      }
      if (body.topics.length > MAX_IMPORT_ROWS) {
        return Response.json({ error: `A syllabus can hold up to ${MAX_IMPORT_ROWS} rows.` }, { status: 400 });
      }

      const rows: ImportTopicRow[] = [];
      for (const raw of body.topics as Array<Record<string, unknown>>) {
        const code = cleanText(raw.code, 20);
        const title = cleanText(raw.title, 300);
        if (!code || !title) continue;
        const kind = raw.kind === "chapter" ? "chapter" : "point";
        rows.push({
          code,
          title,
          kind,
          parentCode: kind === "point" ? cleanText(raw.parentCode, 20) : null,
          paper: cleanText(raw.paper, 20),
          section: cleanText(raw.section, 120),
          academicLevel: cleanText(raw.academicLevel, 80),
        });
      }
      if (!rows.length) {
        return Response.json({ error: "No rows had both a code and a title." }, { status: 400 });
      }

      const result = await importSubjectTopics(workspaceId, subjectId, rows);
      return Response.json({ imported: result });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That syllabus could not be imported." }, { status: 500 });
    }
  });
}

export async function PATCH(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as {
        id?: string;
        ids?: string[];
        status?: StudyStatus;
        reviewedNow?: boolean;
        wholeChapter?: boolean;
      };
      if (body.status && !STATUSES.includes(body.status)) {
        return Response.json({ error: "That status is not supported." }, { status: 400 });
      }
      if (body.ids) {
        const ids = [...new Set(body.ids.filter((id): id is string => typeof id === "string" && Boolean(id)))];
        if (!ids.length || ids.length > 200) {
          return Response.json({ error: "Choose between 1 and 200 syllabus points." }, { status: 400 });
        }
        const topics = await updateSelectedStudyTracking(workspaceId, {
          ids,
          status: body.status,
          reviewedNow: body.reviewedNow,
        });
        return Response.json({ topics });
      }
      if (!body.id) return Response.json({ error: "A topic is required." }, { status: 400 });
      const topics = await updateStudyTracking(workspaceId, {
        id: body.id,
        status: body.status,
        reviewedNow: body.reviewedNow,
        wholeChapter: body.wholeChapter,
      });
      return Response.json({ topics });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your update could not be saved." }, { status: 500 });
    }
  });
}
