import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_REVIEW_PACE,
  MIN_CATCH_UP_PER_DAY,
  PACE_PRESETS,
  catchUpPerDay,
  matchingPreset,
  normalisePace,
  repaceOffsets,
  reviewInterval,
} from "../app/topics.ts";

/** `n` points all on the same gap, each already `dueIn` days from today. */
const points = (count, interval, dueIn) =>
  Array.from({ length: count }, (_, index) => ({ id: `p${index}`, interval, dueIn }));

const offsets = (placed) => placed.map((point) => point.dueIn);

test("a learner's own gaps ride over the shipped table", () => {
  const tight = { Learning: 2, Practising: 4, Covered: 6, "Exam Ready": 9 };
  assert.equal(reviewInterval("Practising", "normal"), 7);
  assert.equal(reviewInterval("Practising", "normal", tight), 4);

  // A rating still bends the learner's own gap rather than the default.
  assert.equal(reviewInterval("Practising", "hard", tight), 2);
  assert.equal(reviewInterval("Practising", "easy", tight), 6);

  // Nothing schedules a point nobody has opened, at any pace.
  assert.equal(reviewInterval("Not Started", "normal", tight), 0);
});

test("a gap is rounded, clamped, and never lost to one bad field", () => {
  assert.deepEqual(normalisePace(null), DEFAULT_REVIEW_PACE);
  assert.equal(normalisePace({ Learning: 0 }).Learning, 1, "a zero would schedule a point for ever");
  assert.equal(normalisePace({ Learning: 9999 }).Learning, 180);
  assert.equal(normalisePace({ Learning: 4.6 }).Learning, 5);
  // One unusable field falls back to its default rather than rejecting the lot.
  assert.deepEqual(normalisePace({ Learning: "nonsense", Practising: 5 }), {
    ...DEFAULT_REVIEW_PACE,
    Practising: 5,
  });
});

test("a preset is recognised until a single field is edited", () => {
  const standard = PACE_PRESETS.find((preset) => preset.id === "standard");
  assert.equal(matchingPreset(standard.pace), "standard");
  assert.equal(matchingPreset({ ...standard.pace, Learning: standard.pace.Learning + 1 }), null);
});

test("changing pace never manufactures overdue work", () => {
  // The whole complaint: a tighter pace re-dated a syllabus into the past and
  // the board reported two hundred late reviews nobody could act on.
  const placed = repaceOffsets(points(200, 7, -30));
  assert.ok(offsets(placed).every((dueIn) => dueIn >= 0), "nothing may land before today");
});

test("a catch-up is dealt out at the pace the learner just chose", () => {
  // 200 points on a seven-day gap is ~29 reviews a day once it settles, so the
  // catch-up hands back about that many a day and no more.
  const perDay = catchUpPerDay(Array(200).fill(7));
  assert.equal(perDay, 29);

  const counts = new Map();
  for (const dueIn of offsets(repaceOffsets(points(200, 7, -30)))) {
    counts.set(dueIn, (counts.get(dueIn) ?? 0) + 1);
  }
  assert.ok(Math.max(...counts.values()) <= perDay, "no day may be heavier than an ordinary one");
  assert.equal(counts.get(0), perDay, "today is filled first");
});

test("the backlog clears inside the longest gap it was spread at", () => {
  // Dealing N points at N / longest-gap a day empties inside one gap, so a
  // learner is never handed a queue longer than the pace they asked for.
  for (const [count, interval] of [[200, 7], [600, 14], [40, 3], [1000, 21]]) {
    const worst = Math.max(...offsets(repaceOffsets(points(count, interval, -60))));
    assert.ok(worst <= interval, `${count} points on a ${interval}-day gap ran ${worst} days`);
  }
});

test("a small syllabus catches up in a sitting rather than trickling back", () => {
  // Six points at a seven-day gap is under a review a day; spreading that would
  // hand one point back a day for a week, which reads as broken, not gentle.
  const placed = repaceOffsets(points(6, 7, -10));
  assert.equal(catchUpPerDay(Array(6).fill(7)), MIN_CATCH_UP_PER_DAY);
  assert.deepEqual(offsets(placed), [0, 0, 0, 0, 0, 0]);
});

test("the work furthest past its date comes back first", () => {
  const placed = repaceOffsets([
    { id: "slightly", interval: 7, dueIn: -1 },
    { id: "ancient", interval: 7, dueIn: -40 },
    { id: "middling", interval: 7, dueIn: -10 },
  ]);
  assert.deepEqual(placed.map((point) => point.id), ["ancient", "middling", "slightly"]);
});

test("a point the new pace leaves in the future keeps that date", () => {
  const placed = repaceOffsets([
    { id: "future", interval: 10, dueIn: 6 },
    { id: "today", interval: 10, dueIn: 0 },
    { id: "behind", interval: 10, dueIn: -3 },
  ]);
  const byId = new Map(placed.map((point) => [point.id, point.dueIn]));
  assert.equal(byId.get("future"), 6, "a loosened pace must not drag work forward");
  assert.equal(byId.get("today"), 0);
  assert.equal(byId.get("behind"), 0);
});

test("loosening the pace moves everything out and leaves nothing to catch up", () => {
  // Every point lands in the future, so the catch-up queue is empty and the
  // board simply goes quiet — which is what asking for longer gaps means.
  const placed = repaceOffsets(points(200, 21, 14));
  assert.deepEqual(new Set(offsets(placed)), new Set([14]));
});
