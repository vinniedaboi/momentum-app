import {
  addPastPaper,
  deletePastPaper,
  getPastPapers,
  updatePastPaper,
  PAPER_CONDITIONS,
  PAPER_GRADES,
  PAPER_SESSIONS,
  PAPER_STATUSES,
  type PaperConditions,
  type PaperGrade,
  type PaperSession,
  type PaperStatus,
  type PastPaperInput,
} from "../../../lib/past-papers-db";
import { subjectStages } from "../../../lib/subjects-db";
import { withWorkspace } from "../../../lib/auth";

export const runtime = "nodejs";

const SESSIONS = new Set<string>(PAPER_SESSIONS);
const CONDITIONS = new Set<string>(PAPER_CONDITIONS);
const STATUSES = new Set<string>(PAPER_STATUSES);
const GRADES = new Set<string>(PAPER_GRADES);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type PaperBody = Partial<{
  paperId: string | null;
  subjectId: string;
  stage: string;
  board: string | null;
  paper: string;
  variant: string | null;
  session: PaperSession;
  year: number;
  attemptDate: string;
  score: number | null;
  maxScore: number | null;
  grade: PaperGrade | null;
  durationMinutes: number | null;
  conditions: PaperConditions;
  status: PaperStatus;
  weakTopics: string[];
  notes: string | null;
}>;

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return trimmed || null;
}

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanWeakTopics(value: unknown) {
  if (!Array.isArray(value)) return [];
  const topics: string[] = [];
  for (const item of value) {
    const label = cleanText(item, 40);
    if (label && !topics.some((topic) => topic.toLowerCase() === label.toLowerCase())) topics.push(label);
    if (topics.length === 8) break;
  }
  return topics;
}

/**
 * An attempt is filed against one of the learner's own subjects, and the stage
 * is checked against that subject's own split rather than against a shape.
 * The catalogue names thousands of subjects nobody is necessarily tracking, so
 * a name that is not one of theirs has nowhere to go — and a stage the subject
 * does not have would file the paper where no plan would ever read it.
 */
async function validate(workspaceId: string, body: PaperBody, partial: boolean) {
  const provided = (key: keyof PaperBody) => body[key] !== undefined;

  if (!partial || provided("subjectId") || provided("stage")) {
    const stages = await subjectStages(workspaceId, body.subjectId);
    if (!stages?.length) return "Choose one of your own subjects.";
    if (!partial || provided("stage")) {
      if (!body.stage || !stages.includes(body.stage)) return `Choose ${stages.join(" or ")} for this paper.`;
    }
  }
  if (!partial || provided("paper")) {
    if (!cleanText(body.paper, 40)) return "Add the paper, for example Paper 4.";
  }
  if (!partial || provided("session")) {
    if (!body.session || !SESSIONS.has(body.session)) return "Choose a valid exam session.";
  }
  if (!partial || provided("year")) {
    const year = cleanNumber(body.year);
    if (year == null || !Number.isInteger(year) || year < 1990 || year > 2100) return "Choose a valid paper year.";
  }
  if (!partial || provided("attemptDate")) {
    if (!body.attemptDate || !DATE_PATTERN.test(body.attemptDate)) return "Choose a valid date.";
  }
  if (!partial || provided("conditions")) {
    if (!body.conditions || !CONDITIONS.has(body.conditions)) return "Choose valid exam conditions.";
  }
  if (!partial || provided("status")) {
    if (!body.status || !STATUSES.has(body.status)) return "Choose whether the paper is planned or done.";
  }
  if (provided("grade") && body.grade !== null && !GRADES.has(String(body.grade))) {
    return "Choose a valid grade.";
  }

  const score = cleanNumber(body.score);
  const maxScore = cleanNumber(body.maxScore);
  if (score != null && (score < 0 || score > 1000)) return "Enter a score between 0 and 1000.";
  if (maxScore != null && (maxScore <= 0 || maxScore > 1000)) return "Enter total marks between 1 and 1000.";
  if (score != null && maxScore != null && score > maxScore) return "The score cannot be higher than the total marks.";
  if (body.status === "done" && (score == null || maxScore == null)) {
    return "Add the score and total marks for a completed paper.";
  }

  const duration = cleanNumber(body.durationMinutes);
  if (duration != null && (duration < 1 || duration > 600)) return "Enter a time taken between 1 and 600 minutes.";

  return null;
}

function toInput(body: PaperBody): PastPaperInput {
  return {
    paperId: cleanText(body.paperId, 60),
    subjectId: String(body.subjectId),
    stage: String(body.stage),
    board: cleanText(body.board, 40),
    paper: cleanText(body.paper, 40) as string,
    variant: cleanText(body.variant, 10),
    session: body.session as PaperSession,
    year: Number(body.year),
    attemptDate: String(body.attemptDate),
    score: cleanNumber(body.score),
    maxScore: cleanNumber(body.maxScore),
    grade: body.grade ? (body.grade as PaperGrade) : null,
    durationMinutes: cleanNumber(body.durationMinutes),
    conditions: body.conditions as PaperConditions,
    status: body.status as PaperStatus,
    weakTopics: cleanWeakTopics(body.weakTopics),
    notes: cleanText(body.notes, 500),
  };
}

function toPartialInput(body: PaperBody): Partial<PastPaperInput> {
  const input: Partial<PastPaperInput> = {};
  if (body.paperId !== undefined) input.paperId = cleanText(body.paperId, 60);
  if (body.subjectId !== undefined) input.subjectId = String(body.subjectId);
  if (body.stage !== undefined) input.stage = String(body.stage);
  if (body.board !== undefined) input.board = cleanText(body.board, 40);
  if (body.paper !== undefined) input.paper = cleanText(body.paper, 40) as string;
  if (body.variant !== undefined) input.variant = cleanText(body.variant, 10);
  if (body.session !== undefined) input.session = body.session as PaperSession;
  if (body.year !== undefined) input.year = Number(body.year);
  if (body.attemptDate !== undefined) input.attemptDate = String(body.attemptDate);
  if (body.score !== undefined) input.score = cleanNumber(body.score);
  if (body.maxScore !== undefined) input.maxScore = cleanNumber(body.maxScore);
  if (body.grade !== undefined) input.grade = body.grade ? (body.grade as PaperGrade) : null;
  if (body.durationMinutes !== undefined) input.durationMinutes = cleanNumber(body.durationMinutes);
  if (body.conditions !== undefined) input.conditions = body.conditions as PaperConditions;
  if (body.status !== undefined) input.status = body.status as PaperStatus;
  if (body.weakTopics !== undefined) input.weakTopics = cleanWeakTopics(body.weakTopics);
  if (body.notes !== undefined) input.notes = cleanText(body.notes, 500);
  return input;
}

export async function GET() {
  return withWorkspace(async (workspaceId) => {
    try {
      return Response.json({ papers: await getPastPapers(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your past papers." }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as PaperBody;
      const problem = await validate(workspaceId, body, false);
      if (problem) return Response.json({ error: problem }, { status: 400 });
      return Response.json({ paper: await addPastPaper(workspaceId, toInput(body)) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That past paper could not be saved." }, { status: 500 });
    }
  });
}

export async function PATCH(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as PaperBody & { id?: number };
      const id = Number(body.id);
      if (!Number.isInteger(id) || id < 1) {
        return Response.json({ error: "That past paper could not be found." }, { status: 400 });
      }
      const problem = await validate(workspaceId, body, true);
      if (problem) return Response.json({ error: problem }, { status: 400 });
      return Response.json({ paper: await updatePastPaper(workspaceId, id, toPartialInput(body)) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That past paper could not be updated." }, { status: 500 });
    }
  });
}

export async function DELETE(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const id = Number(new URL(request.url).searchParams.get("id"));
      if (!Number.isInteger(id) || id < 1) {
        return Response.json({ error: "That past paper could not be found." }, { status: 400 });
      }
      await deletePastPaper(workspaceId, id);
      return new Response(null, { status: 204 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That past paper could not be removed." }, { status: 500 });
    }
  });
}
