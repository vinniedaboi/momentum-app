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

/**
 * A learner's own boundaries: each grade against the overall percentage it
 * starts at. Partial is allowed — a grade the map does not name keeps the
 * standard band, so a learner who only knows what an A took can say just that.
 */
export type GradeThresholds = Record<string, number>;

/** The narrowest and widest a boundary can sensibly be. */
export const MIN_THRESHOLD = 1;
export const MAX_THRESHOLD = 100;

/** The standard bands as a map, which is what the form opens on. */
export function defaultThresholds(scale: GradeScale): GradeThresholds {
  return Object.fromEntries(GRADE_SCALES[scale].grades.map(([grade, minimum]) => [grade, minimum]));
}

/**
 * The bands this course is actually graded on: the learner's own where they
 * have set them, and the standard uniform-mark bands everywhere else.
 *
 * Always in the scale's own order, best first, because every reading below
 * walks it top-down and takes the first grade the percentage clears.
 */
export function gradeBands(scale: GradeScale, thresholds?: GradeThresholds | null) {
  return GRADE_SCALES[scale].grades.map(([grade, minimum]) => {
    const own = thresholds?.[grade];
    return [grade, typeof own === "number" && Number.isFinite(own) ? own : minimum] as const;
  });
}

/**
 * Whether a set of boundaries actually says anything the standard bands do not.
 * A map that agrees with the scale at every grade is not worth reporting as the
 * learner's own, and the screens say "standard" rather than "yours" for it.
 */
export function thresholdsDiffer(scale: GradeScale, thresholds?: GradeThresholds | null) {
  if (!thresholds) return false;
  return GRADE_SCALES[scale].grades.some(([grade, minimum]) => {
    const own = thresholds[grade];
    return typeof own === "number" && Number.isFinite(own) && own !== minimum;
  });
}

/**
 * Boundaries the ladder can be trusted to read.
 *
 * Every grade of the scale, rounded to a tenth and held inside the range, and
 * each one strictly below the grade above it — an A that took less than a B is
 * not a boundary set, it is a typo, and reading it would rank the grades wrong.
 * Returns null when the input names nothing usable, which is the same as saying
 * "use the standard bands".
 */
export function normaliseThresholds(
  scale: GradeScale,
  input: Partial<Record<string, unknown>> | null | undefined,
): GradeThresholds | null {
  if (!input || typeof input !== "object") return null;
  const cleaned: GradeThresholds = {};
  let previous = Infinity;
  for (const [grade, standard] of GRADE_SCALES[scale].grades) {
    const raw = Number(input[grade]);
    const value = Number.isFinite(raw) ? Math.round(raw * 10) / 10 : standard;
    if (value < MIN_THRESHOLD || value > MAX_THRESHOLD || value >= previous) return null;
    cleaned[grade] = value;
    previous = value;
  }
  return cleaned;
}

/**
 * A whole ladder from the three boundaries a board actually publishes.
 *
 * Cambridge and Edexcel publish A, B and C per paper and nothing else, so the
 * grades above and below are stepped by the average gap between the three that
 * are known — which is roughly how the boards space them, and is the only
 * honest thing to do with a grade nobody published. The screen offering this
 * says which three are real and which are inferred.
 *
 * Null for a scale with no A, B and C to anchor on: the 9-to-1 ladder is a
 * different set of names, and guessing a mapping onto it would be inventing the
 * conversion rather than reading one.
 */
export function thresholdsFromPublished(
  scale: GradeScale,
  published: { a: number; b: number; c: number },
): GradeThresholds | null {
  const grades = gradesFor(scale);
  const aIndex = grades.indexOf("A");
  const cIndex = grades.indexOf("C");
  if (aIndex === -1 || cIndex === -1 || !grades.includes("B")) return null;
  if (!(published.a > published.b && published.b > published.c)) return null;

  const step = Math.round(((published.a - published.c) / 2) * 10) / 10;
  const anchored: Record<string, number> = { A: published.a, B: published.b, C: published.c };

  const filled: GradeThresholds = {};
  let previous: number | null = null;
  for (let index = 0; index < grades.length; index += 1) {
    const grade = grades[index];
    const known = anchored[grade];
    const raw = known != null
      ? known
      : index < aIndex
        ? published.a + step * (aIndex - index)
        : published.c - step * (index - cIndex);
    let value = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, Math.round(raw * 10) / 10));
    // Clamping at either end can flatten two grades onto the same figure, and a
    // ladder that does not descend is one the arithmetic cannot read.
    if (previous != null && value >= previous) value = Math.round((previous - 0.1) * 10) / 10;
    if (value < MIN_THRESHOLD) return null;
    filled[grade] = value;
    previous = value;
  }
  return filled;
}

/** The percentage a grade starts at, on this course's own boundaries. */
export function gradeMinimum(scale: GradeScale, grade: string, thresholds?: GradeThresholds | null) {
  return gradeBands(scale, thresholds).find(([name]) => name === grade)?.[1] ?? 0;
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
  /**
   * Which award the papers are weighted against: "AS", "A Level", or
   * "qualification" for a course sat in one go. Matches the award column of
   * `syllabus_assessment`, because that is the table the weightings come from.
   */
  award: string;
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
  /**
   * The boundaries this course is graded on, where the learner has supplied
   * them — their board's published thresholds for the session, or their
   * school's own. Null is the standard uniform-mark bands for the scale.
   */
  thresholds: GradeThresholds | null;
  /**
   * The papers of the award, where the learner has chosen a route. Empty for a
   * target typed in by hand, which is every subject whose syllabus the parser
   * cannot read — those keep working exactly as they did.
   */
  components: TargetComponent[];
  createdAt: string;
  updatedAt: string;
};

export type GradeTargetInput = Omit<GradeTarget, "createdAt" | "updatedAt">;

/**
 * One paper of the course, and what the learner has done about it.
 *
 * A student does not sit an AS; they sit Paper 1, Paper 2 and Paper 3, each
 * worth its own share of the award and each handed back at a different time.
 * The weighting is the board's, read out of the syllabus PDF into
 * `syllabus_assessment` — see scripts/parse_assessment.py — and copied onto
 * the row so a syllabus revision cannot restate what a result already sat was
 * worth.
 */
export type TargetComponent = {
  component: string;
  title: string | null;
  weighting: number;
  mark: number | null;
  /** Null means the mark was typed as a percentage, which is how a slip reads. */
  maxMark: number | null;
  status: ComponentStatus;
  position: number;
};

/**
 * `sat` is a real result: its weighting leaves the pot and its marks go in.
 * `mock` is a paper sat under exam conditions that counts for nothing — it
 * forecasts what that component will do without banking any of it. `todo` is
 * a paper still ahead, about which nothing is known.
 */
export const COMPONENT_STATUSES = ["sat", "mock", "todo"] as const;
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];

export function isComponentStatus(value: unknown): value is ComponentStatus {
  return typeof value === "string" && (COMPONENT_STATUSES as readonly string[]).includes(value);
}

/** What a component came to, as a percentage of itself. */
export function componentPercent(component: Pick<TargetComponent, "mark" | "maxMark">) {
  if (component.mark == null) return null;
  const max = component.maxMark ?? 100;
  if (max <= 0) return null;
  return Math.round((component.mark / max) * 1000) / 10;
}

/**
 * The banked half of the question, counted rather than typed.
 *
 * Returns the pair the ladder already reads: the share of the award that is
 * settled, and what was averaged across it. They multiply back to the marks
 * actually earned, which is the only thing the arithmetic downstream needs —
 * so a target built from papers and one typed in by hand are the same kind of
 * thing to everything that reads them.
 */
export function bankedFromComponents(components: TargetComponent[]) {
  let weight = 0;
  let earned = 0;
  for (const component of components) {
    if (component.status !== "sat") continue;
    const percent = componentPercent(component);
    if (percent == null) continue;
    weight += component.weighting;
    earned += (percent / 100) * component.weighting;
  }
  return {
    completedWeight: Math.round(weight * 10) / 10,
    completedPercent: weight > 0 ? Math.round((earned / weight) * 1000) / 10 : 0,
  };
}

/**
 * Where the mocks say the course is heading.
 *
 * Sat papers and mocked ones together, averaged over the weight they cover —
 * so a mock of the one paper left says as much as it can, and a course with
 * nothing sat and nothing mocked says nothing at all rather than zero.
 */
export function forecastFromComponents(components: TargetComponent[]) {
  let weight = 0;
  let earned = 0;
  for (const component of components) {
    if (component.status === "todo") continue;
    const percent = componentPercent(component);
    if (percent == null) continue;
    weight += component.weighting;
    earned += (percent / 100) * component.weighting;
  }
  return weight > 0 ? Math.round((earned / weight) * 1000) / 10 : null;
}

/**
 * What the papers still to come come to on their own.
 *
 * The other half of `bankedFromComponents`, and the answer to the question a
 * student actually asks once the marks are in: not "where does the whole
 * A Level land" but "what did I get in A2". A2 is not separately certificated,
 * so this is the same arithmetic read over a different set of papers — the
 * ones that are not banked — and against the same ladder.
 *
 * `known` is how much of that share has a mark against it, which is what the
 * average is taken over: three of four papers filled in is a real figure for
 * three papers, not a fictional one for four. Null when none of them has a
 * mark, because a stage nobody has sat yet has no grade.
 */
export function remainingFromComponents(components: TargetComponent[]) {
  let weight = 0;
  let known = 0;
  let earned = 0;
  for (const component of components) {
    if (component.status === "sat") continue;
    weight += component.weighting;
    const percent = componentPercent(component);
    if (percent == null) continue;
    known += component.weighting;
    earned += (percent / 100) * component.weighting;
  }
  if (known <= 0) return null;
  return {
    weight: Math.round(weight * 10) / 10,
    known: Math.round(known * 10) / 10,
    percent: Math.round((earned / known) * 1000) / 10,
  };
}

/**
 * A course that is over.
 *
 * Once every paper of the award carries a mark there is nothing left to
 * target: the arithmetic stops being "what do I still need" and becomes "this
 * is what it came to". The planner has to notice, because the question it was
 * built to answer divides by the weight still outstanding — and at the end of
 * a course that weight is zero.
 *
 * `settled` separates the two ways of getting here. Every paper sat is a
 * result. Every paper marked but some of them mocks is a forecast of the same
 * shape, and worth showing, as long as it is not called a grade.
 *
 * Null while any paper is still blank, or while the chosen papers do not add
 * up to a whole award — a half-picked route has no total to report.
 */
export function courseOutcome(target: Weighed & { components: TargetComponent[] }) {
  const components = target.components;
  if (!components.length) return null;
  if (coveredWeight(components) < 99.95) return null;

  let weight = 0;
  let earned = 0;
  let settled = true;
  for (const component of components) {
    const percent = componentPercent(component);
    if (component.status === "todo" || percent == null) return null;
    if (component.status !== "sat") settled = false;
    weight += component.weighting;
    earned += (percent / 100) * component.weighting;
  }
  if (weight <= 0) return null;

  const percent = Math.round((earned / weight) * 1000) / 10;
  return { percent, grade: overallGrade(target.gradeScale, percent, target.thresholds), settled };
}

/** How much of the award the chosen papers add up to. 100 means a full route. */
export function coveredWeight(components: TargetComponent[]) {
  return Math.round(components.reduce((sum, component) => sum + component.weighting, 0) * 10) / 10;
}

/**
 * What one paper still to come has to score for the target, given everything
 * else that is settled or forecast. The honest reading of "what do I need in
 * Paper 4" when Paper 1 is already banked.
 */
export function componentRequirement(
  target: Weighed,
  components: TargetComponent[],
  component: TargetComponent,
  grade: string,
) {
  const others = components.filter((entry) => entry !== component);
  const settled = bankedFromComponents(others);
  const share = component.weighting;
  if (share <= 0) return null;
  const needed = gradeMinimum(target.gradeScale, grade, target.thresholds) * 100
    - settled.completedPercent * settled.completedWeight;
  const rest = 100 - settled.completedWeight - share;
  // Anything else still to come is assumed to match this paper, which is the
  // only assumption that does not quietly favour one paper over another.
  return rest + share > 0 ? needed / (rest + share) : null;
}

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

/**
 * Optional rather than required, so a caller weighing a draft that has not
 * chosen boundaries yet still type-checks; absent means the standard bands.
 */
type Weighed = Pick<GradeTarget, "completedPercent" | "completedWeight" | "gradeScale">
  & { thresholds?: GradeThresholds | null };

/** Where a finished course lands, given what each part scored. */
export function overallPercent(target: Weighed, remainingPercent: number) {
  const remainingWeight = 100 - target.completedWeight;
  return (target.completedPercent * target.completedWeight + remainingPercent * remainingWeight) / 100;
}

/** The grade an overall percentage earns. Below the lowest band is U. */
export function overallGrade(
  scale: GradeScale,
  percent: number,
  thresholds?: GradeThresholds | null,
): string {
  return gradeBands(scale, thresholds).find(([, minimum]) => percent >= minimum)?.[0] ?? "U";
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
  const outstanding = gradeMinimum(target.gradeScale, grade, target.thresholds) * 100
    - target.completedPercent * target.completedWeight;
  // Nothing left to sit. The grade is either already earned or already missed,
  // and there is no percentage that would change it — which the infinities say
  // correctly, but 0/0 would not.
  if (remainingWeight <= 0) return outstanding > 0 ? Infinity : -Infinity;
  return outstanding / remainingWeight;
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
      minimum: gradeMinimum(target.gradeScale, grade, target.thresholds),
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
    best: overallGrade(target.gradeScale, overallPercent(target, 100), target.thresholds),
    worst: overallGrade(target.gradeScale, overallPercent(target, 0), target.thresholds),
  };
}

/**
 * The percentage past papers are measured against: the learner's own number
 * where they set one, and otherwise whatever the target grade needs.
 *
 * Null once nothing is left to sit. A past-paper target is practice for an
 * exam that is still coming; on a finished course the ladder has no
 * outstanding weight to price against, and the clamped answer it gives — zero
 * for a grade already reached — would mark every paper ever logged as being
 * on target.
 */
export function paperTarget(target: GradeTarget): number | null {
  if (target.completedWeight >= 99.95) return null;
  if (target.paperTargetPercent != null) return target.paperTargetPercent;
  const rung = gradeLadder(target).find((entry) => entry.grade === target.targetGrade);
  return rung ? rung.required : 0;
}

/**
 * Whether one grade is better than another on its own ladder. Off the ladder —
 * a U — is worse than everything on it.
 */
export function gradeBeats(scale: GradeScale, grade: string, other: string) {
  const grades = gradesFor(scale);
  const rank = (name: string) => {
    const index = grades.indexOf(name);
    return index === -1 ? grades.length : index;
  };
  return rank(grade) < rank(other);
}

/** "an A*" and "an E", but "a B". Grades are read aloud, so the article shows. */
export function gradeArticle(grade: string) {
  return /^[AEF8]/.test(grade) ? "an" : "a";
}

/** Grade targets by subject id, for a view holding a list of papers. */
export function targetsBySubject(targets: GradeTarget[]) {
  return new Map(targets.map((target) => [target.subjectId, target]));
}
