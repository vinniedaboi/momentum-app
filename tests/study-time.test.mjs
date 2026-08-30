import assert from "node:assert/strict";
import test from "node:test";

import {
  TYPICAL_POINT_MINUTES,
  pointMinutes,
  remainingEffort,
  roundMinutes,
  timeBudget,
  totalMinutes,
  verdictNote,
} from "../app/study-time.ts";

const points = (...statuses) => statuses.map((status) => ({ status }));

test("what a point still needs mirrors what it has already earned", () => {
  // The progress bar and the time budget read the same statuses, so a point
  // worth 0.6 of the bar must have 0.4 of its work left.
  assert.equal(remainingEffort("Not Started"), 1);
  assert.equal(remainingEffort("Learning"), 0.75);
  assert.equal(remainingEffort("Practising"), 0.4);
  assert.ok(Math.abs(remainingEffort("Covered") - 0.15) < 1e-9);
});

test("an exam ready point still earns upkeep", () => {
  // Otherwise a finished syllabus budgets no time and the division below has
  // nothing to divide by.
  assert.ok(remainingEffort("Exam Ready") > 0);
  assert.ok(timeBudget(points("Exam Ready", "Exam Ready"), { daysLeft: 30, weeklyHours: 10, studyDays: 5 }));
});

test("an unknown status is treated as untouched", () => {
  assert.equal(remainingEffort("Something else"), 1);
});

test("the budget is the plan's hours divided by the work left", () => {
  // Ten hours a week for two weeks is 1,200 minutes. Four untouched points is
  // four point-equivalents of work, so 300 minutes each.
  const budget = timeBudget(points("Not Started", "Not Started", "Not Started", "Not Started"),
                            { daysLeft: 14, weeklyHours: 10, studyDays: 5 });
  assert.equal(budget.availableMinutes, 1200);
  assert.equal(budget.remainingWork, 4);
  assert.equal(budget.minutesPerPoint, 300);
});

test("partial credit buys back time for the points that still need it", () => {
  const untouched = timeBudget(points("Not Started", "Not Started"),
                               { daysLeft: 14, weeklyHours: 10, studyDays: 5 });
  const halfDone = timeBudget(points("Not Started", "Practising"),
                              { daysLeft: 14, weeklyHours: 10, studyDays: 5 });
  assert.ok(halfDone.minutesPerPoint > untouched.minutesPerPoint);
  // The point that is under way asks for less than the one that is not.
  assert.ok(pointMinutes("Practising", halfDone) < pointMinutes("Not Started", halfDone));
});

test("a deadline that has passed leaves no time rather than negative time", () => {
  const budget = timeBudget(points("Not Started"), { daysLeft: -6, weeklyHours: 10, studyDays: 5 });
  assert.equal(budget.availableMinutes, 0);
  assert.equal(budget.minutesPerPoint, 0);
  assert.equal(budget.verdict, "tight");
});

test("a plan covering nothing has no budget to report", () => {
  assert.equal(timeBudget([], { daysLeft: 30, weeklyHours: 10, studyDays: 5 }), null);
});

test("minutes are rounded to a five minute step, never below it", () => {
  assert.equal(roundMinutes(23), 25);
  assert.equal(roundMinutes(22), 20);
  assert.equal(roundMinutes(0.4), 5);
  assert.equal(roundMinutes(0), 5);
});

test("a point no plan owns falls back to a typical pass", () => {
  assert.equal(pointMinutes("Not Started", null), TYPICAL_POINT_MINUTES);
  // A point nearly ready takes the floor, which is about right to read it back.
  assert.equal(pointMinutes("Exam Ready", null), 5);
});

test("a chapter totals what its own rows show", () => {
  // Summed from the rounded figures, so the heading and the rows agree.
  const chapter = points("Not Started", "Practising", "Exam Ready");
  const expected = chapter.reduce((sum, point) => sum + pointMinutes(point.status, null), 0);
  assert.equal(totalMinutes(chapter, () => null), expected);
});

test("the verdict names a plan that cannot give each point a fair sitting", () => {
  const crammed = timeBudget(Array.from({ length: 400 }, () => ({ status: "Not Started" })),
                             { daysLeft: 14, weeklyHours: 4, studyDays: 5 });
  assert.equal(crammed.verdict, "tight");
  assert.match(verdictNote(crammed), /add hours or move the date/);

  const spacious = timeBudget(points("Not Started", "Not Started"),
                              { daysLeft: 90, weeklyHours: 12, studyDays: 5 });
  assert.equal(spacious.verdict, "roomy");

  const sensible = timeBudget(Array.from({ length: 60 }, () => ({ status: "Not Started" })),
                              { daysLeft: 60, weeklyHours: 10, studyDays: 5 });
  assert.equal(sensible.verdict, "workable");
});

test("study days left follow the plan's own weekly rhythm", () => {
  const budget = timeBudget(points("Not Started"), { daysLeft: 28, weeklyHours: 10, studyDays: 5 });
  assert.equal(budget.studyDaysLeft, 20);
  assert.equal(budget.minutesPerStudyDay, budget.availableMinutes / 20);
});
