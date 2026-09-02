/**
 * What a finished stage leaves you needing in the one still to come.
 *
 * An A Level is sat in two halves and reported as one grade. A student who
 * already has an AS result is therefore holding half an answer, and the only
 * question left is arithmetic: given what is banked, what does the second half
 * have to average?
 *
 * The model is deliberately the simple one the boards themselves describe —
 * the two stages are weighted shares of a single percentage, and the overall
 * grade falls out of the same thresholds every year. It is an estimate and the
 * screens say so: real boundaries move by a mark or two each session, and a
 * board that scales its papers differently will land nearby rather than
 * exactly. Nearby is what a revision target needs to be.
 *
 * Both the API route and the planner read this module, so it holds no types
 * from either side.
 */

import type { Subject } from "./subjects";

export const OVERALL_GRADES = ["A*", "A", "B", "C", "D", "E"] as const;
export type OverallGrade = (typeof OVERALL_GRADES)[number];

/**
 * What a half of a course can be graded. No A*: the boards award it on the
 * full A Level only, so an AS certificate never carries one.
 */
export const STAGE_GRADES = ["A", "B", "C", "D", "E", "U"] as const;
export type StageGrade = (typeof STAGE_GRADES)[number];

/** The overall percentage each grade needs, highest first. */
const GRADE_MINIMUMS: Record<OverallGrade, number> = {
  "A*": 90,
  A: 80,
  B: 70,
  C: 60,
  D: 50,
  E: 40,
};

/** The share of the final grade a finished stage carries, where nothing says otherwise. */
export const DEFAULT_COMPLETED_WEIGHT = 50;

export type GradeTarget = {
  subjectId: string;
  completedStage: string;
  completedGrade: string | null;
  completedMark: number | null;
  completedMax: number | null;
  completedPercent: number;
  completedWeight: number;
  remainingStage: string;
  targetGrade: OverallGrade;
  /** Null follows the target grade; a number is a learner aiming elsewhere. */
  paperTargetPercent: number | null;
  createdAt: string;
  updatedAt: string;
};

export type GradeTargetInput = Omit<GradeTarget, "createdAt" | "updatedAt">;

export function gradeMinimum(grade: OverallGrade) {
  return GRADE_MINIMUMS[grade];
}

/** "an A*" and "an E", but "a B". Grades are read aloud, so the article shows. */
export function gradeArticle(grade: OverallGrade) {
  return grade === "A*" || grade === "A" || grade === "E" ? "an" : "a";
}

export function isOverallGrade(value: unknown): value is OverallGrade {
  return typeof value === "string" && (OVERALL_GRADES as readonly string[]).includes(value);
}

/**
 * The IB grades a course 1–7 and its two levels are different courses rather
 * than two halves of one, so none of the arithmetic below means anything
 * there. Everything else that splits in two is a year-one/year-two course
 * whose halves add up, whatever the learner has named them.
 */
export function canTakeGradeTarget(subject: Subject) {
  if (subject.archived || subject.stages.length !== 2) return false;
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

/** Where a finished course lands, given what each half scored. */
export function overallPercent(target: Pick<GradeTarget, "completedPercent" | "completedWeight">, remainingPercent: number) {
  const remainingWeight = 100 - target.completedWeight;
  return (target.completedPercent * target.completedWeight + remainingPercent * remainingWeight) / 100;
}

/** The grade an overall percentage earns. Below E is U, which no one targets. */
export function overallGrade(percent: number): OverallGrade | "U" {
  return OVERALL_GRADES.find((grade) => percent >= GRADE_MINIMUMS[grade]) ?? "U";
}

/**
 * What the remaining stage has to average for a given overall grade.
 *
 * Returned unclamped and unrounded. A number above 100 is a grade that can no
 * longer be reached and one at or below 0 is a grade already secured — both
 * are answers worth showing, and rounding either away would turn "you cannot
 * get there" into "score 100".
 */
export function requiredPercent(
  target: Pick<GradeTarget, "completedPercent" | "completedWeight">,
  grade: OverallGrade,
) {
  const remainingWeight = 100 - target.completedWeight;
  return (GRADE_MINIMUMS[grade] * 100 - target.completedPercent * target.completedWeight) / remainingWeight;
}

export type GradeReach = "secured" | "reachable" | "out-of-reach";

export type GradeRung = {
  grade: OverallGrade;
  minimum: number;
  /** Rounded up: needing 87.2 and scoring 87 misses, so 87.2 shows as 88. */
  required: number;
  raw: number;
  reach: GradeReach;
};

/** Every grade, what it now costs, and whether it is still on the table. */
export function gradeLadder(target: Pick<GradeTarget, "completedPercent" | "completedWeight">): GradeRung[] {
  return OVERALL_GRADES.map((grade) => {
    const raw = requiredPercent(target, grade);
    return {
      grade,
      minimum: GRADE_MINIMUMS[grade],
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

/** The best and worst a finished stage still allows, scoring 100 and 0. */
export function gradeRange(target: Pick<GradeTarget, "completedPercent" | "completedWeight">) {
  return {
    best: overallGrade(overallPercent(target, 100)),
    worst: overallGrade(overallPercent(target, 0)),
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

/** Grade targets by subject id, for a view holding a list of papers. */
export function targetsBySubject(targets: GradeTarget[]) {
  return new Map(targets.map((target) => [target.subjectId, target]));
}
