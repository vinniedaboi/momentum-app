import assert from "node:assert/strict";
import test from "node:test";

import {
  bankedFromComponents,
  componentPercent,
  componentRequirement,
  coveredWeight,
  forecastFromComponents,
  gradeLadder,
  requiredPercent,
} from "../app/grade-targets.ts";

/** A paper of a course, as the syllabus weights it. */
const paper = (component, weighting, over) => ({
  component, title: null, weighting, mark: null, maxMark: null,
  status: "todo", position: 0, ...over,
});

/**
 * Cambridge Physics 9702, as its own syllabus states it: the three AS papers
 * carry half the A Level between them, and the two A2 papers the other half.
 */
const physics = [
  paper("Paper 1", 15.5),
  paper("Paper 2", 23),
  paper("Paper 3", 11.5),
  paper("Paper 4", 38.5),
  paper("Paper 5", 11.5),
];

/** Cambridge Chemistry 0620, extended route with the written practical. */
const igcse = [paper("Paper 2", 30), paper("Paper 4", 50), paper("Paper 6", 20)];

const sat = (component, mark, max) => ({ ...component, status: "sat", mark, maxMark: max });
const mock = (component, mark, max) => ({ ...component, status: "mock", mark, maxMark: max });

test("a paper's share is counted, not assumed to be half of anything", () => {
  // The three AS papers of 9702 come to 50% of the A Level between them, which
  // is where the old flat "AS is worth 50" came from — but the papers are
  // 15.5, 23 and 11.5, and a student who has sat only two of them has banked
  // 38.5%, not 50.
  const partway = [sat(physics[0], 34, 40), sat(physics[1], 45, 60), physics[2], physics[3], physics[4]];
  const banked = bankedFromComponents(partway);
  assert.equal(banked.completedWeight, 38.5);
  // 85% of 15.5 plus 75% of 23 is 30.425 marks of the A Level, averaged across
  // the 38.5 it covers.
  assert.ok(Math.abs(banked.completedPercent - 79) < 0.1);
  assert.ok(Math.abs(banked.completedPercent * banked.completedWeight / 100 - 30.425) < 0.05);
});

test("a full AS sitting comes to exactly the half the old model assumed", () => {
  const asSat = [sat(physics[0], 40, 40), sat(physics[1], 60, 60), sat(physics[2], 40, 40),
    physics[3], physics[4]];
  const banked = bankedFromComponents(asSat);
  assert.equal(banked.completedWeight, 50);
  assert.equal(banked.completedPercent, 100);
  // And the A Level's remaining half then has to carry the rest on its own.
  assert.equal(requiredPercent({ ...banked, gradeScale: "a-level" }, "A*"), 80);
});

test("nothing sat banks nothing, whatever the mocks say", () => {
  const mocked = igcse.map((component) => mock(component, 30, 40));
  assert.equal(bankedFromComponents(mocked).completedWeight, 0);
  assert.equal(bankedFromComponents(mocked).completedPercent, 0);
  // A mock still forecasts: 75% across every paper is a 75% course.
  assert.equal(forecastFromComponents(mocked), 75);
});

test("a forecast covers the papers it knows about, and says nothing otherwise", () => {
  // Practical banked at 90%, theory mocked at 60%, multiple choice untouched.
  const mixed = [igcse[0], mock(igcse[1], 48, 80), sat(igcse[2], 36, 40)];
  // 60% of 50 plus 90% of 20 is 48 marks across the 70 they cover.
  assert.ok(Math.abs(forecastFromComponents(mixed) - 68.6) < 0.1);
  assert.equal(forecastFromComponents(igcse), null, "nothing known forecasts nothing");
});

test("a percentage typed straight in needs no total behind it", () => {
  assert.equal(componentPercent({ mark: 82, maxMark: null }), 82);
  assert.equal(componentPercent({ mark: 58, maxMark: 75 }), 77.3);
  assert.equal(componentPercent({ mark: null, maxMark: 75 }), null);
  assert.equal(componentPercent({ mark: 10, maxMark: 0 }), null);
});

test("the papers of one route come to the whole award", () => {
  assert.equal(coveredWeight(physics), 100);
  assert.equal(coveredWeight(igcse), 100);
  // A route half chosen says so, which is what lets the screen warn about it.
  assert.equal(coveredWeight(igcse.slice(0, 2)), 80);
});

test("one paper still to come is priced against everything already settled", () => {
  // AS banked at 79% across 38.5, so an A wants the rest to carry the balance.
  const partway = [sat(physics[0], 34, 40), sat(physics[1], 45, 60), physics[2], physics[3], physics[4]];
  const target = { ...bankedFromComponents(partway), gradeScale: "a-level" };
  const overall = requiredPercent(target, "A");
  const paper4 = componentRequirement(target, partway, partway[3], "A");
  // With nothing else known, what Paper 4 needs is what everything left needs.
  assert.ok(Math.abs(paper4 - overall) < 0.1);

  // The ladder and the component agree, which is the property that matters:
  // scoring that much across what is left lands exactly on the boundary.
  const rung = gradeLadder(target).find((entry) => entry.grade === "A");
  assert.ok(Math.abs(rung.raw - overall) < 1e-9);
});
