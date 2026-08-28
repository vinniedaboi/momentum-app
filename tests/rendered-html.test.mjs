import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Source-level guardrails. These assert on the text of the source files rather
 * than on a running server, so they stay fast and need no database. Their job
 * is to catch a refactor that silently drops a feature, a piece of UI copy, or
 * — since the move to Supabase — a workspace filter.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

/** Every module that reads or writes tenant-owned rows. */
const WORKSPACE_DB_MODULES = [
  "lib/subjects-db.ts",
  "lib/topics-db.ts",
  "lib/topic-activity-db.ts",
  "lib/study-hours-db.ts",
  "lib/tasks-db.ts",
  "lib/goals-db.ts",
  "lib/flashcards-db.ts",
  "lib/past-papers-db.ts",
  "lib/notes-db.ts",
];

test("every workspace table is scoped to the signed-in account", async () => {
  for (const path of WORKSPACE_DB_MODULES) {
    const source = await read(path);
    assert.match(source, /workspaceId: string/, `${path} should take a workspace id`);
    assert.match(source, /workspace_id = \$\{workspaceId\}/, `${path} should filter on workspace_id`);
  }
});

test("no Cloudflare or D1 bindings survive the migration", async () => {
  const files = [
    ...WORKSPACE_DB_MODULES,
    "lib/catalogue-db.ts",
    "lib/syllabus-db.ts",
    "lib/db.ts",
    "app/api/topics/route.ts",
    "app/api/notes/route.ts",
  ];
  for (const file of files) {
    const source = await read(file);
    assert.doesNotMatch(source, /cloudflare:workers/, `${file} still imports the Workers runtime`);
    assert.doesNotMatch(source, /env\.DB|env\.NOTES/, `${file} still uses a Cloudflare binding`);
  }
});

test("every API route requires a session and runs on Node", async () => {
  const routes = await readdir(new URL("../app/api", import.meta.url));
  assert.ok(routes.length >= 12, "expected the full API surface");

  for (const route of routes) {
    const source = await read(`app/api/${route}/route.ts`);
    assert.match(source, /withWorkspace/, `/api/${route} should be behind withWorkspace`);
    // postgres.js opens TCP sockets, which the edge runtime cannot do.
    assert.match(source, /runtime = "nodejs"/, `/api/${route} should run on the Node runtime`);
  }
});

test("auth, onboarding and the account gate are wired", async () => {
  const [proxy, sessionGuard, home, onboarding, onboardingApi, signup, login, signout] = await Promise.all([
    read("lib/supabase/session.ts"),
    read("lib/auth.ts"),
    read("app/page.tsx"),
    read("app/onboarding/onboarding-flow.tsx"),
    read("app/api/onboarding/route.ts"),
    read("app/signup/signup-form.tsx"),
    read("app/login/login-form.tsx"),
    read("app/auth/signout/route.ts"),
  ]);

  // getSession() trusts the cookie; getUser() revalidates it with Supabase.
  assert.match(proxy, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(proxy, /supabase\.auth\.getSession\(\)/);
  assert.match(proxy, /status: 401/);
  assert.match(sessionGuard, /Sign in to continue\./);

  assert.match(home, /redirect\("\/onboarding"\)/);
  assert.match(home, /profile\.onboardedAt/);

  assert.match(onboarding, /Which subjects are you tracking\?/);
  assert.match(onboarding, /syllabus rows/);
  assert.match(onboarding, /Finish setup/);
  // The picker spans every qualification, so it needs tabs, search and chips.
  assert.match(onboarding, /picker-tabs/);
  assert.match(onboarding, /Search all subjects or a syllabus code/);
  assert.match(onboarding, /picker-chip/);
  assert.match(onboarding, /subjectKeys/);
  assert.match(onboardingApi, /createSubjects/);
  // Both syllabus sources must be wired: bundled templates and parsed PDFs.
  assert.match(onboardingApi, /seedSubjectTopicsFromTemplate/);
  assert.match(onboardingApi, /getSyllabusContent/);
  assert.match(onboardingApi, /importSubjectTopics/);
  assert.match(onboardingApi, /availableOnboardingSubjects/);
  assert.match(onboardingApi, /completeOnboarding/);

  assert.match(signup, /signUp/);
  assert.match(signup, /emailRedirectTo/);
  assert.match(signup, /check-email/);
  assert.match(login, /signInWithPassword/);
  // A GET sign-out would fire from any embedded image.
  assert.match(signout, /export async function POST/);
  assert.doesNotMatch(signout, /export async function GET/);
});

test("onboarding offers every catalogued subject, not just the bundled ones", async () => {
  const [catalogue, subjectsDb] = await Promise.all([
    read("lib/onboarding-catalogue.ts"),
    read("lib/subjects-db.ts"),
  ]);

  // The three syllabus sources, richest first.
  assert.match(catalogue, /"bundled" \| "official" \| "empty"/);
  assert.match(catalogue, /catalogueSubjectDirectory/);
  assert.match(catalogue, /getSyllabusVersions/);
  assert.match(catalogue, /templateTopicCount/);
  // One card per syllabus code, so Mathematics cannot appear twice.
  assert.match(catalogue, /seenCodes/);
  // Bundled ids are canonical: Further Mathematics maps to further-math.
  assert.match(catalogue, /subjectId: bundled\?\.id \?\? subjectSlug/);
  assert.match(subjectsDb, /export async function createSubjects/);
});

test("is deployable to Vercel", async () => {
  const [vercelJson, vercelIgnore, db, config, callback, signout, origin] = await Promise.all([
    read("vercel.json"),
    read(".vercelignore"),
    read("lib/db.ts"),
    read("next.config.ts"),
    read("app/auth/callback/route.ts"),
    read("app/auth/signout/route.ts"),
    read("lib/request-origin.ts"),
  ]);

  // Functions must sit beside the database; Vercel otherwise defaults to US East
  // while the Supabase project is in ap-southeast-1.
  const parsed = JSON.parse(vercelJson);
  assert.ok(Array.isArray(parsed.regions) && parsed.regions.length, "vercel.json needs a region");
  assert.equal(parsed.regions[0], "sin1");

  // One connection per warm instance, or a scaled-out fleet exhausts the pooler.
  assert.ok(db.includes("process.env.VERCEL ? 1 : 5"), "pool must shrink on Vercel");
  assert.ok(db.includes("prepare: false"), "transaction pooler forbids named prepared statements");

  // postgres.js needs raw TCP, so it must stay out of the edge bundles.
  assert.ok(config.includes('serverExternalPackages: ["postgres"]'));

  // Behind a proxy request.nextUrl.origin is the internal host.
  assert.ok(origin.includes("x-forwarded-host"));
  assert.ok(origin.includes("x-forwarded-proto"));
  for (const [name, source] of [["callback", callback], ["signout", signout]]) {
    assert.ok(source.includes("requestOrigin"), `${name} should resolve the forwarded origin`);
    assert.ok(!source.includes("nextUrl.origin"), `${name} should not redirect to the internal origin`);
  }

  // Nothing under these paths is imported at runtime.
  for (const path of ["data/", "scripts/", "supabase/", "tests/"]) {
    assert.ok(vercelIgnore.includes(path), `.vercelignore should exclude ${path}`);
  }
});

test("row level security covers every table", async () => {
  const [tables, policies] = await Promise.all([
    read("supabase/migrations/0002_workspace_tables.sql"),
    read("supabase/migrations/0004_rls_policies.sql"),
  ]);

  const created = [...tables.matchAll(/create table public\.(\w+)/g)].map((match) => match[1]);
  assert.ok(created.length >= 12, "expected the full workspace schema");
  for (const table of created) {
    assert.ok(policies.includes(`'${table}'`), `${table} is missing an RLS policy`);
  }
  assert.match(policies, /workspace_id = \(select auth\.uid\(\)\)/);
});

test("adds a subject and imports its syllabus in one workflow", async () => {
  const subjectSettings = await read("app/subject-settings.tsx");
  assert.match(subjectSettings, /Import the syllabus now/);
  assert.match(subjectSettings, /Add subject & syllabus/);
  assert.match(subjectSettings, /subjectId: data\.subject\.id, topics: prepared\.rows/);
  assert.match(subjectSettings, /The syllabus could not be imported, so the subject was not added/);
  assert.match(subjectSettings, /method: "DELETE"/);
});

test("includes durable tracking, goals, grouped reviews, subject tasks, study hours, flashcards, notes, and calendar", async () => {
  const [
    client,
    database,
    topicsApi,
    goalsClient,
    goalsDatabase,
    goalsApi,
    stageLogic,
    hoursClient,
    hoursDatabase,
    hoursApi,
    flashcardsClient,
    flashcardsDatabase,
    flashcardsApi,
    notesClient,
    notesDatabase,
    notesApi,
    calendarClient,
    tasksClient,
    tasksDatabase,
    tasksApi,
    timelineClient,
    timelineDatabase,
    timelineApi,
    migrations,
    packageJson,
  ] = await Promise.all([
    read("app/study-tracker-app.tsx"),
    read("lib/topics-db.ts"),
    read("app/api/topics/route.ts"),
    read("app/goals.tsx"),
    read("lib/goals-db.ts"),
    read("app/api/goals/route.ts"),
    read("app/syllabus-stage.ts"),
    read("app/study-hours.tsx"),
    read("lib/study-hours-db.ts"),
    read("app/api/study-hours/route.ts"),
    read("app/flashcards.tsx"),
    read("lib/flashcards-db.ts"),
    read("app/api/flashcards/route.ts"),
    read("app/notes.tsx"),
    read("lib/notes-db.ts"),
    read("app/api/notes/route.ts"),
    read("app/calendar.tsx"),
    read("app/tasks.tsx"),
    read("lib/tasks-db.ts"),
    read("app/api/tasks/route.ts"),
    read("app/topic-timeline.tsx"),
    read("lib/topic-activity-db.ts"),
    read("app/api/topic-activity/route.ts"),
    read("supabase/migrations/0002_workspace_tables.sql"),
    read("package.json"),
  ]);

  assert.match(client, /Reviewed now/);
  assert.match(client, /wholeChapter/);
  assert.match(client, /Review board/);
  assert.match(client, /Select all reviews in/);
  assert.match(client, /Reviewed selected/);
  assert.match(database, /intervalFor/);
  assert.match(database, /review_due/);
  assert.match(database, /goal_due/);
  assert.match(database, /Covered/);
  assert.match(client, /Syllabus progress/);
  assert.match(client, /syllabusProgress/);
  assert.match(goalsClient, /points covered/);
  assert.match(database, /CASE WHEN \$\{keepGoalDue\} THEN goal_due ELSE NULL END/);
  assert.match(database, /updateSelectedStudyTracking/);
  assert.match(topicsApi, /body\.ids/);
  assert.match(client, /Syllabus goals/);
  assert.match(goalsClient, /CHAPTER TIMELINE/);
  assert.match(goalsClient, /Required pace/);
  assert.match(goalsClient, /weeklyMinutes/);
  assert.match(goalsClient, /Plan starts/);
  assert.match(goalsClient, /Finish syllabus by/);
  assert.match(goalsClient, /Study days each week/);
  assert.match(goalsClient, /Pacing style/);
  assert.match(goalsClient, /front-loaded/);
  assert.match(goalsClient, /finish-line/);
  assert.match(goalsDatabase, /study_goals/);
  assert.match(goalsDatabase, /study_days/);
  assert.match(goalsDatabase, /pace_mode/);
  assert.match(goalsDatabase, /scheduleStudyGoal/);
  assert.match(goalsDatabase, /snapToStudyDay/);
  assert.match(goalsDatabase, /UPDATE topics SET goal_due/);
  assert.match(goalsDatabase, /clearStudyGoalSchedule/);
  assert.match(goalsDatabase, /schedule_applied_at/);
  assert.match(goalsDatabase, /if \(goal\.scheduleAppliedAt\) continue/);
  assert.match(goalsApi, /export async function POST/);
  assert.match(goalsApi, /export async function DELETE/);
  assert.match(goalsApi, /studyDays/);
  assert.match(goalsApi, /paceMode/);
  assert.match(goalsClient, /activeStage/);
  assert.match(goalsClient, /Review board active/);
  assert.match(migrations, /primary key \(workspace_id, subject_id, stage\)/);
  assert.match(stageLogic, /paperStages/);
  assert.match(client, /Track AS and A2 separately/);
  assert.match(hoursClient, /Add study time/);
  assert.match(hoursClient, /Weekly total/);
  assert.match(hoursClient, /What did you study/);
  assert.match(hoursClient, /toggleWholeChapter/);
  assert.match(hoursClient, /None selected/);
  assert.match(hoursClient, /Log time \+ mark reviewed/);
  assert.match(hoursClient, /Counted as review/);
  assert.match(hoursDatabase, /study_sessions/);
  assert.match(hoursDatabase, /study_session_topics/);
  assert.match(hoursDatabase, /getSessionTopics/);
  assert.match(hoursDatabase, /reviewStudyTopics/);
  assert.match(hoursApi, /export async function POST/);
  assert.match(hoursApi, /export async function DELETE/);
  assert.match(hoursApi, /topicIds/);
  assert.match(hoursApi, /Response\.json\(result/);
  assert.match(database, /export async function reviewStudyTopics/);
  assert.match(database, /eventType: "review"/);
  assert.match(database, /parent_id = ANY/);
  assert.match(client, /syllabus items reviewed and rescheduled/);
  assert.match(client, /Flashcards/);
  assert.match(client, /Notes library/);
  assert.match(client, /Calendar/);
  assert.match(client, /Your tasks/);
  assert.match(client, /subjectId/);
  assert.match(client, /DueTasksPanel/);
  assert.match(tasksClient, /subjectId/);
  assert.match(tasksClient, /What needs doing/);
  assert.match(tasksClient, /Filter tasks by subject/);
  assert.match(tasksClient, /Filter tasks by label/);
  assert.match(tasksClient, /Homework/);
  assert.match(tasksClient, /Custom task label/);
  assert.match(tasksClient, /task\.labels/);
  assert.match(tasksClient, /onUpdate/);
  assert.match(tasksDatabase, /study_tasks/);
  assert.match(tasksDatabase, /labels_json/);
  assert.match(tasksDatabase, /JSON\.parse/);
  assert.match(tasksDatabase, /JSON\.stringify/);
  assert.match(migrations, /idx_study_tasks_open_due/);
  assert.match(tasksApi, /export async function POST/);
  assert.match(tasksApi, /export async function PATCH/);
  assert.match(tasksApi, /export async function DELETE/);
  assert.match(tasksApi, /normaliseLabels/);
  assert.match(client, /View timeline/);
  assert.match(client, /reviewedAt/);
  assert.match(database, /recordTopicActivities/);
  assert.match(database, /reviewed_at/);
  assert.match(timelineClient, /PROGRESS OVER TIME/);
  assert.match(timelineClient, /Add a progress update/);
  assert.match(timelineDatabase, /topic_activity/);
  assert.match(migrations, /idx_topic_activity_topic_time/);
  assert.match(timelineDatabase, /UPDATE topics SET updated_at/);
  assert.match(timelineApi, /export async function POST/);
  assert.match(flashcardsClient, /DUE FOR REVIEW/);
  assert.match(flashcardsClient, /gradeToMastery/);
  assert.match(flashcardsClient, /Reset progress/);
  assert.match(flashcardsClient, /Review missed/);
  assert.match(flashcardsClient, /Add flashcard/);
  assert.match(flashcardsClient, /Import CSV/);
  assert.match(flashcardsClient, /Export CSV/);
  assert.match(flashcardsClient, /parseCsv/);
  assert.match(flashcardsClient, /Search flashcards/);
  assert.match(flashcardsClient, /Needs work/);
  assert.match(flashcardsClient, /Shuffle/);
  assert.match(flashcardsClient, /Flashcard updated/);
  assert.match(flashcardsClient, /Add to syllabus/);
  assert.match(flashcardsClient, /General deck \/ no syllabus/);
  assert.match(flashcardsClient, /Whole \{deckStage\} syllabus/);
  assert.match(flashcardsClient, /Whole chapter/);
  assert.match(flashcardsClient, /mainChapterCode/);
  assert.match(flashcardsClient, /major:/);
  assert.match(flashcardsClient, /optgroup/);
  assert.match(flashcardsClient, /getTopicStage/);
  assert.match(flashcardsDatabase, /flashcard_decks/);
  assert.match(flashcardsDatabase, /mastery/);
  assert.match(flashcardsDatabase, /chapter_id/);
  assert.match(flashcardsDatabase, /isValidFlashcardChapter/);
  assert.match(flashcardsDatabase, /startsWith\("major:"\)/);
  assert.match(flashcardsDatabase, /createFlashcards/);
  assert.match(flashcardsDatabase, /updateFlashcard/);
  assert.match(flashcardsDatabase, /resetDeckProgress/);
  assert.match(flashcardsDatabase, /offset \+= 500/);
  assert.match(flashcardsApi, /export async function POST/);
  assert.match(flashcardsApi, /export async function PATCH/);
  assert.match(flashcardsApi, /export async function DELETE/);
  assert.match(flashcardsApi, /chapterId/);
  assert.match(flashcardsApi, /kind === "cards"/);
  assert.match(flashcardsApi, /kind === "reset"/);
  assert.match(flashcardsApi, /cards\.length > 500/);
  assert.match(client, /FlashcardsView topics=\{topics\}/);
  assert.match(notesClient, /Upload study notes/);
  assert.match(notesClient, /Upload to syllabus/);
  assert.match(notesClient, /General notes \/ no syllabus/);
  assert.match(notesClient, /Whole \{stage\} syllabus/);
  assert.match(notesClient, /getTopicStage/);
  assert.match(notesClient, /\/api\/notes\?id=/);
  assert.match(notesDatabase, /storage\.from\(BUCKET\)/);
  assert.match(notesDatabase, /note_files/);
  assert.match(notesDatabase, /chapter_id/);
  assert.match(notesDatabase, /isValidNoteChapter/);
  assert.match(notesApi, /formData/);
  assert.match(notesApi, /MAX_BYTES/);
  assert.match(notesApi, /chapterId/);
  assert.match(client, /NotesView topics=\{topics\}/);
  assert.match(calendarClient, /STUDY CALENDAR/);
  assert.match(calendarClient, /paceFraction/);
  assert.match(calendarClient, /goal-task/);
  assert.match(client, /scheduledDate/);
  assert.match(client, /Goal plan/);
  assert.match(client, /onScheduleChanged=\{refreshTopics\}/);
  assert.match(client, /fetch\("\/api\/goals"\)/);
  assert.match(calendarClient, /review|task|study|deadline|milestone/);
  assert.match(migrations, /create table public\.topics/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
