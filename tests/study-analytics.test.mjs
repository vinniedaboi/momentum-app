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

/** A syllabus point and a whole chapter, as a session records each. */
const point = (id, code = id, parentId = "c1") =>
  ({ id, code, title: `Point ${code}`, kind: "point", parentId });
const chapter = (id, code = id) =>
  ({ id, code, title: `Chapter ${code}`, kind: "chapter", parentId: null });

/** `topics` is a count where the test only needs some, or the topics themselves. */
const session = (studyDate, minutes, subjectId = "physics", topics = 0) => ({
  studyDate, minutes, subjectId,
  topics: Array.isArray(topics)
    ? topics
    : Array.from({ length: topics }, (_, index) => point(`t${index}`, `1.${index + 1}`)),
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

test("a session's minutes are split evenly between the topics it named", () => {
  const analytics = studyAnalytics([
    session(ago(0), 60, "physics", [point("a", "1.1"), point("b", "1.2"), point("c", "1.3")]),
    session(ago(1), 30, "physics", [point("a", "1.1")]),
  ], TODAY, 7);

  const byId = new Map(analytics.byTopic.map((entry) => [entry.id, entry]));
  // A third of the hour, plus the half hour that was only ever about this one.
  // The session says nothing about how its time divided, and an even split is
  // the only division that does not quietly favour one topic over another.
  assert.equal(byId.get("a").minutes, 50);
  assert.equal(byId.get("b").minutes, 20);
  assert.equal(byId.get("a").sessions, 2);
  // Biggest first, because the panel answers "where did it actually go".
  assert.equal(analytics.byTopic[0].id, "a");
  // Shares are of the whole window, so they can be read against the subject
  // split without the two disagreeing about the same hour.
  assert.equal(byId.get("a").share, 55.6);
});

test("time logged without a topic is left out rather than shared between them", () => {
  const analytics = studyAnalytics([
    session(ago(0), 60, "physics", [chapter("c1", "3")]),
    session(ago(1), 60, "physics", 0),
  ], TODAY, 7);

  assert.equal(analytics.minutes, 120);
  assert.equal(analytics.topicMinutes, 60);
  assert.equal(analytics.byTopic.length, 1);
  assert.equal(analytics.byTopic[0].minutes, 60);
  // Half the window, said plainly, rather than a claim on the hour the log was
  // never told anything about.
  assert.equal(analytics.byTopic[0].share, 50);
});

test("each subject says how much of its own time named a topic", () => {
  const analytics = studyAnalytics([
    session(ago(0), 60, "physics", [chapter("c1", "3")]),
    session(ago(1), 30, "physics", 0),
    session(ago(2), 45, "chem", [point("p1", "2.1")]),
  ], TODAY, 7);

  const byId = new Map(analytics.bySubject.map((entry) => [entry.subjectId, entry]));
  // The window's own figure is the sum of these, and the split filtered to one
  // course has to report that course's rather than the whole window's — or a
  // subject with every hour accounted for reads as though half of it is missing.
  assert.equal(analytics.topicMinutes, 105);
  assert.equal(byId.get("physics").minutes, 90);
  assert.equal(byId.get("physics").topicMinutes, 60);
  assert.equal(byId.get("chem").minutes, 45);
  assert.equal(byId.get("chem").topicMinutes, 45);
});

test("a topic's minutes are rounded once, not once a session", () => {
  const thirds = [point("a", "1.1"), point("b", "1.2"), point("c", "1.3")];
  const analytics = studyAnalytics([
    session(ago(0), 50, "physics", thirds),
    session(ago(1), 50, "physics", thirds),
    session(ago(2), 50, "physics", thirds),
  ], TODAY, 7);

  // Sixteen and two thirds, three times over. Rounded a session at a time it
  // would come to 51, and the three topics would come to 153 of a 150 minute
  // window.
  assert.equal(analytics.byTopic[0].minutes, 50);
  assert.equal(analytics.byTopic.reduce((sum, entry) => sum + entry.minutes, 0), 150);
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
