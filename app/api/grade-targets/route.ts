import { deleteGradeTarget, getGradeTargets, saveGradeTarget } from "../../../lib/grade-targets-db";
import { getSubject } from "../../../lib/subjects-db";
import { withWorkspace } from "../../../lib/auth";
import {
  canTakeGradeTarget,
  isOverallGrade,
  markPercent,
  STAGE_GRADES,
  type StageGrade,
} from "../../grade-targets";

export const runtime = "nodejs";

const GRADES = new Set<string>(STAGE_GRADES);

type TargetBody = Partial<{
  subjectId: string;
  completedStage: string;
  completedGrade: string | null;
  completedMark: number | null;
  completedMax: number | null;
  completedPercent: number;
  completedWeight: number;
  remainingStage: string;
  targetGrade: string;
  paperTargetPercent: number | null;
}>;

function cleanNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A percentage rounded to a tenth, which is the finest a uniform mark reports. */
function cleanPercent(value: unknown) {
  const parsed = cleanNumber(value);
  if (parsed == null || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 10) / 10;
}

export async function GET() {
  return withWorkspace(async (workspaceId) => {
    try {
      return Response.json({ targets: await getGradeTargets(workspaceId) });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Could not load your grade targets." }, { status: 500 });
    }
  });
}

export async function POST(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const body = await request.json() as TargetBody;
      const subject = body.subjectId ? await getSubject(workspaceId, body.subjectId) : null;
      if (!subject || !canTakeGradeTarget(subject)) {
        return Response.json({ error: "Choose a subject that is sat in two stages." }, { status: 400 });
      }

      const { completedStage, remainingStage } = body;
      if (!completedStage || !remainingStage
        || !subject.stages.includes(completedStage)
        || !subject.stages.includes(remainingStage)
        || completedStage === remainingStage) {
        return Response.json(
          { error: `Choose which of ${subject.stages.join(" and ")} you have already sat.` },
          { status: 400 },
        );
      }

      // The mark is the input; the percentage is what everything downstream
      // reads. Sent together so a statement of results can be typed in as it
      // was written, and the two are reconciled here rather than trusted apart.
      const mark = cleanNumber(body.completedMark);
      const max = cleanNumber(body.completedMax);
      if (mark != null && max != null && (max <= 0 || mark < 0 || mark > max)) {
        return Response.json({ error: "Enter a mark between 0 and the paper total." }, { status: 400 });
      }
      const percent = markPercent(mark, max) ?? cleanPercent(body.completedPercent);
      if (percent == null) {
        return Response.json({ error: `Enter what you scored in ${completedStage}.` }, { status: 400 });
      }

      const weight = cleanNumber(body.completedWeight);
      if (weight == null || !Number.isInteger(weight) || weight < 5 || weight > 95) {
        return Response.json(
          { error: `Enter what share of the grade ${completedStage} carries, between 5 and 95.` },
          { status: 400 },
        );
      }

      if (!isOverallGrade(body.targetGrade)) {
        return Response.json({ error: "Choose the overall grade you are aiming for." }, { status: 400 });
      }

      const grade = typeof body.completedGrade === "string" ? body.completedGrade.trim().toUpperCase() : null;
      if (grade && !GRADES.has(grade)) {
        return Response.json({ error: `Choose the grade you were awarded for ${completedStage}.` }, { status: 400 });
      }

      // Null is not a missing value here: it is the learner saying "whatever
      // the target grade needs", so an absent key and an explicit null agree.
      const paperTargetPercent = body.paperTargetPercent == null
        ? null
        : cleanPercent(body.paperTargetPercent);
      if (body.paperTargetPercent != null && paperTargetPercent == null) {
        return Response.json({ error: "Enter a paper target between 0 and 100 per cent." }, { status: 400 });
      }

      const target = await saveGradeTarget(workspaceId, {
        subjectId: subject.id,
        completedStage,
        completedGrade: (grade as StageGrade | null) ?? null,
        completedMark: max == null ? null : mark,
        completedMax: mark == null ? null : max,
        completedPercent: percent,
        completedWeight: weight,
        remainingStage,
        targetGrade: body.targetGrade,
        paperTargetPercent,
      });
      return Response.json({ target });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "Your grade target could not be saved." }, { status: 500 });
    }
  });
}

export async function DELETE(request: Request) {
  return withWorkspace(async (workspaceId) => {
    try {
      const subjectId = new URL(request.url).searchParams.get("subjectId") ?? "";
      if (!subjectId) {
        return Response.json({ error: "Choose a valid subject." }, { status: 400 });
      }
      await deleteGradeTarget(workspaceId, subjectId);
      return new Response(null, { status: 204 });
    } catch (error) {
      console.error(error);
      return Response.json({ error: "That grade target could not be removed." }, { status: 500 });
    }
  });
}
