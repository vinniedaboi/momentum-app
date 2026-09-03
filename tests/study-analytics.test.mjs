import assert from "node:assert/strict";
import test from "node:test";

import {
  addDays,
  buckets,
  dailyTotals,
  daysBetween,
  streaks,
  studyAnalytics,
} from "../app/study-analytics.ts";

const TODAY = "2026-09-03";

const session = (studyDate, minutes, subjectId = "physics", topics = 0) => ({
  studyDate, minutes, subjectId,
  topics: Array.from({ length: topics }, (_, index) => ({ id: `t${index}` })),
});

/** A day's offset from today, so the fixtures read as "three days ago". */
const ago = (days) => addDays(TODAY, -days);

test("a window counts every day in it, not just the ones worked", () => {
  const analytics = studyAnalytics([session(ago(0), 60), session(ago(2), 90)], TODAY, 7);
  assert.equal(analytics.span, 7);
  assert.equal(analytics.minutes, 150);
  assert.equal(analytics.activeDays, 2);
  // The distinction the old screen could not draw: 21 minutes a day on
  // average, but 75 on the days actually studied.
  assert.equal(analytics.perDay, 21);
  assert.equal(analytics.perActiveDay, 75);
  assert.equal(analytics.consistency, 29);
});

test("all time starts at the first session, not at the beginning of time", () => {
  const analytics = studyAnalytics([session(ago(9), 60), session(ago(0), 60)], TODAY, null);
  assert.equal(analytics.from, ago(9));
  assert.equal(analytics.span, 10);
  // A fortnight-old account is not told it has studied on 2% of its days.
  assert.equal(analytics.consistency, 20);
});

test("a streak survives a day that has not finished yet", () => {
  const totals = dailyTotals([session(ago(1), 60), session(ago(2), 60), session(ago(3), 60)]);
  // Nothing logged today, but today is not over — the run stands at three.
  assert.deepEqual(streaks(totals, TODAY), { current: 3, longest: 3 });
  // Logging today extends it rather than starting a new one.
  const withToday = dailyTotals([session(ago(0), 30), session(ago(1), 60), session(ago(2), 60), session(ago(3), 60)]);
  assert.equal(streaks(withToday, TODAY).current, 4);
});

test("a streak broken two days ago is over, but the record stands", () => {
  const totals = dailyTotals([
    session(ago(9), 60), session(ago(8), 60), session(ago(7), 60), session(ago(6), 60),
    session(ago(2), 60),
  ]);
  const found = streaks(totals, TODAY);
  assert.equal(found.current, 0, "the last day logged is too long ago to still be running");
  assert.equal(found.longest, 4);
});

test("a fortnight or less reads as days, anything longer as weeks", () => {
  const totals = dailyTotals([session(ago(0), 60), session(ago(8), 30)]);
  const daily = buckets(totals, ago(6), TODAY);
  assert.equal(daily.length, 7);
  assert.equal(daily[6].minutes, 60);
  assert.equal(daily[0].start, ago(6));

  const weekly = buckets(totals, ago(29), TODAY);
  assert.ok(weekly.length >= 4 && weekly.length <= 5, `expected whole weeks, got ${weekly.length}`);
  // The rightmost bar is always the week in progress.
  assert.equal(weekly[weekly.length - 1].end, TODAY);
  assert.equal(weekly[weekly.length - 1].minutes, 60);
  // Every minute lands in exactly one bar.
  assert.equal(weekly.reduce((sum, bucket) => sum + bucket.minutes, 0), 90);
});

test("the comparison window is the one immediately before, not a calendar month", () => {
  const sessions = [session(ago(1), 120), session(ago(8), 60)];
  const analytics = studyAnalytics(sessions, TODAY, 7);
  assert.equal(analytics.minutes, 120);
  assert.equal(analytics.previousMinutes, 60);
  assert.equal(analytics.change, 100);
});

test("there is no comparison before the first session", () => {
  const analytics = studyAnalytics([session(ago(1), 120)], TODAY, 7);
  assert.equal(analytics.previousMinutes, null);
  assert.equal(analytics.change, null, "a first week is not down 100% on nothing");
});

test("the subject split adds up to the window's own total", () => {
  const analytics = studyAnalytics([
    session(ago(0), 60, "physics"), session(ago(1), 30, "physics"),
    session(ago(2), 100, "maths"), session(ago(3), 20, null),
  ], TODAY, 7);
  assert.equal(analytics.bySubject[0].subjectId, "maths", "the biggest share leads");
  assert.equal(analytics.bySubject[0].minutes, 100);
  assert.equal(analytics.bySubject.reduce((sum, entry) => sum + entry.minutes, 0), analytics.minutes);
  assert.ok(Math.abs(analytics.bySubject.reduce((sum, entry) => sum + entry.share, 0) - 100) < 0.2);
  // General study is a subject-less session, not a missing one.
  assert.ok(analytics.bySubject.some((entry) => entry.subjectId === null));
});

test("the weekday rhythm averages each weekday over its own occurrences", () => {
  // Two Thursdays in a fortnight, one of them worked for two hours.
  const analytics = studyAnalytics([session(ago(0), 120)], TODAY, 14);
  const thursday = new Date(`${TODAY}T00:00:00Z`).getUTCDay();
  assert.equal(analytics.byWeekday[thursday], 60, "120 minutes across two of that weekday");
  assert.equal(analytics.byWeekday.filter((minutes) => minutes > 0).length, 1);
});

test("the best day and the longest single session are different questions", () => {
  const analytics = studyAnalytics([
    session(ago(1), 50), session(ago(1), 55), session(ago(2), 90),
  ], TODAY, 7);
  assert.deepEqual(analytics.best, { date: ago(1), minutes: 105 }, "two sessions make the bigger day");
  assert.equal(analytics.longestSession, 90, "but the longest single sitting is elsewhere");
});

test("reviews driven by logging are counted", () => {
  const analytics = studyAnalytics([session(ago(0), 60, "physics", 4), session(ago(1), 30, "physics", 2)], TODAY, 7);
  assert.equal(analytics.reviewed, 6);
});

test("nothing logged reports nothing rather than dividing by zero", () => {
  const analytics = studyAnalytics([], TODAY, 30);
  assert.equal(analytics.minutes, 0);
  assert.equal(analytics.perActiveDay, 0);
  assert.equal(analytics.consistency, 0);
  assert.equal(analytics.best, null);
  assert.deepEqual(analytics.streak, { current: 0, longest: 0 });
  assert.equal(analytics.bySubject.length, 0);
  assert.equal(daysBetween(analytics.from, analytics.to), 30);
});
