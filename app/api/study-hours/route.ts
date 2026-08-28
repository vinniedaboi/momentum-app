import { addStudySession, deleteStudySession, getStudySessions } from "../../../lib/study-hours-db";
import { isKnownSubject } from "../../../lib/subjects-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return withWorkspace(async (workspaceId) => {
    try {
      return Response.json({ sessions: await getStudySessions(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your study hours." }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as {
        studyDate?: string;
        minutes?: number;
        subjectId?: string | null;
        note?: string | null;
        topicIds?: string[];
      };
      const minutes = Number(body.minutes);
      if (!body.studyDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.studyDate)) {
        return Response.json({ error: "Choose a valid study date." }, { status: 400 });
      }
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        return Response.json({ error: "Enter between 1 minute and 24 hours." }, { status: 400 });
      }
      const subjectId = body.subjectId?.trim() || null;
      if (subjectId && !(await isKnownSubject(workspaceId, subjectId))) {
        return Response.json({ error: "Choose a valid subject." }, { status: 400 });
      }
      const note = body.note?.trim().slice(0, 300) || null;
      const topicIds = [...new Set((Array.isArray(body.topicIds) ? body.topicIds : []).filter((id): id is string => typeof id === "string" && Boolean(id)))];
      if (topicIds.length > 200) {
        return Response.json({ error: "Choose up to 200 syllabus topics." }, { status: 400 });
      }
      if (topicIds.length && !subjectId) {
        return Response.json({ error: "Choose a subject before selecting syllabus topics." }, { status: 400 });
      }
      const result = await addStudySession(workspaceId, { studyDate: body.studyDate, minutes, subjectId, note, topicIds });
      return Response.json(result, { status: 201 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your study hours could not be saved." }, { status: 500 });
    }
  });
}

export async function DELETE(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const id = Number(new URL(request.url).searchParams.get("id"));
      if (!Number.isInteger(id) || id < 1) {
        return Response.json({ error: "A valid entry is required." }, { status: 400 });
      }
      await deleteStudySession(workspaceId, id);
      return new Response(null, { status: 204 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That entry could not be deleted." }, { status: 500 });
    }
  });
}
