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
  assert.ok(pointMinutes({ status: "Practising" }, halfDone) < pointMinutes({ status: "Not Started" }, halfDone));
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
  assert.equal(pointMinutes({ status: "Not Started" }, null), TYPICAL_POINT_MINUTES);
  // A point nearly ready takes the floor, which is about right to read it back.
  assert.equal(pointMinutes({ status: "Exam Ready" }, null), 5);
});

test("a chapter totals what its own rows show", () => {
  // Summed from the rounded figures, so the heading and the rows agree.
  const chapter = points("Not Started", "Practising", "Exam Ready");
  const expected = chapter.reduce((sum, point) => sum + pointMinutes(point, null), 0);
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

const rated = (...pairs) => pairs.map(([status, difficulty]) => ({ status, difficulty }));

test("a rating moves a point's share of the work without inventing any", () => {
  assert.equal(remainingEffort("Practising", "normal"), remainingEffort("Practising"));
  assert.ok(remainingEffort("Practising", "hard") > remainingEffort("Practising"));
  assert.ok(remainingEffort("Practising", "easy") < remainingEffort("Practising"));
  // An unrated point is a normal one, which is what every point was before
  // ratings existed — so the arithmetic is unchanged for anyone who ignores it.
  assert.equal(remainingEffort("Learning", null), remainingEffort("Learning"));
  assert.equal(remainingEffort("Learning", "brutal"), remainingEffort("Learning"));
});

test("rating one point hard and another easy spends the same hours differently", () => {
  const plan = { daysLeft: 14, weeklyHours: 10, studyDays: 5 };
  const flat = timeBudget(points("Practising", "Practising"), plan);
  const split = timeBudget(rated(["Practising", "hard"], ["Practising", "easy"]), plan);

  // One up, one down, and the pot itself untouched.
  assert.equal(split.availableMinutes, flat.availableMinutes);
  assert.equal(split.remainingWork, flat.remainingWork);
  assert.equal(split.minutesPerPoint, flat.minutesPerPoint);

  const hard = pointMinutes({ status: "Practising", difficulty: "hard" }, split);
  const easy = pointMinutes({ status: "Practising", difficulty: "easy" }, split);
  const flatEach = pointMinutes({ status: "Practising" }, flat);
  assert.ok(hard > flatEach, `hard ${hard} should beat ${flatEach}`);
  assert.ok(easy < flatEach, `easy ${easy} should fall short of ${flatEach}`);
  // These hours divide evenly, so the two rows come to exactly what the two
  // unrated ones did. The test below says what holds when they do not.
  assert.equal(hard + easy, flatEach * 2);
});

test("what is conserved is the budget, not the rounded rows", () => {
  // Minutes are advice rounded to a five minute step, and three figures each
  // rounded on their own can land a step apart from each other. The pot they
  // are shares of is what has to be exact, so that is what is asserted exactly
  // — the rows are allowed the rounding the whole module is built on.
  const plan = { daysLeft: 30, weeklyHours: 10, studyDays: 5 };
  const flat = timeBudget(points("Practising", "Practising"), plan);
  const split = timeBudget(rated(["Practising", "hard"], ["Practising", "easy"]), plan);

  assert.equal(split.availableMinutes, flat.availableMinutes);
  assert.equal(split.remainingWork, flat.remainingWork);

  const rows = pointMinutes({ status: "Practising", difficulty: "hard" }, split)
    + pointMinutes({ status: "Practising", difficulty: "easy" }, split);
  const flatRows = pointMinutes({ status: "Practising" }, flat) * 2;
  assert.ok(Math.abs(rows - flatRows) <= roundMinutes(1), `${rows} vs ${flatRows} is more than one step apart`);
});

test("the struggling topic outranks the easy one however far ahead it is", () => {
  // The complaint this answers: a topic you are drowning in, further along than
  // one you find trivial, was still handed the smaller share.
  const plan = { daysLeft: 30, weeklyHours: 10, studyDays: 5 };
  const budget = timeBudget(rated(["Practising", "hard"], ["Learning", "easy"]), plan);
  const struggling = pointMinutes({ status: "Practising", difficulty: "hard" }, budget);
  const obvious = pointMinutes({ status: "Learning", difficulty: "easy" }, budget);
  assert.ok(struggling > obvious, `${struggling} should beat ${obvious}`);
});
