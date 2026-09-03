import assert from "node:assert/strict";
import test from "node:test";

import {
  canTakeGradeTarget,
  defaultScale,
  gradeLadder,
  gradeRange,
  gradesFor,
  isBanked,
  markPercent,
  overallGrade,
  overallPercent,
  paperTarget,
  requiredPercent,
  resultGrades,
} from "../app/grade-targets.ts";

/** An AS result, weighted the way every AS/A2 A Level is. */
const banked = (percent, weight = 50) => ({ completedPercent: percent, completedWeight: weight, gradeScale: "a-level" });

/** A mock: a reading of where you are, owning none of the grade. */
const mock = (percent, gradeScale = "igcse") => ({ completedPercent: percent, completedWeight: 0, gradeScale });

const rung = (target, grade) => gradeLadder(target).find((entry) => entry.grade === grade);

const subject = (stages, qualification = "Cambridge International AS & A Level") =>
  ({ id: "x", stages, archived: false, qualification });

test("what A2 needs is what the target grade costs, less what AS already paid", () => {
  // 82 in AS, both halves worth 50: an A wants 80 overall, so A2 wants 78.
  assert.equal(requiredPercent(banked(82), "A"), 78);
  assert.equal(overallPercent(banked(82), 78), 80);
  // And the same result carries an A* only on a near-perfect second year.
  assert.equal(requiredPercent(banked(82), "A*"), 98);
});

test("a grade past a perfect second year is reported as gone, not as 100", () => {
  const target = banked(60);
  assert.equal(rung(target, "A*").reach, "out-of-reach");
  assert.equal(rung(target, "A").reach, "reachable");
  // The unrounded figure survives, so the screen can say how far past 100 it is.
  assert.ok(rung(target, "A*").raw > 100);
  assert.equal(gradeRange(target).best, "A");
});

test("a grade the first half already guarantees is reported as secured", () => {
  const target = banked(95);
  // 95 banked is 47.5 of the overall 100 before A2 is sat at all, which is
  // already past the 40 an E wants.
  assert.equal(rung(target, "E").reach, "secured");
  assert.equal(gradeRange(target).worst, "E");
  assert.equal(overallGrade("a-level", overallPercent(target, 0)), "E");
  // A D is not secured by the same result — it is five per cent away.
  assert.equal(rung(target, "D").reach, "reachable");
  assert.equal(rung(target, "D").required, 5);
});

test("a required percentage rounds up, because the rounded-down mark misses", () => {
  // 82.5 in AS wants 97.5 for an A*. Reported as 98, because 97 lands on
  // 89.75 overall — a quarter of a mark short of the A*.
  const target = banked(82.5);
  assert.equal(requiredPercent(target, "A*"), 97.5);
  assert.equal(rung(target, "A*").required, 98);
  assert.ok(overallPercent(target, 97) < 90);
  assert.ok(overallPercent(target, 98) >= 90);

  // Clamped for display, but the raw figure stays available to say by how far.
  assert.equal(requiredPercent(banked(75), "A*"), 105);
  assert.equal(rung(banked(75), "A*").required, 100);
  assert.equal(rung(banked(75), "A*").raw, 105);
});

test("a first half worth more than half moves every price with it", () => {
  // Two thirds banked at 90 leaves the remaining third needing 60 for an A.
  assert.ok(Math.abs(requiredPercent(banked(90, 60), "A") - 65) < 1e-9);
  assert.ok(Math.abs(overallPercent(banked(90, 60), 65) - 80) < 1e-9);
});

test("a course sat in one go asks for the boundary, and the mock owns none of it", () => {
  // Weight zero collapses the algebra: what a grade needs is what it needs.
  const target = mock(52);
  assert.equal(requiredPercent(target, "C"), 60);
  assert.equal(rung(target, "C").required, 60);
  assert.equal(rung(target, "A").required, 80);
  assert.equal(overallPercent(target, 71), 71, "a mock cannot carry marks into the exam");
  assert.ok(!isBanked(target));
  assert.ok(isBanked(banked(82)));

  // Nothing is secured by a mock, and nothing is out of reach because of one.
  for (const entry of gradeLadder(target)) assert.equal(entry.reach, "reachable");
  assert.equal(gradeRange(target).best, "A*");
  assert.equal(gradeRange(target).worst, "U");
});

test("each qualification is priced on its own ladder", () => {
  assert.deepEqual(gradesFor("a-level"), ["A*", "A", "B", "C", "D", "E"]);
  assert.deepEqual(gradesFor("igcse"), ["A*", "A", "B", "C", "D", "E", "F", "G"]);
  assert.deepEqual(gradesFor("numeric"), ["9", "8", "7", "6", "5", "4", "3", "2", "1"]);

  // An F is a real IGCSE grade and no kind of A Level, so the same 35% reads
  // differently depending on which course it belongs to.
  assert.equal(overallGrade("igcse", 35), "F");
  assert.equal(overallGrade("a-level", 35), "U");
  assert.equal(overallGrade("numeric", 35), "3");
  assert.equal(overallGrade("igcse", 15), "U");
});

test("the ladder a subject opens on follows its qualification", () => {
  assert.equal(defaultScale("Cambridge International AS & A Level"), "a-level");
  assert.equal(defaultScale("AQA A Level"), "a-level");
  // "Cambridge IGCSE" contains "GCSE", so the IGCSE test has to come first.
  assert.equal(defaultScale("Cambridge IGCSE"), "igcse");
  assert.equal(defaultScale("Cambridge O Level"), "igcse");
  assert.equal(defaultScale("International GCSE"), "numeric");
  assert.equal(defaultScale(null), "a-level");
});

test("the top grade of an A Level is not on offer for the half of one", () => {
  // The boards award an A* on the full course, so an AS certificate never
  // carries one — but a mock of the whole thing can come back as an A*.
  assert.ok(!resultGrades("a-level", true).includes("A*"));
  assert.ok(resultGrades("a-level", false).includes("A*"));
  assert.ok(resultGrades("igcse", true).includes("A*"));
  for (const scale of ["a-level", "igcse", "numeric"]) {
    assert.ok(resultGrades(scale, true).includes("U"), "every ladder can be failed");
  }
});

test("the paper target follows the target grade until a learner overrides it", () => {
  const target = { ...banked(82), targetGrade: "A", paperTargetPercent: null };
  assert.equal(paperTarget(target), 78);
  // Aiming above the boundary is the usual reason to set one by hand.
  assert.equal(paperTarget({ ...target, paperTargetPercent: 85 }), 85);
  // Zero is a choice, not an absence.
  assert.equal(paperTarget({ ...target, paperTargetPercent: 0 }), 0);
  // On a one-sitting course the target is simply the boundary.
  assert.equal(paperTarget({ ...mock(52), targetGrade: "C", paperTargetPercent: null }), 60);
});

test("the grade boundaries are the standard ladder, and below the last is U", () => {
  assert.equal(overallGrade("a-level", 90), "A*");
  assert.equal(overallGrade("a-level", 89.9), "A");
  assert.equal(overallGrade("a-level", 40), "E");
  assert.equal(overallGrade("a-level", 39.9), "U");
});

test("a mark becomes a percentage, and an incomplete one becomes nothing", () => {
  assert.equal(markPercent(58, 75), 77.3);
  assert.equal(markPercent(82, 100), 82);
  assert.equal(markPercent(null, 100), null);
  assert.equal(markPercent(50, 0), null);
});

test("any course with a syllabus can carry a target, except the IB's", () => {
  assert.ok(canTakeGradeTarget(subject(["AS", "A2"])));
  // Named by the learner rather than by a board, but still two years.
  assert.ok(canTakeGradeTarget(subject(["Year 1", "Year 2"])));
  // The point of this change: a one-sitting course prices itself against a mock.
  assert.ok(canTakeGradeTarget(subject(["A2"], "Cambridge IGCSE")));

  // The IB grades 1 to 7 and its levels are two courses rather than two halves
  // of one, so none of the arithmetic above means anything there.
  assert.ok(!canTakeGradeTarget(subject(["SL", "HL"], "IB Diploma Programme")));
  assert.ok(!canTakeGradeTarget(subject(["SL"], "IB Diploma Programme")));
  // A subject with no syllabus split at all, and an archived one.
  assert.ok(!canTakeGradeTarget(subject([])));
  assert.ok(!canTakeGradeTarget({ ...subject(["AS", "A2"]), archived: true }));
});
