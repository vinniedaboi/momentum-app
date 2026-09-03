import { deleteGradeTarget, getGradeTargets, saveGradeTarget } from "../../../lib/grade-targets-db";
import { getSubject } from "../../../lib/subjects-db";
import { withWorkspace } from "../../../lib/auth";
import {
  canTakeGradeTarget,
  isComponentStatus,
  isGradeOnScale,
  isGradeScale,
  markPercent,
  resultGrades,
  type TargetComponent,
} from "../../grade-targets";

export const runtime = "nodejs";

type TargetBody = Partial<{
  subjectId: string;
  gradeScale: string;
  completedStage: string | null;
  completedGrade: string | null;
  completedMark: number | null;
  completedMax: number | null;
  completedPercent: number;
  completedWeight: number;
  remainingStage: string;
  targetGrade: string;
  paperTargetPercent: number | null;
  award: string;
  components: unknown;
}>;

/** How many papers one award of one syllabus can reasonably be made of. */
const MAX_COMPONENTS = 12;

/**
 * The papers of the chosen route.
 *
 * The weighting is validated but not looked up: it comes from the board's own
 * syllabus through `syllabus_assessment`, and a learner sitting a course the
 * parser could not read types it in from the page in front of them. What is
 * refused is a set that could not be a route — nothing, too many, or more than
 * a whole award between them.
 */
function cleanComponents(value: unknown): TargetComponent[] | string {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return "Choose the papers you are sitting.";
  if (value.length > MAX_COMPONENTS) return `A route cannot have more than ${MAX_COMPONENTS} papers.`;

  const components: TargetComponent[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const row = entry as Record<string, unknown>;
    const component = typeof row.component === "string" ? row.component.trim().slice(0, 40) : "";
    if (!component || seen.has(component)) return "Each paper can only be listed once.";
    seen.add(component);

    const weighting = cleanNumber(row.weighting);
    if (weighting == null || weighting <= 0 || weighting > 100) {
      return `Enter what ${component} is worth, between 1 and 100 per cent.`;
    }
    const status = isComponentStatus(row.status) ? row.status : "todo";
    const mark = cleanNumber(row.mark);
    const maxMark = cleanNumber(row.maxMark);
    if (status !== "todo" && mark == null) return `Enter what you scored in ${component}.`;
    if (maxMark != null && maxMark <= 0) return `Enter the total ${component} is marked out of.`;
    if (mark != null && (mark < 0 || mark > (maxMark ?? 100))) {
      return `Enter a ${component} mark between 0 and its total.`;
    }

    components.push({
      component,
      title: typeof row.title === "string" ? row.title.trim().slice(0, 80) || null : null,
      weighting,
      mark: status === "todo" ? null : mark,
      maxMark,
      status,
      position: Number.isFinite(Number(row.position)) ? Number(row.position) : index,
    });
  }

  const covered = components.reduce((sum, component) => sum + component.weighting, 0);
  if (covered > 100.05) return "Those papers come to more than a whole award between them.";
  return components;
}

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
        return Response.json({ error: "Choose a subject with a syllabus to aim at." }, { status: 400 });
      }
      if (!isGradeScale(body.gradeScale)) {
        return Response.json({ error: "Choose how the course is graded." }, { status: 400 });
      }
      const scale = body.gradeScale;

      const { remainingStage } = body;
      if (!remainingStage || !subject.stages.includes(remainingStage)) {
        return Response.json(
          { error: `Choose which of ${subject.stages.join(" and ")} you are aiming at.` },
          { status: 400 },
        );
      }

      // Zero is a mock: a result that says where the learner is without owning
      // any of the grade. Anything above it is a stage of the course that has
      // been sat, and a stage has to say which one it was.
      const weight = cleanNumber(body.completedWeight);
      if (weight == null || !Number.isInteger(weight) || weight < 0 || weight > 95) {
        return Response.json({ error: "Enter a share of the grade between 0 and 95." }, { status: 400 });
      }
      const banked = weight > 0;
      const completedStage = banked ? body.completedStage : null;
      if (banked && (!completedStage
        || !subject.stages.includes(completedStage)
        || completedStage === remainingStage)) {
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
        return Response.json(
          { error: banked ? `Enter what you scored in ${completedStage}.` : "Enter what your mock came to." },
          { status: 400 },
        );
      }

      if (!isGradeOnScale(scale, body.targetGrade)) {
        return Response.json({ error: "Choose the overall grade you are aiming for." }, { status: 400 });
      }

      const grade = typeof body.completedGrade === "string" ? body.completedGrade.trim().toUpperCase() : null;
      if (grade && !resultGrades(scale, banked).includes(grade)) {
        return Response.json({ error: "Choose the grade that result was awarded." }, { status: 400 });
      }

      // Null is not a missing value here: it is the learner saying "whatever
      // the target grade needs", so an absent key and an explicit null agree.
      const paperTargetPercent = body.paperTargetPercent == null
        ? null
        : cleanPercent(body.paperTargetPercent);
      if (body.paperTargetPercent != null && paperTargetPercent == null) {
        return Response.json({ error: "Enter a paper target between 0 and 100 per cent." }, { status: 400 });
      }

      const components = cleanComponents(body.components);
      if (typeof components === "string") {
        return Response.json({ error: components }, { status: 400 });
      }
      // The award the papers are weighted against. Free text rather than a
      // fixed set, because it is whatever `syllabus_assessment` says — and a
      // learner typing their own route in names it themselves.
      const award = typeof body.award === "string" && body.award.trim()
        ? body.award.trim().slice(0, 24)
        : banked ? "A Level" : "qualification";

      const target = await saveGradeTarget(workspaceId, {
        subjectId: subject.id,
        gradeScale: scale,
        award,
        components,
        completedStage: completedStage ?? null,
        completedGrade: grade,
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
