import { deleteExam, getExams, saveExam, MAX_EXAM_TOPICS, type ExamInput } from "../../../lib/exams-db";
import { subjectStages } from "../../../lib/subjects-db";
import { PACE_MODES, type PaceMode } from "../../../lib/pacing";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ExamBody = Partial<{
  id: number;
  subjectId: string;
  title: string;
  stage: string | null;
  examDate: string;
  startDate: string;
  weeklyHours: number;
  studyDays: number;
  paceMode: PaceMode;
  notes: string | null;
  topicIds: unknown;
}>;

async function validate(workspaceId: string, body: ExamBody) {
  const stages = await subjectStages(workspaceId, body.subjectId);
  if (!body.subjectId || !stages) {
    return "Choose a valid subject.";
  }
  if (!body.title?.trim()) return "Name the exam.";
  if (!body.examDate || !DATE_PATTERN.test(body.examDate)) return "Choose a valid exam date.";
  if (!body.startDate || !DATE_PATTERN.test(body.startDate)) return "Choose a valid start date.";
  if (body.examDate <= body.startDate) return "The exam date has to be after the start date.";
  if (body.stage != null && !stages.includes(body.stage)) {
    return `Choose ${stages.join(", ") || "no stage"}, or leave the stage unset.`;
  }

  const weeklyHours = Number(body.weeklyHours);
  if (!Number.isInteger(weeklyHours) || weeklyHours < 1 || weeklyHours > 80) {
    return "Choose between 1 and 80 revision hours per week.";
  }
  const studyDays = Number(body.studyDays);
  if (!Number.isInteger(studyDays) || studyDays < 1 || studyDays > 7) {
    return "Choose between 1 and 7 revision days per week.";
  }
  if (!body.paceMode || !(PACE_MODES as readonly string[]).includes(body.paceMode)) {
    return "Choose a valid pacing style.";
  }

  const topicIds = Array.isArray(body.topicIds) ? body.topicIds : [];
  if (!topicIds.length) return "Pick the topics this exam covers.";
  if (topicIds.length > MAX_EXAM_TOPICS) return `An exam can cover up to ${MAX_EXAM_TOPICS} topics.`;

  return null;
}

function toInput(body: ExamBody): ExamInput {
  const topicIds = (Array.isArray(body.topicIds) ? body.topicIds : [])
    .filter((id): id is string => typeof id === "string" && Boolean(id));

  return {
    subjectId: String(body.subjectId),
    title: String(body.title).trim().slice(0, 120),
    stage: body.stage ? String(body.stage) : null,
    examDate: String(body.examDate),
    startDate: String(body.startDate),
    weeklyHours: Number(body.weeklyHours),
    studyDays: Number(body.studyDays),
    paceMode: body.paceMode as PaceMode,
    notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null,
    topicIds,
  };
}

export async function GET() {
  return withWorkspace(async (workspaceId) => {
    try {
      return Response.json({ exams: await getExams(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your exams." }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as ExamBody;
      const problem = await validate(workspaceId, body);
      if (problem) return Response.json({ error: problem }, { status: 400 });
      return Response.json({ exam: await saveExam(workspaceId, toInput(body)) }, { status: 201 });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error && error.message.includes("not in this subject")
        ? "A selected topic is not in this subject."
        : "That exam could not be saved.";
      return Response.json({ error: message }, { status: 400 });
    }
  });
}

export async function PATCH(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as ExamBody;
      const id = Number(body.id);
      if (!Number.isInteger(id) || id < 1) {
        return Response.json({ error: "That exam could not be found." }, { status: 400 });
      }
      const problem = await validate(workspaceId, body);
      if (problem) return Response.json({ error: problem }, { status: 400 });
      return Response.json({ exam: await saveExam(workspaceId, { ...toInput(body), id }) });
    } catch (error) {
      console.error(error);
      const message = error instanceof Error && error.message.includes("not in this subject")
        ? "A selected topic is not in this subject."
        : "That exam could not be updated.";
      return Response.json({ error: message }, { status: 400 });
    }
  });
}

export async function DELETE(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const id = Number(new URL(request.url).searchParams.get("id"));
      if (!Number.isInteger(id) || id < 1) {
        return Response.json({ error: "That exam could not be found." }, { status: 400 });
      }
      await deleteExam(workspaceId, id);
      return new Response(null, { status: 204 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That exam could not be removed." }, { status: 500 });
    }
  });
}
