import { addTopicProgressNote, getChapterActivity, getTopicActivity } from "../../../lib/topic-activity-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const params = new URL(request.url).searchParams;
      const topicId = params.get("topicId")?.trim();
      if (!topicId) return Response.json({ error: "Choose a syllabus topic." }, { status: 400 });
      if (params.get("scope") === "chapter") {
        return Response.json({ activity: await getChapterActivity(workspaceId, topicId) });
      }
      return Response.json({ activity: await getTopicActivity(workspaceId, topicId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load this topic’s timeline." }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as { topicId?: string; note?: string };
      const topicId = body.topicId?.trim() ?? "";
      const note = body.note?.trim().slice(0, 500) ?? "";
      if (!topicId) return Response.json({ error: "Choose a syllabus topic." }, { status: 400 });
      if (!note) return Response.json({ error: "Write a short progress update first." }, { status: 400 });
      const result = await addTopicProgressNote(workspaceId, topicId, note);
      return Response.json(result, { status: 201 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your progress update could not be saved." }, { status: 500 });
    }
  });
}
