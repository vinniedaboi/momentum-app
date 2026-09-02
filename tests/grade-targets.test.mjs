import assert from "node:assert/strict";
import test from "node:test";

import {
  canTakeGradeTarget,
  gradeLadder,
  gradeRange,
  markPercent,
  overallGrade,
  overallPercent,
  paperTarget,
  requiredPercent,
} from "../app/grade-targets.ts";

/** An AS result, weighted the way every AS/A2 A Level is. */
const banked = (percent, weight = 50) => ({ completedPercent: percent, completedWeight: weight });

const rung = (target, grade) => gradeLadder(target).find((entry) => entry.grade === grade);

const subject = (stages) => ({ id: "x", stages, archived: false });

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
  assert.equal(overallGrade(overallPercent(target, 0)), "E");
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

test("the paper target follows the target grade until a learner overrides it", () => {
  const target = { ...banked(82), targetGrade: "A", paperTargetPercent: null };
  assert.equal(paperTarget(target), 78);
  // Aiming above the boundary is the usual reason to set one by hand.
  assert.equal(paperTarget({ ...target, paperTargetPercent: 85 }), 85);
  // Zero is a choice, not an absence.
  assert.equal(paperTarget({ ...target, paperTargetPercent: 0 }), 0);
});

test("the grade boundaries are the standard ladder, and below E is U", () => {
  assert.equal(overallGrade(90), "A*");
  assert.equal(overallGrade(89.9), "A");
  assert.equal(overallGrade(40), "E");
  assert.equal(overallGrade(39.9), "U");
});

test("a mark becomes a percentage, and an incomplete one becomes nothing", () => {
  assert.equal(markPercent(58, 75), 77.3);
  assert.equal(markPercent(82, 100), 82);
  assert.equal(markPercent(null, 100), null);
  assert.equal(markPercent(50, 0), null);
});

test("only a course sat in two halves can carry a target", () => {
  assert.ok(canTakeGradeTarget(subject(["AS", "A2"])));
  // Named by the learner rather than by a board, but still two years.
  assert.ok(canTakeGradeTarget(subject(["Year 1", "Year 2"])));
  // An IGCSE has one stage, and the IB's levels are two courses rather than
  // two halves of one, so neither adds up the way this screen assumes.
  assert.ok(!canTakeGradeTarget(subject(["A2"])));
  assert.ok(!canTakeGradeTarget(subject(["SL", "HL"])));
  assert.ok(!canTakeGradeTarget({ ...subject(["AS", "A2"]), archived: true }));
});
