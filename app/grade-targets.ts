/**
 * What a result already in hand leaves you needing in the exam still to come.
 *
 * Two shapes of the same question, and the same arithmetic answers both.
 *
 * An A Level is sat in two halves and reported as one grade, so a student
 * holding an AS result is holding half an answer: what does A2 have to average
 * for the whole thing to land on an A? The AS mark is *banked* — it carries
 * half the final grade whatever happens next.
 *
 * An IGCSE is sat in one go, so nothing is banked and a mock counts for
 * nothing. The question is the same shape — what do I need for a C? — but the
 * answer is simply the boundary, and the mock is there to say how far off it
 * you currently are.
 *
 * Both fall out of one formula once the result carries a weight: the share of
 * the final grade it already owns. Fifty for an AS, zero for a mock. At zero
 * the algebra collapses to "you need the boundary", which is exactly right.
 *
 * The model is deliberately the simple one the boards themselves describe, and
 * the screens say so: real boundaries move by a mark or two each session, and a
 * board that scales its papers differently will land nearby rather than
 * exactly. Nearby is what a revision target needs to be.
 *
 * Both the API route and the planner read this module, so it holds no types
 * from either side.
 */

import type { Subject } from "./subjects";

/**
 * The ladders a course can be graded on, and the overall percentage each grade
 * needs. The percentages are the standard uniform-mark bands rather than any
 * one session's raw thresholds, which is the approximation the whole screen is
 * built on.
 */
export const GRADE_SCALES = {
  "a-level": {
    label: "A Level",
    detail: "A* to E",
    grades: [["A*", 90], ["A", 80], ["B", 70], ["C", 60], ["D", 50], ["E", 40]],
  },
  igcse: {
    label: "IGCSE / O Level",
    detail: "A* to G",
    grades: [["A*", 90], ["A", 80], ["B", 70], ["C", 60], ["D", 50], ["E", 40], ["F", 30], ["G", 20]],
  },
  numeric: {
    label: "GCSE 9 to 1",
    detail: "9 to 1",
    grades: [["9", 90], ["8", 80], ["7", 70], ["6", 60], ["5", 50], ["4", 40], ["3", 30], ["2", 20], ["1", 10]],
  },
} as const satisfies Record<string, { label: string; detail: string; grades: ReadonlyArray<readonly [string, number]> }>;

export type GradeScale = keyof typeof GRADE_SCALES;

export const GRADE_SCALE_KEYS = Object.keys(GRADE_SCALES) as GradeScale[];

export function isGradeScale(value: unknown): value is GradeScale {
  return typeof value === "string" && value in GRADE_SCALES;
}

/** The grades of a scale, best first. */
export function gradesFor(scale: GradeScale): string[] {
  return GRADE_SCALES[scale].grades.map(([grade]) => grade);
}

export function gradeMinimum(scale: GradeScale, grade: string) {
  return GRADE_SCALES[scale].grades.find(([name]) => name === grade)?.[1] ?? 0;
}

export function isGradeOnScale(scale: GradeScale, grade: unknown): grade is string {
  return typeof grade === "string" && gradesFor(scale).includes(grade);
}

/**
 * What a result already in hand can be graded. Everything on the scale, plus
 * the U below it — except the top grade of an A Level, which the boards award
 * on the full course only, so an AS certificate never carries one.
 */
export function resultGrades(scale: GradeScale, banked: boolean) {
  const grades = gradesFor(scale);
  return [...(scale === "a-level" && banked ? grades.slice(1) : grades), "U"];
}

/**
 * The ladder a qualification is graded on. IGCSE has to be tested before the
 * bare GCSE, or "Cambridge IGCSE" matches the numeric scale it does not use.
 */
export function defaultScale(qualification: string | null | undefined): GradeScale {
  const name = qualification ?? "";
  if (/IGCSE|O Level/i.test(name)) return "igcse";
  if (/GCSE/i.test(name)) return "numeric";
  return "a-level";
}

/** The share of the final grade a finished first stage carries. */
export const DEFAULT_COMPLETED_WEIGHT = 50;

/** A mock is evidence rather than a bank, so it owns none of the grade. */
export const MOCK_WEIGHT = 0;

export type GradeTarget = {
  subjectId: string;
  gradeScale: GradeScale;
  /** The stage the result came from, or null when it was a mock. */
  completedStage: string | null;
  completedGrade: string | null;
  completedMark: number | null;
  completedMax: number | null;
  completedPercent: number;
  /** 50 for an AS that counts for half the A Level; 0 for a mock. */
  completedWeight: number;
  remainingStage: string;
  targetGrade: string;
  /** Null follows the target grade; a number is a learner aiming elsewhere. */
  paperTargetPercent: number | null;
  createdAt: string;
  updatedAt: string;
};

export type GradeTargetInput = Omit<GradeTarget, "createdAt" | "updatedAt">;

/** Weighing on the result: does it carry part of the grade, or only inform it? */
export function isBanked(target: Pick<GradeTarget, "completedWeight">) {
  return target.completedWeight > 0;
}

/**
 * The IB grades a course 1–7 and its two levels are different courses rather
 * than two halves of one, so none of the arithmetic below means anything
 * there. Everything else with a syllabus can carry a target: a course sat in
 * two halves prices the second against the first, and one sat in a single go
 * prices the exam against a mock.
 */
export function canTakeGradeTarget(subject: Subject) {
  if (subject.archived || !subject.stages.length || subject.stages.length > 2) return false;
  if (/^IB /i.test(subject.qualification ?? "")) return false;
  return !(subject.stages[0] === "SL" && subject.stages[1] === "HL");
}

/** The subjects a grade target can be set on, in display order. */
export function gradeTargetSubjects(subjects: Subject[]) {
  return subjects.filter(canTakeGradeTarget);
}

/** A percentage from a raw mark, or null when either half is missing. */
export function markPercent(mark: number | null, max: number | null) {
  if (mark == null || !max || max <= 0) return null;
  return Math.round((mark / max) * 1000) / 10;
}

type Weighed = Pick<GradeTarget, "completedPercent" | "completedWeight" | "gradeScale">;

/** Where a finished course lands, given what each part scored. */
export function overallPercent(target: Weighed, remainingPercent: number) {
  const remainingWeight = 100 - target.completedWeight;
  return (target.completedPercent * target.completedWeight + remainingPercent * remainingWeight) / 100;
}

/** The grade an overall percentage earns. Below the lowest band is U. */
export function overallGrade(scale: GradeScale, percent: number): string {
  return gradesFor(scale).find((grade) => percent >= gradeMinimum(scale, grade)) ?? "U";
}

/**
 * What the exam still to come has to average for a given overall grade.
 *
 * Returned unclamped and unrounded. A number above 100 is a grade that can no
 * longer be reached and one at or below 0 is a grade already secured — both
 * are answers worth showing, and rounding either away would turn "you cannot
 * get there" into "score 100". With a mock, whose weight is zero, this is just
 * the grade's own boundary.
 */
export function requiredPercent(target: Weighed, grade: string) {
  const remainingWeight = 100 - target.completedWeight;
  return (gradeMinimum(target.gradeScale, grade) * 100 - target.completedPercent * target.completedWeight)
    / remainingWeight;
}

export type GradeReach = "secured" | "reachable" | "out-of-reach";

export type GradeRung = {
  grade: string;
  minimum: number;
  /** Rounded up: needing 87.2 and scoring 87 misses, so 87.2 shows as 88. */
  required: number;
  raw: number;
  reach: GradeReach;
};

/** Every grade, what it now costs, and whether it is still on the table. */
export function gradeLadder(target: Weighed): GradeRung[] {
  return gradesFor(target.gradeScale).map((grade) => {
    const raw = requiredPercent(target, grade);
    return {
      grade,
      minimum: gradeMinimum(target.gradeScale, grade),
      required: Math.min(100, Math.max(0, Math.ceil(raw))),
      raw,
      // A hair over 100 is arithmetic noise rather than an unreachable grade:
      // 100.0001 comes back from a percentage that was itself rounded to a
      // tenth, and telling someone a grade is gone by a thousandth of a mark
      // is worse than telling them it needs everything.
      reach: raw > 100.05 ? "out-of-reach" : raw <= 0 ? "secured" : "reachable",
    };
  });
}

/** The best and worst a banked result still allows, scoring 100 and 0. */
export function gradeRange(target: Weighed) {
  return {
    best: overallGrade(target.gradeScale, overallPercent(target, 100)),
    worst: overallGrade(target.gradeScale, overallPercent(target, 0)),
  };
}

/**
 * The percentage past papers are measured against: the learner's own number
 * where they set one, and otherwise whatever the target grade needs.
 */
export function paperTarget(target: GradeTarget) {
  if (target.paperTargetPercent != null) return target.paperTargetPercent;
  const rung = gradeLadder(target).find((entry) => entry.grade === target.targetGrade);
  return rung ? rung.required : 0;
}

/** "an A*" and "an E", but "a B". Grades are read aloud, so the article shows. */
export function gradeArticle(grade: string) {
  return /^[AEF8]/.test(grade) ? "an" : "a";
}

/** Grade targets by subject id, for a view holding a list of papers. */
export function targetsBySubject(targets: GradeTarget[]) {
  return new Map(targets.map((target) => [target.subjectId, target]));
}
