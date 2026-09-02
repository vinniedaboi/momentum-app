import { deleteStudyGoal, getStudyGoals, saveStudyGoal } from "../../../lib/goals-db";
import { getSubject } from "../../../lib/subjects-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  return withWorkspace(async (workspaceId) => {
    try {
      return Response.json({ goals: await getStudyGoals(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your syllabus goals." }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as {
        subjectId?: string;
        stage?: string;
        startDate?: string;
        targetDate?: string;
        weeklyHours?: number;
        studyDays?: number;
        paceMode?: "steady" | "front-loaded" | "finish-line";
      };
      const weeklyHours = Number(body.weeklyHours);
      const studyDays = Number(body.studyDays);
      // Read once and carry it into the save: validating the stage and pacing
      // the syllabus both need the same subject row.
      const subject = body.subjectId ? await getSubject(workspaceId, body.subjectId) : null;
      const stages = subject?.stages;
      if (!body.subjectId || !stages) {
        return Response.json({ error: "Choose a valid syllabus." }, { status: 400 });
      }
      if (!body.stage || !stages.includes(body.stage)) {
        return Response.json({ error: `Choose ${stages.join(" or ") || "a stage"}.` }, { status: 400 });
      }
      if (!body.startDate || !body.targetDate || !DATE_PATTERN.test(body.startDate) || !DATE_PATTERN.test(body.targetDate) || body.targetDate <= body.startDate) {
        return Response.json({ error: "Choose a target date after the start date." }, { status: 400 });
      }
      if (!Number.isInteger(weeklyHours) || weeklyHours < 1 || weeklyHours > 80) {
        return Response.json({ error: "Choose between 1 and 80 study hours per week." }, { status: 400 });
      }
      if (!Number.isInteger(studyDays) || studyDays < 1 || studyDays > 7) {
        return Response.json({ error: "Choose between 1 and 7 study days per week." }, { status: 400 });
      }
      if (body.paceMode !== "steady" && body.paceMode !== "front-loaded" && body.paceMode !== "finish-line") {
        return Response.json({ error: "Choose a valid pacing style." }, { status: 400 });
      }
      const goal = await saveStudyGoal(workspaceId, {
        subjectId: body.subjectId,
        stage: body.stage,
        startDate: body.startDate,
        targetDate: body.targetDate,
        weeklyHours,
        studyDays,
        paceMode: body.paceMode,
      }, subject);
      return Response.json({ goal });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your syllabus goal could not be saved." }, { status: 500 });
    }
  });
}

export async function DELETE(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const params = new URL(request.url).searchParams;
      const subjectId = params.get("subjectId") ?? "";
      const stage = params.get("stage") ?? "";
      const subject = subjectId ? await getSubject(workspaceId, subjectId) : null;
      if (!subject?.stages.includes(stage)) {
        return Response.json({ error: "Choose a valid syllabus." }, { status: 400 });
      }
      await deleteStudyGoal(workspaceId, subjectId, stage, subject);
      return new Response(null, { status: 204 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That syllabus goal could not be removed." }, { status: 500 });
    }
  });
}
