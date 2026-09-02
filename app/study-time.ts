/**
 * How long to spend on one syllabus point, worked out from the learner's own
 * plan rather than from a guess.
 *
 * A syllabus goal and an exam plan both say the same three things: how many
 * hours a week, how many days of the week, and how long until the deadline.
 * That is a budget. Divide it by the work actually left — a point half learnt
 * needs less than an untouched one — and every point has a number of minutes
 * against it. The review board, the goal timeline and the exam planner all show
 * that same number, aggregated at their own level, so a learner is never told
 * two different things about the same hour.
 */

import { progressWeight } from "./syllabus-progress";
import type { TopicDifficulty } from "./topics";

/**
 * Upkeep a point still wants once it is exam ready, as a share of a first pass.
 *
 * Without it the weighting would run to zero, a finished syllabus would budget
 * no time at all, and the division below would have nothing to divide by.
 */
const UPKEEP = 0.05;

/** Minutes are advice, so they are rounded to a step rather than to the minute. */
const STEP = 5;

/**
 * A first pass at one point where no plan sets the budget — a spaced-repetition
 * review that no goal or exam owns. Sits at the low end of what a point takes,
 * because a review is not a first sitting.
 */
export const TYPICAL_POINT_MINUTES = 25;

/**
 * The band a full first pass at one point should fall in.
 *
 * Calibrated against an ordinary course rather than against a round number: an
 * A level of roughly 200 points, studied five hours a week over a school year,
 * comes out near an hour a point, and that has to read as normal. Below a
 * quarter of an hour there is no room to practise anything; past an hour and a
 * half the deadline is further out than the work needs.
 */
const TIGHT_MINUTES = 15;
const ROOMY_MINUTES = 90;

/**
 * What a learner's own reading of a point does to its share of the budget.
 *
 * These are shares of a fixed pot, not extra hours. Minutes per point is the
 * plan's time divided by the work left, so raising one point's weight lowers
 * every other point's: marking a chapter hard moves minutes onto it from the
 * ones you find easy, and the week does not get any longer. That is the whole
 * trick — a plan that gives a topic you are drowning in the same half hour as
 * one that was obvious on the first reading is not wrong about the total, it is
 * wrong about where the total goes.
 */
export const DIFFICULTY_EFFORT: Record<TopicDifficulty, number> = {
  easy: 0.5,
  normal: 1,
  hard: 1.5,
};

/** Unrated, unknown and absent all read as normal, which changes nothing. */
function difficultyEffort(difficulty: string | null | undefined) {
  return DIFFICULTY_EFFORT[difficulty as TopicDifficulty] ?? 1;
}

/** A point as the budget needs to see it: how far through, and how it lands. */
export type StudyPoint = { status: string; difficulty?: string | null };

/**
 * What one point still needs, relative to a first pass through an ordinary one.
 *
 * The status half is the mirror of the progress weighting, so the two cannot
 * drift: a point worth 0.6 of the progress bar has 0.4 of its work left. The
 * difficulty half then says whose 0.4 it is.
 */
export function remainingEffort(status: string, difficulty?: string | null) {
  return Math.max(UPKEEP, 1 - progressWeight(status)) * difficultyEffort(difficulty);
}

export function roundMinutes(minutes: number) {
  return Math.max(STEP, Math.round(minutes / STEP) * STEP);
}

export type StudyPlan = {
  /** Days from today to the finish date. Zero once the deadline has passed. */
  daysLeft: number;
  weeklyHours: number;
  studyDays: number;
};

export type TimeBudget = {
  /** Minutes a full first pass at one point earns. */
  minutesPerPoint: number;
  /** Point-equivalents of work left, counting partial credit. */
  remainingWork: number;
  /** Minutes the plan holds between today and its deadline. */
  availableMinutes: number;
  /** Study days between today and the deadline, at this plan's weekly rhythm. */
  studyDaysLeft: number;
  minutesPerStudyDay: number;
  /** Whether the plan leaves a sensible amount of time on each point. */
  verdict: "tight" | "workable" | "roomy";
};

/**
 * The budget a plan implies, or null when it covers nothing.
 *
 * A deadline that has already passed yields a budget of zero rather than a
 * negative one: the honest answer is that there is no time left, and the views
 * say so instead of printing a number.
 */
export function timeBudget(points: StudyPoint[], plan: StudyPlan): TimeBudget | null {
  if (!points.length) return null;

  const remainingWork = points.reduce((sum, point) => sum + remainingEffort(point.status, point.difficulty), 0);
  const daysLeft = Math.max(0, plan.daysLeft);
  const availableMinutes = plan.weeklyHours * 60 * daysLeft / 7;
  const minutesPerPoint = availableMinutes / remainingWork;
  const studyDaysLeft = Math.max(1, Math.round(daysLeft * plan.studyDays / 7));

  return {
    minutesPerPoint,
    remainingWork,
    availableMinutes,
    studyDaysLeft,
    minutesPerStudyDay: availableMinutes / studyDaysLeft,
    verdict: minutesPerPoint < TIGHT_MINUTES ? "tight" : minutesPerPoint > ROOMY_MINUTES ? "roomy" : "workable",
  };
}

/**
 * Minutes for one point: its share of the plan that owns it, or a typical pass
 * where none does. Points already close to ready take the five-minute floor,
 * which is about right for reading one back.
 */
export function pointMinutes(point: StudyPoint, budget: TimeBudget | null) {
  const base = budget ? budget.minutesPerPoint : TYPICAL_POINT_MINUTES;
  return roundMinutes(base * remainingEffort(point.status, point.difficulty));
}

/**
 * What a list of points adds up to. Summed from the rounded per-point figures
 * rather than from the raw ones, so a chapter's total is what its rows show.
 */
export function totalMinutes(points: StudyPoint[], budgetFor: (index: number) => TimeBudget | null) {
  return points.reduce((sum, point, index) => sum + pointMinutes(point, budgetFor(index)), 0);
}

/** The one-line reading a planner puts under the number. */
export function verdictNote(budget: TimeBudget) {
  if (budget.verdict === "tight") {
    return "Tight — add hours or move the date to give each point a fair sitting.";
  }
  if (budget.verdict === "roomy") {
    return "Room to spare — you could bring the date forward or go deeper.";
  }
  return "A workable amount of time on each point.";
}
