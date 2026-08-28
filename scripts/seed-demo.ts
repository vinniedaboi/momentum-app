/**
 * Fills an account with a realistic study history so it is worth filming.
 *
 *   npm run seed:demo -- --email demo@example.com
 *   npm run seed:demo -- --email demo@example.com --reset
 *
 * The account must already exist and have been through onboarding, so it has
 * subjects and a syllabus. Everything is written through the app's own data
 * layer rather than raw SQL, so review scheduling, activity history and goal
 * pacing all end up exactly as they would from real use.
 *
 * FEATURES.md asks for this before a demo recording: an empty analytics view
 * films badly.
 */
import { getSql } from "../lib/db";
import { getSubjects } from "../lib/subjects-db";
import { getTopics, updateStudyTracking, updateSelectedStudyTracking } from "../lib/topics-db";
import { addStudySession, deleteStudySession, getStudySessions } from "../lib/study-hours-db";
import { addStudyTask, deleteStudyTask, getStudyTasks, updateStudyTask } from "../lib/tasks-db";
import { addPastPaper, deletePastPaper, getPastPapers } from "../lib/past-papers-db";
import {
  createFlashcardDeck, createFlashcards, deleteFlashcardDeck,
  getFlashcardDecks, updateFlashcardMastery,
} from "../lib/flashcards-db";
import { deleteStudyGoal, saveStudyGoal } from "../lib/goals-db";

const argOf = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const email = argOf("email");
if (!email) throw new Error("pass --email <address>");

const sql = getSql();
const profiles = await sql<{ id: string; email: string }[]>`
  SELECT id, email FROM profiles WHERE lower(email) = ${email.toLowerCase()}
`;
if (!profiles.length) throw new Error(`No account for ${email}. Sign up and finish onboarding first.`);
const ws = profiles[0].id;

const today = new Date();
const dayOffset = (days: number) => {
  const value = new Date(today);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const subjects = await getSubjects(ws);
const topics = await getTopics(ws);
if (!subjects.length || !topics.length) {
  throw new Error("That account has no syllabus yet — finish onboarding before seeding.");
}

console.log(`\ntarget: ${profiles[0].email}`);
console.log(`subjects: ${subjects.map((s) => s.name).join(", ")}`);

if (process.argv.includes("--reset")) {
  for (const session of await getStudySessions(ws)) await deleteStudySession(ws, session.id);
  for (const task of await getStudyTasks(ws)) await deleteStudyTask(ws, task.id);
  for (const paper of await getPastPapers(ws)) await deletePastPaper(ws, paper.id);
  for (const deck of await getFlashcardDecks(ws)) await deleteFlashcardDeck(ws, deck.id);
  for (const subject of subjects) {
    for (const stage of ["AS", "A2"] as const) {
      await deleteStudyGoal(ws, subject.id, stage).catch(() => {});
    }
  }
  console.log("cleared previous demo data");
}

// The subject with the most syllabus is the one worth showing on camera.
const counts = new Map<string, number>();
for (const topic of topics) counts.set(topic.subjectId, (counts.get(topic.subjectId) ?? 0) + 1);
const mainId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
const main = subjects.find((s) => s.id === mainId)!;
const mainPoints = topics.filter((t) => t.subjectId === mainId && t.kind === "point");
const mainChapters = topics.filter((t) => t.subjectId === mainId && t.kind === "chapter");
console.log(`headline subject: ${main.name} (${mainChapters.length} chapters, ${mainPoints.length} points)`);

// --- study sessions -------------------------------------------------------
// Logging a session also marks its topics reviewed on that date, so older
// sessions naturally leave overdue reviews behind — exactly what the review
// board should be showing when the camera starts.
const sessionPlan = [
  { days: -16, minutes: 75, from: 0, take: 6, note: "Chapter 1 first pass" },
  { days: -13, minutes: 95, from: 6, take: 5, note: "Worked examples" },
  { days: -11, minutes: 45, from: 11, take: 4, note: "Quick recap before class" },
  { days: -8, minutes: 120, from: 15, take: 7, note: "Long session, past paper questions" },
  { days: -5, minutes: 60, from: 22, take: 5, note: "Tricky proofs" },
  { days: -3, minutes: 80, from: 27, take: 6, note: "Second pass, felt better" },
  { days: -1, minutes: 50, from: 33, take: 4, note: "Evening revision" },
];

let sessionsMade = 0;
for (const plan of sessionPlan) {
  const ids = mainPoints.slice(plan.from, plan.from + plan.take).map((t) => t.id);
  if (!ids.length) continue;
  await addStudySession(ws, {
    studyDate: dayOffset(plan.days),
    minutes: plan.minutes,
    subjectId: mainId,
    note: plan.note,
    topicIds: ids,
  });
  sessionsMade += 1;
}
console.log(`study sessions: ${sessionsMade}`);

// --- topic progress -------------------------------------------------------
// A spread across the status ladder so every review counter has something in it.
const examReady = mainPoints.slice(0, 4).map((t) => t.id);
const practising = mainPoints.slice(40, 52).map((t) => t.id);
const learning = mainPoints.slice(52, 66).map((t) => t.id);

if (examReady.length) await updateSelectedStudyTracking(ws, { ids: examReady, status: "Exam Ready" });
if (practising.length) await updateSelectedStudyTracking(ws, { ids: practising, status: "Practising" });
if (learning.length) await updateSelectedStudyTracking(ws, { ids: learning, status: "Learning" });
// One whole chapter marked Covered reads well when demoing the cascade.
if (mainChapters.length > 1) {
  await updateStudyTracking(ws, { id: mainChapters[1].id, status: "Covered", wholeChapter: true });
}
console.log(`topic progress: ${examReady.length} exam ready, ${practising.length} practising, ${learning.length} learning, 1 chapter covered`);

// --- past papers ----------------------------------------------------------
const stage = main.stages.includes("A2") ? "A2" : "AS";
const paperPlan = [
  { days: -30, paper: "Paper 1", variant: "2", year: 2023, score: 48, max: 75, grade: "C" as const, minutes: 105, weak: ["Vectors", "Integration"] },
  { days: -21, paper: "Paper 3", variant: "1", year: 2023, score: 55, max: 75, grade: "B" as const, minutes: 110, weak: ["Integration"] },
  { days: -12, paper: "Paper 1", variant: "3", year: 2024, score: 62, max: 75, grade: "A" as const, minutes: 98, weak: ["Vectors"] },
  { days: -4, paper: "Paper 3", variant: "2", year: 2024, score: 68, max: 75, grade: "A" as const, minutes: 95, weak: [] },
];
for (const plan of paperPlan) {
  await addPastPaper(ws, {
    paperId: null, subjectId: mainId, stage, board: main.board ?? "CAIE",
    paper: plan.paper, variant: plan.variant, session: "May/June", year: plan.year,
    attemptDate: dayOffset(plan.days), score: plan.score, maxScore: plan.max,
    grade: plan.grade, durationMinutes: plan.minutes, conditions: "Timed",
    status: "done", weakTopics: plan.weak,
    notes: plan.weak.length ? `Lost most marks on ${plan.weak[0].toLowerCase()}.` : "Best run so far.",
  });
}
// One planned paper, so the "planned vs done" split is visible.
await addPastPaper(ws, {
  paperId: null, subjectId: mainId, stage, board: main.board ?? "CAIE",
  paper: "Paper 1", variant: "1", session: "Oct/Nov", year: 2024,
  attemptDate: dayOffset(4), score: null, maxScore: null, grade: null,
  durationMinutes: null, conditions: "Timed", status: "planned", weakTopics: [],
  notes: "Booked for Saturday.",
});
console.log(`past papers: ${paperPlan.length} attempted (rising 64% -> 91%), 1 planned`);

// --- flashcards -----------------------------------------------------------
const deckId = await createFlashcardDeck(ws, {
  title: `${main.name} — weak spots`,
  subjectId: mainId,
  stage,
  chapterId: mainChapters[0]?.id ?? null,
});
const cards = mainPoints.slice(0, 10).map((point) => ({
  front: point.title.length > 90 ? `${point.title.slice(0, 87)}…` : point.title,
  back: `See ${main.name} ${point.code}.`,
}));
await createFlashcards(ws, { deckId, cards });
const deck = (await getFlashcardDecks(ws)).find((d) => d.id === deckId)!;
// Varied mastery so "Due for review" and "Needs work" both have contents.
const masteries = [5, 4, 1, 3, 0, 2, 5, 1, 4, 2];
for (const [index, card] of deck.cards.entries()) {
  await updateFlashcardMastery(ws, card.id, masteries[index % masteries.length]);
}
console.log(`flashcards: 1 deck, ${deck.cards.length} cards at mixed mastery`);

// --- tasks ----------------------------------------------------------------
const taskPlan = [
  { title: "Finish Chapter 4 exercises", days: -2, priority: "high" as const, labels: ["Homework"], done: true },
  { title: "Redo the vectors question from P3", days: 1, priority: "high" as const, labels: ["Revision"], done: false },
  { title: "Print the formula sheet", days: 3, priority: "low" as const, labels: ["Admin"], done: false },
  { title: "Ask about part (c) marking", days: 5, priority: "medium" as const, labels: ["Homework", "Revision"], done: false },
];
for (const plan of taskPlan) {
  const task = await addStudyTask(ws, {
    title: plan.title, subjectId: mainId, dueDate: dayOffset(plan.days),
    priority: plan.priority, labels: plan.labels,
  });
  if (plan.done) await updateStudyTask(ws, { id: task.id, completed: true });
}
console.log(`tasks: ${taskPlan.length} (1 done, 1 overdue)`);

// --- goal -----------------------------------------------------------------
await saveStudyGoal(ws, {
  subjectId: mainId, stage,
  startDate: dayOffset(-20), targetDate: dayOffset(120),
  weeklyHours: 12, studyDays: 5, paceMode: "steady",
});
console.log("syllabus goal: 1, pacing the rest of the syllabus over ~4 months");

// --- summary --------------------------------------------------------------
const final = await getTopics(ws);
const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());
const overdue = final.filter((t) => t.reviewDue && t.reviewDue < local).length;
const dueToday = final.filter((t) => t.reviewDue === local).length;
const upcoming = final.filter((t) => t.reviewDue && t.reviewDue > local).length;
const ready = final.filter((t) => t.status === "Exam Ready").length;

console.log(`\nreview board: ${overdue} overdue, ${dueToday} due today, ${upcoming} upcoming, ${ready} exam ready`);
console.log("done.\n");

await sql.end({ timeout: 5 });
