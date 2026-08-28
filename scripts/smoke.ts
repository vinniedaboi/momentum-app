/**
 * Temporary end-to-end check of the rewritten data layer against real Postgres.
 * Run with:  node --env-file=.env.local scripts/smoke.ts <workspace-uuid>
 */
import {
  addSubject, createSubjects, deleteSubject, getSubject, getSubjects,
  isKnownSubject, reorderSubjects, STARTER_SUBJECTS, subjectUsage, updateSubject,
} from "../lib/subjects-db";
import { availableOnboardingSubjects } from "../lib/onboarding-catalogue";
import {
  getTopics, importSubjectTopics, seedSubjectTopicsFromTemplate,
  updateSelectedStudyTracking, updateStudyTracking,
} from "../lib/topics-db";
import { addTopicProgressNote, getChapterActivity, getTopicActivity } from "../lib/topic-activity-db";
import { addStudyTask, deleteStudyTask, getStudyTasks, updateStudyTask } from "../lib/tasks-db";
import { addStudySession, deleteStudySession, getStudySessions } from "../lib/study-hours-db";
import { deleteStudyGoal, getStudyGoals, saveStudyGoal } from "../lib/goals-db";
import {
  createFlashcard, createFlashcardDeck, createFlashcards, deleteFlashcardDeck,
  getFlashcardDecks, resetDeckProgress, updateFlashcardMastery,
} from "../lib/flashcards-db";
import {
  addPastPaper, deletePastPaper, getPaperMeta, getPastPapers, savePaperMeta, updatePastPaper,
} from "../lib/past-papers-db";
import { catalogueFacets, catalogueRowsByIds, catalogueSubjectDirectory, queryCatalogue } from "../lib/catalogue-db";
import { getSyllabusContent, getSyllabusVersions } from "../lib/syllabus-db";
import { completeOnboarding, ensureProfile, getProfile } from "../lib/profile-db";
import { getSql } from "../lib/db";

const ws = process.argv[2];
if (!ws) throw new Error("pass the workspace uuid");

let checks = 0;
const ok = (label: string, detail: unknown = "") => {
  checks += 1;
  console.log(`  ok  ${label}${detail === "" ? "" : ` — ${detail}`}`);
};
const expect = (cond: unknown, label: string) => {
  if (!cond) throw new Error(`FAILED: ${label}`);
};

console.log("\nprofile");
await ensureProfile(ws, "smoketest@example.invalid");
const profile0 = await getProfile(ws);
expect(profile0, "profile exists");
ok("ensureProfile / getProfile", profile0!.email);

console.log("\nsubjects");
const starterIds = ["mathematics", "physics", "general"];
await createSubjects(
  ws,
  STARTER_SUBJECTS.filter((s) => starterIds.includes(s.id)).map((s) => ({
    id: s.id, name: s.name, shortName: s.shortName, tone: s.tone, board: s.board,
    qualification: s.qualification, syllabusCode: s.syllabusCode,
    stages: s.stages, paperStages: s.paperStages,
  })),
);
const subjects = await getSubjects(ws);
expect(subjects.length === 3, "3 starter subjects");
ok("createSubjects", subjects.map((s) => s.id).join(", "));
expect(await isKnownSubject(ws, "physics"), "physics known");
expect(!(await isKnownSubject(ws, "nope")), "unknown rejected");
ok("isKnownSubject");
const custom = await addSubject(ws, {
  name: "Chemistry", shortName: "Chem", tone: "amber", board: "CAIE",
  qualification: "Cambridge International AS & A Level", syllabusCode: "9701",
  stages: ["AS", "A2"], paperStages: { P1: "AS" },
});
ok("addSubject", `${custom.id} @ position ${custom.position}`);
await updateSubject(ws, custom.id, { shortName: "Chm", archived: false });
await reorderSubjects(ws, ["physics", "mathematics", custom.id, "general"]);
const reordered = await getSubjects(ws);
expect(reordered[0].id === "physics", "reorder applied");
ok("updateSubject / reorderSubjects", reordered.map((s) => s.id).join(" > "));

console.log("\ntopics");
const seeded = await seedSubjectTopicsFromTemplate(ws, "mathematics");
ok("seedSubjectTopicsFromTemplate", `${seeded.chapters} chapters, ${seeded.points} points`);
await seedSubjectTopicsFromTemplate(ws, "physics");
const topics = await getTopics(ws);
expect(topics.length > 100, "topics seeded");
ok("getTopics", `${topics.length} rows, subject order ${[...new Set(topics.map((t) => t.subjectId))].join(" > ")}`);

const chapter = topics.find((t) => t.kind === "chapter" && t.subjectId === "mathematics")!;
const children = topics.filter((t) => t.parentId === chapter.id);
expect(children.length > 0, "chapter has points");

const afterChapter = await updateStudyTracking(ws, { id: chapter.id, status: "Practising", wholeChapter: true });
expect(afterChapter.length === children.length + 1, "whole chapter updated");
expect(afterChapter.every((t) => t.status === "Practising"), "status applied");
expect(afterChapter[0].reviewDue !== null, "review scheduled");
ok("updateStudyTracking wholeChapter", `${afterChapter.length} rows, due ${afterChapter[0].reviewDue}`);

const covered = await updateStudyTracking(ws, { id: children[0].id, status: "Covered" });
expect(covered[0].status === "Covered", "Covered maps through covered flag");
ok("updateStudyTracking Covered", `stored+flag round-trips, due ${covered[0].reviewDue}`);

const someIds = children.slice(0, 3).map((t) => t.id);
const bulk = await updateSelectedStudyTracking(ws, { ids: someIds, status: "Exam Ready", reviewedNow: true });
expect(bulk.length === someIds.length, "bulk update");
ok("updateSelectedStudyTracking", `${bulk.length} points -> ${bulk[0].status}, due ${bulk[0].reviewDue}`);

console.log("\ntopic activity");
const note = await addTopicProgressNote(ws, chapter.id, "Smoke test progress note.");
ok("addTopicProgressNote", `activity #${note.activity.id}`);
const activity = await getTopicActivity(ws, chapter.id);
const chapterActivity = await getChapterActivity(ws, chapter.id);
expect(activity.length > 0 && chapterActivity.length >= activity.length, "activity recorded");
ok("getTopicActivity / getChapterActivity", `${activity.length} own, ${chapterActivity.length} incl. children`);

console.log("\ntasks");
const task = await addStudyTask(ws, {
  title: "Finish P3 integration", subjectId: "mathematics",
  dueDate: "2026-09-15", priority: "high", labels: ["Homework", "Revision"],
});
const taskUpdated = await updateStudyTask(ws, { id: task.id, completed: true });
expect(taskUpdated.completed && taskUpdated.completedAt, "completion stamped");
const tasks = await getStudyTasks(ws);
ok("tasks add/update/list", `${tasks.length} task, labels ${taskUpdated.labels.join("+")}`);
await deleteStudyTask(ws, task.id);
expect((await getStudyTasks(ws)).length === 0, "task deleted");
ok("deleteStudyTask");

console.log("\nstudy hours");
const sessionTopicIds = children.slice(3, 6).map((t) => t.id);
const { session, reviewedTopics } = await addStudySession(ws, {
  studyDate: "2026-08-20", minutes: 95, subjectId: "mathematics",
  note: "Smoke test session", topicIds: sessionTopicIds,
});
expect(session.topics.length === sessionTopicIds.length, "session topics linked");
expect(reviewedTopics.length >= sessionTopicIds.length, "logging reviewed the topics");
ok("addStudySession", `#${session.id}, ${session.topics.length} topics linked, ${reviewedTopics.length} reviewed`);
const sessions = await getStudySessions(ws);
expect(sessions.length === 1, "session listed");
ok("getStudySessions", `${sessions[0].minutes} min on ${sessions[0].studyDate}`);
await deleteStudySession(ws, session.id);
expect((await getStudySessions(ws)).length === 0, "session deleted");
ok("deleteStudySession cascades its topic links");

console.log("\ngoals");
const goal = await saveStudyGoal(ws, {
  subjectId: "mathematics", stage: "A2", startDate: "2026-09-01",
  targetDate: "2027-04-30", weeklyHours: 12, studyDays: 5, paceMode: "finish-line",
});
expect(goal.scheduleAppliedAt, "schedule applied");
const scheduled = (await getTopics(ws)).filter((t) => t.goalDue);
expect(scheduled.length > 0, "goal_due written");
ok("saveStudyGoal", `${scheduled.length} points scheduled, first due ${scheduled[0].goalDue}`);
const goals = await getStudyGoals(ws);
ok("getStudyGoals", `${goals.length} goal, pace ${goals[0].paceMode}`);
await deleteStudyGoal(ws, "mathematics", "A2");
expect((await getTopics(ws)).filter((t) => t.goalDue).length === 0, "schedule cleared");
ok("deleteStudyGoal clears goal_due");

console.log("\nflashcards");
const deckId = await createFlashcardDeck(ws, {
  title: "Smoke deck", subjectId: "mathematics", stage: "A2", chapterId: chapter.id,
});
await createFlashcard(ws, { deckId, front: "What is 2+2?", back: "4" });
const imported = await createFlashcards(ws, {
  deckId,
  cards: [
    { front: "What is 2+2?", back: "4" },
    { front: "Derivative of x^2", back: "2x" },
    { front: "Integral of 1/x", back: "ln|x| + C" },
  ],
});
expect(imported.skipped === 1, "duplicate skipped");
ok("createFlashcards dedup", `${imported.imported} imported, ${imported.skipped} skipped`);
const decks = await getFlashcardDecks(ws);
expect(decks[0].cards.length === 3, "cards grouped onto deck");
await updateFlashcardMastery(ws, decks[0].cards[0].id, 4);
await resetDeckProgress(ws, deckId);
const afterReset = await getFlashcardDecks(ws);
expect(afterReset[0].cards.every((c) => c.mastery === 0), "progress reset");
ok("mastery + resetDeckProgress", `${afterReset[0].cards.length} cards back to 0`);
await deleteFlashcardDeck(ws, deckId);
expect((await getFlashcardDecks(ws)).length === 0, "deck cascade");
ok("deleteFlashcardDeck cascades cards");

console.log("\npast papers");
const paper = await addPastPaper(ws, {
  paperId: null, subjectId: "mathematics", stage: "A2", board: "CAIE",
  paper: "Paper 3", variant: "2", session: "May/June", year: 2025,
  attemptDate: "2026-08-10", score: 62, maxScore: 75, grade: "A",
  durationMinutes: 105, conditions: "Timed", status: "done",
  weakTopics: ["Integration", "Vectors"], notes: "Lost marks on parts (c).",
});
expect(paper.percentage === 82.7, `percentage computed (got ${paper.percentage})`);
ok("addPastPaper", `${paper.score}/${paper.maxScore} = ${paper.percentage}% grade ${paper.grade}`);
const rescored = await updatePastPaper(ws, paper.id, { score: 70 });
expect(rescored.percentage === 93.3, `percentage recomputed (got ${rescored.percentage})`);
ok("updatePastPaper recomputes percentage", `${rescored.percentage}%`);
ok("getPastPapers", `${(await getPastPapers(ws)).length} paper`);
await deletePastPaper(ws, paper.id);

const meta = await savePaperMeta(ws, { paperId: "9709-mj-2025-32", difficulty: "Hard", resourceUrl: "https://example.com/notes" });
expect(meta.difficulty === "Hard", "meta saved");
ok("savePaperMeta", `${(await getPaperMeta(ws)).length} annotation`);
await savePaperMeta(ws, { paperId: "9709-mj-2025-32", difficulty: null, resourceUrl: null });
expect((await getPaperMeta(ws)).length === 0, "empty annotation removed");
ok("savePaperMeta clears when emptied");

console.log("\nshared catalogue");
const page = await queryCatalogue({
  qualification: "Cambridge International AS & A Level", subject: "Mathematics",
  years: [2024, 2025], seasons: [], components: [], variants: [], difficulties: [],
  ids: [], search: "Paper", sort: "year-desc", page: 1, pageSize: 5,
});
expect(page.rows.length > 0, "catalogue query returns rows");
ok("queryCatalogue", `${page.total} matches, page of ${page.rows.length}`);
const byIds = await catalogueRowsByIds([page.rows[0].id]);
expect(byIds.length === 1, "byIds");
ok("catalogueRowsByIds", byIds[0].label);
const facets = await catalogueFacets("Cambridge International AS & A Level", "Mathematics");
expect(facets.years.length > 0 && facets.qualifications.length > 0, "facets");
ok("catalogueFacets", `${facets.years.length} years, ${facets.seasons.length} seasons, ${facets.catalogueTotal} total`);
const directory = await catalogueSubjectDirectory();
expect(directory.length > 0, "directory");
ok("catalogueSubjectDirectory", `${directory.length} subjects`);
const versions = await getSyllabusVersions();
ok("getSyllabusVersions", `${versions.length} versions`);
ok("getSyllabusContent", `${(await getSyllabusContent(versions[0].recordId)).length} rows (0 expected until PDFs are parsed)`);

console.log("\nsyllabus import + subject delete");
const importResult = await importSubjectTopics(ws, custom.id, [
  { code: "1", title: "Atoms", kind: "chapter", parentCode: null, paper: "P1", section: "Physical", academicLevel: "AS Level" },
  { code: "1.1", title: "Relative masses", kind: "point", parentCode: "1", paper: null, section: null, academicLevel: null },
  { code: "1.2", title: "Moles", kind: "point", parentCode: "1", paper: null, section: null, academicLevel: null },
]);
expect(importResult.chapters === 1 && importResult.points === 2, "import counts");
ok("importSubjectTopics", `${importResult.chapters} chapter, ${importResult.points} points`);
const usage = await subjectUsage(ws, "mathematics");
ok("subjectUsage", Object.entries(usage).filter(([, n]) => n > 0).map(([t, n]) => `${t}=${n}`).join(", "));

await deleteSubject(ws, custom.id);
expect(!(await getSubject(ws, custom.id)), "subject deleted");
expect((await getTopics(ws)).every((t) => t.subjectId !== custom.id), "topics cascaded");
ok("deleteSubject cascades topics");

console.log("\nonboarding");
const offered = await availableOnboardingSubjects();
expect(offered.length > 20, "catalogue offers the full subject list");
const offeredWithSyllabus = offered.filter((s) => s.topicCount > 0);
expect(offeredWithSyllabus.length >= 11, "subjects with a parsed syllabus");
expect(new Set(offered.map((s) => s.key)).size === offered.length, "pick keys are unique");
expect(offered.some((s) => s.source === "bundled"), "bundled source present");
expect(offered.some((s) => s.source === "official"), "official source present");
ok("availableOnboardingSubjects", `${offered.length} subjects, ${offeredWithSyllabus.length} with a syllabus`);
// A subject covered by both a bundled template and a parsed PDF must appear once.
const maths = offered.filter((s) => s.name === "Mathematics");
expect(maths.length === 1, "no duplicate Mathematics card");
ok("richest source wins", `Mathematics -> ${maths[0].source}, ${maths[0].topicCount} rows`);

const done = await completeOnboarding(ws, {
  fullName: "Smoke Test", examBoard: "CAIE",
  qualification: "Cambridge International AS & A Level",
  targetYear: 2027, weeklyHoursTarget: 12, timezone: "Asia/Singapore",
});
expect(done.onboardedAt, "onboardedAt stamped");
ok("completeOnboarding", `onboarded at ${done.onboardedAt}`);

console.log(`\n${checks} checks passed.\n`);
await getSql().end({ timeout: 5 });
