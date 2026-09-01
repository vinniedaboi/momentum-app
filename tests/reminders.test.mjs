import assert from "node:assert/strict";
import test from "node:test";

/**
 * The parts of the reminder that can be tested without a database: what the
 * subject line leads on, how a long queue is trimmed, and whether an unsubscribe
 * link can be forged.
 *
 * The selection query itself is exercised against real data by
 * `/api/cron/reminders?dry=1`, which builds every mail and sends none.
 */

process.env.REMINDER_SECRET = "test-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";

const { subjectLine, renderText, renderHtml } = await import("../lib/reminder-mail.ts");
const { unsubscribeToken, verifyUnsubscribeToken } = await import("../lib/email.ts");

function reminder(overrides = {}) {
  return {
    workspaceId: "11111111-2222-3333-4444-555555555555",
    email: "learner@example.test",
    name: "Sam",
    kind: "digest",
    items: 0,
    reviews: [],
    reviewsTotal: 0,
    tasks: [],
    exams: [],
    subjects: [],
    daysSinceOnboarding: 3,
    ...overrides,
  };
}

const topic = (code, title, subject = "Physics") => ({ subject, code, title, status: "Learning" });

test("the subject line leads on the most urgent thing", () => {
  const exam = { subject: "Chemistry", title: "Paper 2", examDate: "2026-09-05", days: 4, uncovered: 3 };

  assert.equal(
    subjectLine(reminder({ exams: [exam], reviews: [topic("1.1", "Motion")], reviewsTotal: 1 })),
    "Chemistry Paper 2 in 4 days",
    "an exam this close outranks the review queue",
  );
  assert.equal(
    subjectLine(reminder({ reviews: [topic("1.1", "Motion")], reviewsTotal: 9 })),
    "9 topics due for review today",
    "the count is the whole queue, not the few the mail lists",
  );
  assert.equal(
    subjectLine(reminder({ tasks: [{ subject: "Biology", title: "Past paper", dueDate: "2026-08-30", overdue: true }] })),
    "1 task overdue",
  );
});

test("an exam further out than a week does not take the subject line", () => {
  const exam = { subject: "Chemistry", title: "Mock", examDate: "2026-09-13", days: 12, uncovered: 0 };
  assert.equal(
    subjectLine(reminder({ exams: [exam], reviews: [topic("1.1", "Motion")], reviewsTotal: 4 })),
    "4 topics due for review today",
  );
});

test("a long queue is trimmed and the remainder counted", () => {
  const reviews = Array.from({ length: 12 }, (_, index) => topic(`1.${index + 1}`, `Point ${index + 1}`));
  const text = renderText(reminder({ reviews, reviewsTotal: 29 }));

  assert.match(text, /Point 8/, "the first eight are named");
  assert.doesNotMatch(text, /Point 9/, "the ninth is not");
  assert.match(text, /\.\.\.and 21 more/, "and the rest are counted from the true total");
});

test("a spec point that runs to a paragraph is shortened", () => {
  const long = "understand the use of the time-base and y-gain of a cathode-ray oscilloscope to determine frequency and amplitude";
  const text = renderText(reminder({ reviews: [topic("7.1.3", long)], reviewsTotal: 1 }));
  const line = text.split("\n").find((row) => row.includes("7.1.3"));

  assert.ok(line.length < 100, `the line should be trimmed, got ${line.length} characters`);
  assert.match(line, /…$/);
});

test("the activation mail names a first step rather than a queue", () => {
  const mail = reminder({
    kind: "activation",
    subjects: [{ subject: "Physics", points: 412, firstCode: "1.1", firstTitle: "Physical quantities" }],
    items: 1,
  });

  assert.equal(subjectLine(mail), "Your Physics syllabus is waiting — start with one point");
  const text = renderText(mail);
  assert.match(text, /1\.1 · Physical quantities/);
  assert.match(text, /412 points/);
});

test("every mail carries a working unsubscribe link", () => {
  const mail = reminder({ reviews: [topic("1.1", "Motion")], reviewsTotal: 1 });
  const text = renderText(mail);
  const html = renderHtml(mail);

  const token = text.match(/stop\?t=([^\s]+)/)[1];
  assert.equal(verifyUnsubscribeToken(token), mail.workspaceId);
  assert.match(html, /reminders\/stop\?t=/);
});

test("an unsubscribe token cannot be forged or pointed at someone else", () => {
  const mine = "11111111-2222-3333-4444-555555555555";
  const theirs = "99999999-8888-7777-6666-555555555555";
  const token = unsubscribeToken(mine);

  assert.equal(verifyUnsubscribeToken(token), mine);
  // The id is a foreign key, not a secret: swapping it must not verify.
  assert.equal(verifyUnsubscribeToken(token.replace(mine, theirs)), null);
  assert.equal(verifyUnsubscribeToken(theirs), null, "an unsigned id is not a token");
  assert.equal(verifyUnsubscribeToken(`${mine}.tampered`), null);
  assert.equal(verifyUnsubscribeToken(""), null);
});

test("links say which mail they came from", () => {
  const text = renderText(reminder({ reviews: [topic("1.1", "Motion")], reviewsTotal: 1 }));
  // Without this there is no way to tell a visit caused by a reminder from any
  // other, and so no way to know whether reminders are worth sending.
  assert.match(text, /https:\/\/example\.test\/\?src=review/);
});

test("the HTML escapes what a syllabus put in a title", () => {
  const html = renderHtml(reminder({
    reviews: [topic("1.1", 'Acids & bases <script>alert("x")</script>')],
    reviewsTotal: 1,
  }));

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Acids &amp; bases/);
});
