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
  "lib/grade-targets-db.ts",
  "lib/flashcards-db.ts",
  "lib/past-papers-db.ts",
  "lib/notes-db.ts",
  "lib/exams-db.ts",
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

/**
 * The two routes with no session behind them, and what guards each instead.
 * Both are also listed in the proxy's public prefixes, which the test below
 * checks, so adding one here alone does not make it reachable.
 */
const UNAUTHENTICATED_ROUTES = {
  // Called by Vercel Cron, which carries a shared secret and no cookies.
  "cron/reminders": /CRON_SECRET/,
  // Clicked from a mail by someone who is not signed in, and may never be again.
  "reminders/stop": /verifyUnsubscribeToken/,
};

/** Every route.ts under app/api, nested ones included, as `a/b` paths. */
async function apiRoutes(prefix = "") {
  const entries = await readdir(new URL(`../app/api/${prefix}`, import.meta.url), { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (entry.isDirectory()) found.push(...await apiRoutes(`${prefix}${entry.name}/`));
    else if (entry.name === "route.ts") found.push(prefix.replace(/\/$/, ""));
  }
  return found;
}

test("every API route requires a session and runs on Node", async () => {
  const routes = await apiRoutes();
  assert.ok(routes.length >= 12, "expected the full API surface");

  for (const route of routes) {
    const source = await read(`app/api/${route}/route.ts`);
    const ownGuard = UNAUTHENTICATED_ROUTES[route];
    if (ownGuard) {
      // Exempt from the session, never from having a guard of its own.
      assert.match(source, ownGuard, `/api/${route} should authorise itself`);
    } else {
      assert.match(source, /withWorkspace/, `/api/${route} should be behind withWorkspace`);
    }
    // postgres.js opens TCP sockets, which the edge runtime cannot do.
    assert.match(source, /runtime = "nodejs"/, `/api/${route} should run on the Node runtime`);
  }

  // A route reachable without a session has to be public in the proxy too, and
  // nothing else should be.
  const proxy = await read("lib/supabase/session.ts");
  for (const route of Object.keys(UNAUTHENTICATED_ROUTES)) {
    const segment = route.split("/")[0];
    assert.ok(proxy.includes(`/api/${segment}`), `the proxy should let /api/${route} through`);
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
  // A subject and the board that teaches it are two answers: the card is the
  // subject, and the boards offering it are the buttons on it.
  assert.match(onboarding, /subject-boards/);
  assert.match(onboarding, /function chooseBoard/);
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

  // The brand lockup uses the drawn mark, not the placeholder letterform.
  const aside = await read("app/auth-aside.tsx");
  assert.match(aside, /MomentumMark/);
  assert.ok(!aside.includes('className="brand-mark">M<'), "the placeholder M should be gone");

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

  // .vercelignore uses gitignore semantics, where an unanchored `supabase/`
  // also matches `lib/supabase/` — which is runtime code, and which broke a
  // real deployment. Every pattern must be anchored to the repository root.
  const patterns = vercelIgnore
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  assert.ok(patterns.length, ".vercelignore should list something");
  for (const pattern of patterns) {
    assert.ok(pattern.startsWith("/"), `.vercelignore pattern "${pattern}" must start with /`);
    assert.ok(!pattern.includes("*"), `.vercelignore pattern "${pattern}" must be a literal path`);
  }
  for (const path of ["/data/", "/scripts/", "/supabase/", "/tests/"]) {
    assert.ok(patterns.includes(path), `.vercelignore should exclude ${path}`);
  }

  // Walk what would actually be uploaded and prove no runtime file is dropped.
  const excluded = (file) =>
    patterns.some((pattern) => {
      const bare = pattern.slice(1);
      return bare.endsWith("/") ? file.startsWith(bare) : file === bare;
    });

  const root = new URL("../", import.meta.url);
  const walk = async (dir, prefix = "") => {
    const found = [];
    for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
      if (["node_modules", ".next", ".git", ".vercel"].includes(entry.name)) continue;
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) found.push(...await walk(`${path}/`, `${path}/`));
      else found.push(path);
    }
    return found;
  };

  const runtimeFiles = (await walk("")).filter(
    (file) => file.startsWith("app/") || file.startsWith("lib/") || file === "proxy.ts",
  );
  assert.ok(runtimeFiles.length > 40, "expected to find the app and lib trees");

  const dropped = runtimeFiles.filter(excluded);
  assert.deepEqual(dropped, [], `.vercelignore would drop runtime files: ${dropped.join(", ")}`);
  // The specific files the first deployment lost.
  for (const file of ["lib/supabase/server.ts", "lib/supabase/client.ts", "lib/supabase/session.ts"]) {
    assert.ok(!excluded(file), `${file} must reach the deployment`);
  }
});

test("the exam planner schedules a chosen subset without touching goal plans", async () => {
  const [examsDb, examsApi, examsUi, pacing, goalsDb, shell, calendar, migration] = await Promise.all([
    read("lib/exams-db.ts"),
    read("app/api/exams/route.ts"),
    read("app/exams.tsx"),
    read("lib/pacing.ts"),
    read("lib/goals-db.ts"),
    read("app/study-tracker-app.tsx"),
    read("app/calendar.tsx"),
    read("supabase/migrations/0007_exams.sql"),
  ]);

  // An exam covers part of a syllabus, and a topic can sit in several exams,
  // so dates live in exam_topics rather than in topics.goal_due.
  assert.match(migration, /create table public\.exam_topics/);
  assert.match(migration, /revise_on text/);
  assert.ok(!/goal_due\s*=/.test(examsDb), "the exam planner must not write goal_due");
  assert.match(examsDb, /UPDATE exam_topics SET revise_on/);

  // Both planners share one implementation of the pacing maths.
  assert.match(pacing, /export function pacedDates/);
  assert.match(examsDb, /pacedDates/);
  assert.match(goalsDb, /pacedDates/);
  assert.ok(!goalsDb.includes("function snapToStudyDay"), "pacing maths should not be duplicated");

  // Finished topics drop off the plan; selections cannot cross subjects.
  assert.match(examsDb, /topic\.covered \|\| topic\.status === "Exam Ready"/);
  assert.match(examsDb, /A selected topic is not in this subject/);

  assert.match(examsApi, /withWorkspace/);
  assert.match(examsApi, /Pick the topics this exam covers/);

  assert.match(examsUi, /Topics this exam covers/);
  assert.match(examsUi, /Plan an exam/);
  assert.match(examsUi, /indeterminate = some/);   // part-selected chapters
  assert.match(examsUi, /Select all/);
  assert.match(examsUi, /countdownLabel/);

  // Wired into the shell and onto the calendar.
  assert.match(shell, /ExamPlanner/);
  assert.match(shell, /activeView === "Exams"/);
  assert.match(calendar, /"exam-task"/);
  assert.match(calendar, /studyApi\.exams\.path/);
});

test("row level security covers every table", async () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
  const sql = (await Promise.all(files.map((name) => read(`supabase/migrations/${name}`)))).join("\n");

  const created = [...sql.matchAll(/create table public\.(\w+)/g)].map((match) => match[1]);
  assert.ok(created.length >= 14, `expected the full schema, found ${created.length}`);

  for (const table of created) {
    // Either listed in the bulk DO block, or given its own policy.
    const covered = sql.includes(`'${table}'`) || sql.includes(`on public.${table}`);
    assert.ok(covered, `${table} is missing an RLS policy`);
    assert.ok(
      sql.includes(`alter table public.${table} enable row level security`) || sql.includes(`'${table}'`),
      `${table} does not enable row level security`,
    );
  }
  assert.match(sql, /workspace_id = \(select auth\.uid\(\)\)/);
});

test("adds a subject and imports its syllabus in one workflow", async () => {
  const subjectSettings = await read("app/subject-settings.tsx");
  assert.match(subjectSettings, /Import the syllabus now/);
  assert.match(subjectSettings, /Add subject & syllabus/);
  assert.match(subjectSettings, /subjectId: data\.subject\.id, topics: prepared\.rows/);
  assert.match(subjectSettings, /The syllabus could not be imported, so the subject was not added/);
  // A subject whose syllabus import fails is rolled back rather than left half made.
  assert.match(subjectSettings, /studyApi\.subjects\.remove\(createdSubject\.id\)/);
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
    workspace,
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
    read("app/data/use-workspace.ts"),
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
  assert.match(database, /reviewInterval/);
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
  assert.match(goalsDatabase, /pacedDates/);
  assert.match(goalsDatabase, /UPDATE topics SET goal_due/);
  assert.match(goalsDatabase, /clearStudyGoalSchedule/);
  assert.match(goalsDatabase, /schedule_applied_at/);
  // A goal whose plan is already written is left alone on read.
  assert.match(goalsDatabase, /filter\(\(goal\) => !goal\.scheduleAppliedAt\)/);
  assert.match(goalsApi, /export async function POST/);
  assert.match(goalsApi, /export async function DELETE/);
  assert.match(goalsApi, /studyDays/);
  assert.match(goalsApi, /paceMode/);
  assert.match(goalsClient, /activeStage/);
  assert.match(goalsClient, /Review board active/);
  assert.match(migrations, /primary key \(workspace_id, subject_id, stage\)/);
  assert.match(stageLogic, /paperStages/);
  // The stage switch names whichever stages the subject carries, so an A Level
  // still splits into AS and A2 and an IB course into SL and HL.
  assert.match(client, /Track \{subject\.stages\.join\(" and "\)\} separately/);
  assert.match(hoursClient, /Add study time/);
  // The study screen answers for a window rather than for a fixed week, and
  // every figure on it is reported against the same one.
  assert.match(hoursClient, /STUDY_RANGES/);
  assert.match(hoursClient, /Consistency/);
  assert.match(hoursClient, /Streak/);
  assert.match(hoursClient, /Time by subject/);
  assert.match(hoursClient, /When you actually study/);
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
  // The legend doubles as the filter, so every kind it names is a toggle and
  // the day grid is built from what those toggles leave showing.
  assert.match(calendarClient, /EVENT_KINDS/);
  assert.match(calendarClient, /aria-pressed=\{!hidden\.has\(kind\)\}/);
  assert.match(calendarClient, /events\.filter\(\(event\) => !hidden\.has\(event\.kind\)\)/);
  assert.match(calendarClient, /calendar-show-all/);

  // History is one merged feed assembled at read time, not a second log that
  // has to be kept in step with the rows it duplicates.
  const [historyDb, historyView, historyApi] = await Promise.all([
    read("lib/history-db.ts"),
    read("app/history.tsx"),
    read("app/api/history/route.ts"),
  ]);
  assert.match(historyDb, /union all/);
  for (const source of ["topic_activity", "study_sessions", "past_papers", "study_tasks"]) {
    assert.match(historyDb, new RegExp(source), `history should read ${source}`);
  }
  // Cursor paging, not offset: new activity lands at the top of this list.
  assert.match(historyDb, /at < \$\{before\}/);
  assert.doesNotMatch(historyDb, /offset\s*\$\{/i);
  assert.match(historyApi, /before/);
  assert.match(historyView, /history-filter/);
  assert.match(client, /HistoryView today=/);
  assert.match(client, /scheduledDate/);
  assert.match(client, /Goal plan/);
  assert.match(client, /onScheduleChanged=\{refreshGoals\}/);
  assert.match(workspace, /studyApi\.goals\.path/);
  assert.match(workspace, /await reloadTopics\(\)/);
  assert.match(calendarClient, /review|task|study|deadline|milestone/);
  assert.match(migrations, /create table public\.topics/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("offers the English boards' A levels beside the international ones", async () => {
  const [directory, builder, content, ukParser, stages, onboarding, catalogue] = await Promise.all([
    read("data/syllabus-versions.csv"),
    read("scripts/build_syllabus_directory.py"),
    read("scripts/parse_syllabus_content.py"),
    read("scripts/parse_uk.py"),
    read("app/syllabus-stage.ts"),
    read("app/onboarding/onboarding-flow.tsx"),
    read("lib/onboarding-catalogue.ts"),
  ]);

  const suites = new Map();
  for (const row of directory.split("\n").slice(1).filter(Boolean)) {
    const qualification = row.split(",")[2];
    if (qualification) suites.set(qualification, (suites.get(qualification) ?? 0) + 1);
  }

  // Each board gets its own qualification. Onboarding keys a subject on
  // qualification and name, so three boards all offering "Chemistry" under a
  // shared "A Level" label would collide on one key.
  for (const qualification of ["AQA A Level", "OCR A Level", "Edexcel A Level"]) {
    assert.ok((suites.get(qualification) ?? 0) > 20,
      `expected a full ${qualification} suite, found ${suites.get(qualification) ?? 0}`);
  }
  // A board reaches sign-up by being in the directory: the picker builds its
  // filter from the subjects it was handed, so no board can be left off a list.
  assert.match(onboarding, /Which boards do you study/);
  assert.match(onboarding, /subject\.qualification/);
  assert.ok(!onboarding.includes("const QUALIFICATIONS"), "sign-up should not hard-code the boards");
  // Adding the English boards must not have cost the international suites.
  assert.ok((suites.get("Cambridge IGCSE") ?? 0) >= 180);
  assert.ok((suites.get("Cambridge International AS & A Level") ?? 0) >= 96);
  assert.ok((suites.get("International A Level") ?? 0) >= 17);

  // A board is added by crawling that board. A full rebuild re-verifies every
  // URL, and one flaky connection during that drops rows that were already good.
  assert.match(builder, /--only=/);
  assert.match(builder, /def existing_rows\(\)/);
  for (const suite of ["cambridge", "pearson-ial", "edexcel-igcse", "aqa", "ocr", "edexcel-uk"]) {
    assert.match(builder, new RegExp(`"${suite}", \\(`), `${suite} is not a rebuildable suite`);
  }

  // Every board's layout has a reader; Pearson's UK and International specs
  // share a template, so they share one.
  assert.match(content, /if "aqa" in name/);
  assert.match(content, /if "ocr" in name/);
  assert.match(content, /if "pearson" in name/);
  assert.match(ukParser, /def parse_aqa/);
  assert.match(ukParser, /def parse_ocr/);
  assert.doesNotMatch(ukParser, /def parse_edexcel/);

  // AQA is the only UK board whose specification says which year its content
  // belongs to, so it is the only one that keeps the AS/A2 split.
  assert.match(stages, /SINGLE_STAGE = .*OCR\|Edexcel\) A Level/);
  assert.match(ukParser, /A_LEVEL_ONLY/);
  // One copy of that rule now that it has a board-specific branch.
  assert.match(catalogue, /import \{ stagesForQualification \}/);

  // The subject picker has to offer a subject that has a syllabus but no past
  // papers, which is every English board and every International GCSE. Listing
  // only the paper catalogue is what left them reachable at sign-up and nowhere
  // else, so the union belongs in the directory both screens read.
  const directoryQuery = await read("lib/catalogue-db.ts");
  assert.match(directoryQuery, /syllabus_only AS \(/);
  assert.match(directoryQuery, /FROM syllabus_versions v/);
  assert.match(directoryQuery, /SELECT \* FROM with_papers\s*\n\s*UNION ALL/);
});

test("plans from both planners land on one review board", async () => {
  const [shell, workspace, examsDb] = await Promise.all([
    read("app/study-tracker-app.tsx"),
    read("app/data/use-workspace.ts"),
    read("lib/exams-db.ts"),
  ]);

  // A goal writes its dates onto the topic; an exam cannot, because a topic can
  // sit in several exams at once. The board has to read both or it answers
  // "what do I study today" with only half of the answer.
  assert.match(examsDb, /exam_topics SET revise_on/);
  assert.match(workspace, /studyApi\.exams\.path/);
  assert.match(shell, /function examSchedule/);
  assert.match(shell, /scheduledDate\(topic, examDue/);

  // Everything that asks when a topic is next wanted goes through one helper,
  // so the queue, the counters and a subject's own page cannot disagree.
  assert.match(shell, /const dueOn = useCallback/);
  assert.ok(!/scheduledDate\(topic\)/.test(shell), "every reading should pass the exam date");
});

test("every plan says how long each syllabus point gets", async () => {
  const [budget, shell, goalsView, examsView, workspace] = await Promise.all([
    read("app/study-time.ts"),
    read("app/study-tracker-app.tsx"),
    read("app/goals.tsx"),
    read("app/exams.tsx"),
    read("app/data/use-workspace.ts"),
  ]);

  // One module answers "how long on this point" so a learner is never told two
  // different things about the same hour.
  assert.match(budget, /export function timeBudget/);
  assert.match(budget, /export function pointMinutes/);
  // Derived from the progress weighting rather than a second table of its own.
  assert.match(budget, /1 - progressWeight\(status\)/);

  // A goal's hours, an exam's hours, and the board reading whichever plan owns
  // the point — all three go through it.
  for (const [name, source] of [["goals", goalsView], ["exams", examsView], ["the board", shell]]) {
    assert.match(source, /from "\.\/study-time"/, `${name} should read the shared budget`);
    assert.match(source, /timeBudget\(|pointMinutes\(/, `${name} should show the time it works out`);
  }
  assert.match(goalsView, /TIME PER SYLLABUS POINT/);
  assert.match(shell, /const budgetByTopic = useMemo/);
  // The board needs the goals themselves, not just the dates they wrote.
  assert.match(workspace, /goals: \{ value: goals/);
});

test("a review board chapter folds away", async () => {
  const [shell, css] = await Promise.all([
    read("app/study-tracker-app.tsx"),
    read("app/globals.css"),
  ]);

  // A checkbox inside a label swallows any button beside it, so the disclosure
  // control is a sibling of the checkbox rather than a child of the heading.
  assert.match(shell, /className="queue-group-toggle"/);
  assert.match(shell, /aria-expanded=\{isOpen\}/);
  assert.ok(!/<label className="queue-group-heading"/.test(shell),
            "the heading should no longer be a label wrapping the toggle");
  assert.match(css, /\.queue-group\.open \.chevron/);
  // Landing on the board leaves the top of the queue open and folds the rest.
  assert.match(shell, /queueGroups\.slice\(0, 1\)/);
});

test("every colour is a token, so the app can be themed", async () => {
  const sheets = (await readdir(new URL("../app", import.meta.url)))
    .filter((name) => name.endsWith(".css") && name !== "tokens.css");
  assert.ok(sheets.length >= 6, "expected the full stylesheet set");

  // A literal here is a colour that cannot follow the theme. Eight-digit values
  // carry their own alpha and are left as they are.
  const literal = /#[0-9a-fA-F]{3}(?![0-9a-fA-F])|#[0-9a-fA-F]{6}(?![0-9a-fA-F])/;
  for (const sheet of sheets) {
    const source = await read(`app/${sheet}`);
    const found = source.match(literal);
    assert.ok(!found, `app/${sheet} still has the literal ${found?.[0]}`);
  }

  const [tokens, layout, toggle] = await Promise.all([
    read("app/tokens.css"),
    read("app/layout.tsx"),
    read("app/theme-toggle.tsx"),
  ]);
  assert.match(tokens, /--c-page:/);
  assert.match(tokens, /:root\[data-theme="dark"\]/);
  // Applied before the first paint: a theme set after it is a flash of the other.
  assert.match(layout, /dangerouslySetInnerHTML/);
  assert.match(layout, /prefers-color-scheme/);
  assert.match(layout, /colorScheme/);
  // The document is the store the button reads, so it cannot render the wrong
  // icon and then correct itself.
  assert.match(toggle, /useSyncExternalStore/);
});

test("teaches the loop at sign-up, and keeps a guide to come back to", async () => {
  const [onboarding, guide, content, shell, topics, scheduler] = await Promise.all([
    read("app/onboarding/onboarding-flow.tsx"),
    read("app/guide.tsx"),
    read("app/guide-content.ts"),
    read("app/study-tracker-app.tsx"),
    read("app/topics.ts"),
    read("lib/topics-db.ts"),
  ]);

  // Sign-up explains the loop before the app opens on the learner.
  assert.match(onboarding, /How Momentum works/);
  assert.match(onboarding, /LAST_STEP/);

  // Onboarding and the guide read the same content, so a learner cannot be told
  // one thing at sign-up and another a week later.
  assert.match(onboarding, /from "\.\.\/guide-content"/);
  assert.match(guide, /from "\.\/guide-content"/);
  assert.match(content, /export const CORE_LOOP/);

  // Every part of the app the sidebar offers is explained somewhere in it.
  for (const section of ["review-board", "subjects", "goals", "exams", "hours",
                         "papers", "flashcards", "tasks", "calendar"]) {
    assert.match(content, new RegExp(`id: "${section}"`), `the guide has no ${section} section`);
  }

  // The intervals it quotes are the scheduler's own table, not prose that can
  // drift from it: the guide cannot promise a review in three days that the
  // scheduler gives in five.
  assert.match(topics, /REVIEW_INTERVALS\[status\]/);
  assert.match(content, /REVIEW_INTERVALS/);
  assert.match(scheduler, /reviewInterval\(status/);
  assert.ok(!scheduler.includes('=== "Learning" ? 3'), "the scheduler should read the shared table");

  // A rating bends that interval and a point's share of the plan's hours, so
  // the guide quotes both factors from the tables that apply them rather than
  // describing them in prose that can drift.
  assert.match(topics, /DIFFICULTY_PACE/);
  assert.match(content, /reviewInterval\("Practising", difficulty\)/);
  assert.match(content, /share: DIFFICULTY_EFFORT\[difficulty\]/);
  assert.match(await read("app/guide.tsx"), /DIFFICULTY_GUIDE\.map/);

  // And it is a place in the app, not one screen at sign-up.
  assert.match(shell, /activeView === "Guide"/);
  assert.match(shell, /<GuideView/);
});

test("offers the IB Diploma, split by level rather than by year", async () => {
  const [directory, listing, builder, parser, stages, onboarding, catalogue, settings, importer, migration] =
    await Promise.all([
      read("data/syllabus-versions.csv"),
      read("data/ib-subjects.csv"),
      read("scripts/build_syllabus_directory.py"),
      read("scripts/parse_syllabus_content.py"),
      read("app/syllabus-stage.ts"),
      read("app/onboarding/onboarding-flow.tsx"),
      read("lib/onboarding-catalogue.ts"),
      read("app/subject-settings.tsx"),
      read("scripts/import-shared-data.mjs"),
      read("supabase/migrations/0008_stage_vocabulary.sql"),
    ]);

  const rows = directory.split("\n").filter((row) => row.startsWith("ib-dp-"));
  assert.ok(rows.length >= 170, `expected the whole DP suite, found ${rows.length}`);
  for (const row of rows) assert.equal(row.split(",")[2], "IB Diploma Programme");
  // Which the picker offers because the directory has them, not because a list
  // in the client names them.
  assert.match(onboarding, /groups\.map/);

  // A name is quoted where it carries a comma of its own.
  const listed = (subject) => listing.includes(`,${subject},`) || listing.includes(`,"${subject}",`);

  // Groups 1 to 6, the interdisciplinary courses, and the graded core.
  for (const subject of [
    "Spanish A: literature", "English A: language and literature", "Spanish B", "Spanish ab initio",
    "History", "Digital society", "Biology", "Sports, exercise and health science",
    "Mathematics: analysis and approaches", "Visual arts", "Environmental systems and societies",
    "Theory of knowledge", "Extended essay",
  ]) {
    assert.ok(listed(subject), `${subject} is not in the DP subject list`);
  }
  // Courses the IB has withdrawn are not on offer, whatever a school still calls them.
  for (const gone of ["Further mathematics", "Mathematical studies", "ITGS", "Political thought"]) {
    assert.ok(!listed(gone), `${gone} has been discontinued`);
  }

  // Which levels a subject is taught at is per-subject data, not a property of
  // the programme: about a third of the DP is standard level only, and the core
  // is graded without levels at all.
  assert.match(directory, /^ib-dp-100088,IB,IB Diploma Programme,Biology,100088,SL\|HL,/m);
  assert.match(directory, /^ib-dp-100542,IB,IB Diploma Programme,Spanish ab initio,100542,SL,/m);
  assert.match(directory, /^ib-dp-tok,IB,IB Diploma Programme,Theory of knowledge,IB-TOK,none,/m);
  assert.match(importer, /stages: text\(get\("Stages"\)\)/);
  assert.match(catalogue, /entry\.stages \?\? stagesForQualification/);
  assert.match(settings, /pick\.stages \?\? stagesForQualification/);
  assert.match(settings, /"SL \+ HL"/);

  // Unmarked content falls to A2 on an A Level and to SL in the IB: one marks
  // the first year and leaves the rest to the second, the other marks the
  // material only HL students take and leaves the rest to the level both share.
  assert.match(stages, /stages: \["AS", "A2"\],\s*\n\s*fallback: "A2"/);
  assert.match(stages, /stages: \["SL", "HL"\],\s*\n\s*fallback: "SL"/);
  assert.match(stages, /LEVELLED = \/\^IB \//);

  // A stage is the subject's own label, so nothing may check it against one
  // board's pair. Papers are the exception: a logged paper names a subject the
  // catalogue knows rather than one the learner tracks.
  for (const route of ["goals", "exams", "flashcards", "notes"]) {
    const source = await read(`app/api/${route}/route.ts`);
    assert.match(source, /(?:subjectStages|getSubject)\(workspaceId/, `/api/${route} should read the subject's own stages`);
    assert.ok(!source.includes('["AS", "A2"]'), `/api/${route} still checks one board's stages`);
  }
  assert.match(migration, /drop constraint/);
  assert.match(migration, /add column stages text/);

  // The IB is listed, not crawled: ibo.org answers the builder with a bot
  // challenge, and a subject guide is not public in any case.
  assert.match(builder, /"ib", \(/);
  const suite = builder.slice(builder.indexOf("def ib_rows"), builder.indexOf("def existing_notes"));
  assert.match(suite, /IB_SUBJECTS/);
  assert.ok(!/fetch\(|verify\(/.test(suite), "the IB suite should not reach the network");
  // Which leaves 173 rows with no PDF behind them, and nothing to fetch.
  assert.match(parser, /row\["Syllabus_PDF_URL"\]/);

  // What those rows are read from instead: the course's public subject brief,
  // saved into data/ib-briefs by hand. Board content is never committed.
  const [reader, ignored] = await Promise.all([read("scripts/parse_ib.py"), read(".gitignore")]);
  assert.match(parser, /from parse_ib import parse as parse_ib/);
  assert.match(parser, /IB_BRIEFS = ROOT \/ "data" \/ "ib-briefs"/);
  assert.match(parser, /def brief_path/);
  assert.match(ignored, /data\/ib-briefs/);

  // A brief carries the outline, and the marker on a topic only HL students take
  // — an asterisk in the sciences, three dots in physics — files it under HL.
  assert.match(reader, /HL_STAR/);
  assert.match(reader, /HL_DOTS/);
  // Naming the downloads is the installer's job, not the reader's.
  const installer = await read("scripts/install_ib_briefs.py");
  assert.match(installer, /data\/ib-briefs|BRIEFS = ROOT/);
  // And only files that say they are subject briefs: a folder of downloads holds
  // past papers and revision notes that name the same subjects.
  assert.match(installer, /IS_BRIEF/);
  assert.match(installer, /def title_zone/);
  // The older briefs set that table in two columns, which the text layer reads
  // out of order. An outline built from those halves was never in the brief.
  assert.match(reader, /FRAGMENT_LIMIT/);
});

test("every shell carries the copyright line, from one source", async () => {
  const footer = await read("app/site-footer.tsx");

  // Written once. A second copy is how two pages end up disagreeing about the
  // year, which is the one thing a copyright notice cannot afford to do.
  assert.match(footer, /© 2026 Momentum Studies\. All rights reserved\./);

  // Each shell renders it, because they do not share a bottom: the signed-in
  // app is a sticky full-height sidebar beside a scrolling column, and the auth
  // and setup screens centre a card in the viewport.
  const shells = {
    "app/study-tracker-app.tsx": "the signed-in app",
    "app/login/page.tsx": "sign in",
    "app/signup/page.tsx": "sign up",
    "app/check-email/page.tsx": "confirm your email",
    "app/onboarding/page.tsx": "setup",
  };
  for (const [path, name] of Object.entries(shells)) {
    const source = await read(path);
    assert.match(source, /<SiteFooter \/>/, `${name} does not render the footer`);
    assert.match(source, /from "\.\.?\/site-footer"/, `${name} does not import it from the shared module`);
    assert.ok(!source.includes("All rights reserved"), `${name} writes its own copy of the notice`);
  }

  // The signed-in app puts it inside the column that scrolls. After the section
  // it would land in the sidebar's grid track and be painted over by it.
  const shell = await read("app/study-tracker-app.tsx");
  assert.match(shell, /<SiteFooter \/>\s*<\/section>/, "the footer should close the workspace, not follow it");

  // Both centred grids name their rows, so the card keeps the free space and
  // the footer takes the bottom rather than splitting it.
  const auth = await read("app/auth.css");
  for (const rule of [".auth-main", ".onboarding-shell"]) {
    const block = auth.slice(auth.indexOf(`${rule} {`), auth.indexOf("}", auth.indexOf(`${rule} {`)));
    assert.match(block, /grid-template-rows: 1fr auto/, `${rule} would push its card off centre`);
  }
});

test("an exam answers the same four questions a syllabus goal does", async () => {
  const exams = await read("app/exams.tsx");

  // A goal says how long is left, how fast that means going, whether the plan
  // is being kept to, and whether the promised hours are going in. An exam is
  // the same plan with a date that cannot move, so it says all four too.
  for (const metric of ["Time remaining", "Required pace", "Exam readiness", "Study hours"]) {
    assert.match(exams, new RegExp(`<span>${metric}</span>`), `the exam card does not report ${metric}`);
  }
  assert.match(exams, /examReadiness/);
  // Hours count towards an exam only when they went on its own topics — the
  // rest of the subject is not preparation for this paper — and a chapter
  // ticked in the hours log stands for the points inside it.
  assert.match(exams, /weekMinutes\(sessions, examTopicKeys\(exam, topicLookup\), today\)/);
  assert.match(exams, /keys\.has\(topic\.id\)/, "study hours should be filtered to the exam's topics");
  assert.match(exams, /if \(parentId\) keys\.add\(parentId\)/, "a chapter should stand for its points");
  assert.ok(!/weekMinutes\(sessions, exam\.subjectId/.test(exams), "study hours should not count the whole subject");
  assert.match(exams, /onTrack \? "on-track" : "behind"/);

  // Ticking a topic off the revision plan is the review board's own write, not
  // a second way to record the same thing.
  assert.match(exams, /type="checkbox"/, "the revision plan should be tickable");
  assert.match(exams, /updateTopic\(topic, \{ status: event\.target\.checked/);
  const shell = await read("app/study-tracker-app.tsx");
  assert.match(shell, /<ExamPlanner[^>]*updateTopic=\{updateTopic\}/, "the shell should lend the exam planner its writer");
  assert.match(shell, /<ExamPlanner[^>]*sessions=\{studySessions\}/);
});

test("both planners' metric cards are styled by the same rules", async () => {
  // The cards were built for goals and lent to exams. Every rule that dresses
  // one has to name the other, or an exam card silently loses an accent — which
  // is how the readiness card shipped blue while reporting you were behind, and
  // how the exam cards later ended up a size tighter than the identical cards
  // next door. Every sheet, not just globals: the theme layer loads last and is
  // where most of these rules actually win.
  const sheets = ["app/globals.css", "app/friendly-theme.css", "app/features.css", "app/exams.css"];
  const missing = [];
  for (const sheet of sheets) {
    const css = await read(sheet);
    for (const match of css.matchAll(/\.goal-metrics(?![-\w])[^,{]*/g)) {
      const selector = match[0].trim();
      const twin = `.exam-metrics${selector.slice(".goal-metrics".length)}`;
      if (!css.includes(twin)) missing.push(`${sheet}: ${selector}`);
    }
  }
  assert.deepEqual(missing, [], `these goal-metric rules do not cover .exam-metrics:\n  ${missing.join("\n  ")}`);
});

test("the type scale climbs, and starts above a footnote", async () => {
  const tokens = await read("app/tokens.css");
  const steps = ["3xs", "2xs", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl"]
    .map((step) => {
      const found = tokens.match(new RegExp(`--text-${step}: (\\d+)px`));
      assert.ok(found, `--text-${step} is missing`);
      return Number(found[1]);
    });
  // The smallest step carries real information — a status, a due date, the
  // minutes on a row — so it is not allowed back down to a footnote.
  assert.ok(steps[0] >= 11, `the smallest step is ${steps[0]}px`);
  for (let i = 1; i < steps.length; i += 1) {
    assert.ok(steps[i] > steps[i - 1], `step ${i} (${steps[i]}px) does not exceed ${steps[i - 1]}px`);
  }
});

test("a course with every paper sat can actually be saved", async () => {
  const [route, migrations, client] = await Promise.all([
    read("app/api/grade-targets/route.ts"),
    readdir(new URL("../supabase/migrations/", import.meta.url))
      .then((files) => Promise.all(files.filter((name) => name.endsWith(".sql"))
        .sort().map((name) => read(`supabase/migrations/${name}`))))
      .then((all) => all.join("\n")),
    read("app/grades.tsx"),
  ]);

  // The banked share was capped at 95 while it was a number a learner typed.
  // Papers can settle the whole award, and every ceiling on the way in has to
  // agree — the check constraint, the route, and the form's own input.
  assert.doesNotMatch(route, /between 0 and 95/);
  assert.doesNotMatch(route, /weight > 95/);
  assert.match(migrations, /completed_weight >= 0 and completed_weight <= 100/);
  assert.doesNotMatch(client, /min="5" max="95"/);

  // A share counted from papers is rarely a whole number: 9702's are 15.5, 23,
  // 11.5 and 38.5 of the A Level.
  assert.doesNotMatch(route, /Number\.isInteger\(weight\)/);
  assert.match(migrations, /alter column completed_weight type double precision/);

  // A finished course belongs to no stage, so the rule that a banked result
  // names its stage has to exempt a whole one.
  assert.match(migrations, /completed_weight >= 99\.95/);
  assert.match(route, /const finished = weight >= 99\.95/);

  // And the percentage the ladder reads has to reach the server, or the route
  // rejects a form that has just finished computing it.
  assert.match(client, /completedPercent: usingPapers \? fromPapers\.completedPercent/);

  // Which stage a banked result came from is a question only a typed-in mark
  // raises. Papers answer it themselves, so neither the route nor the schema
  // may demand one of a target that has them.
  assert.match(route, /const needsStage = banked && !finished && !components\.length/);
  assert.doesNotMatch(migrations.split("0017")[1] ?? "", /add constraint grade_targets_banked_names_its_stage/);
  assert.match(migrations, /drop constraint grade_targets_banked_names_its_stage/);

  // A row with no stage must not print an empty name where one would go.
  assert.match(client, /of the grade banked at/);
});

test("one panel heading spaces itself like every other", async () => {
  const [theme, exams, features] = await Promise.all([
    read("app/friendly-theme.css"),
    read("app/exams.css"),
    read("app/features.css"),
  ]);

  // Every panel body in the app starts flush against the heading's rule, so the
  // space under the lettering is the heading's alone. It was carrying a full
  // step of it plus a min-height that centring spent putting back whatever a
  // shorter padding took away — and two panels had been patched around that one
  // at a time, which is how the same screen ends up with two spacings.
  assert.match(theme, /\.section-heading \{ min-height: 0; padding: var\(--space-5\) var\(--space-6\) var\(--space-3\); /);
  assert.doesNotMatch(theme, /\.section-heading \{ min-height: 76px/);
  assert.doesNotMatch(exams, /\.exam-planner \.section-heading/);
  assert.doesNotMatch(features, /\.due-task-panel>\.section-heading/);
});

test("a stage already sat leaves the board without leaving the account", async () => {
  const [shell, subjects, settings, route, db] = await Promise.all([
    read("app/study-tracker-app.tsx"),
    read("app/subjects.ts"),
    read("app/subject-settings.tsx"),
    read("app/api/subjects/route.ts"),
    read("lib/subjects-db.ts"),
  ]);

  // The flag is on the stage, not the subject: archiving a subject takes the
  // half still to be sat with it, which is the half that matters.
  assert.match(subjects, /export function stageIsDone/);
  assert.match(db, /completed_stages_json/);
  // Only a stage the subject actually has can be marked, or re-splitting the
  // course would retire points nothing could bring back.
  assert.match(route, /function cleanCompletedStages/);
  assert.match(db, /\.filter\(\(stage\) => stages\.includes\(stage\)\)/);

  // What it changes: the queue, the counters and the calendar all read the
  // syllabus that is still ahead.
  assert.match(shell, /const retiredIds = useMemo/);
  assert.match(shell, /const liveTopics = useMemo/);
  assert.match(shell, /liveTopics\.filter\(\(topic\) => topic\.kind === "point"\)/);
  assert.match(shell, /<CalendarView topics={liveTopics}/);

  // And what it must not change: nothing is deleted, so the search still finds
  // it and the syllabus view still shows it.
  const opens = shell.indexOf("const searchResults = useMemo");
  assert.ok(opens > -1, "the search memo should still be findable");
  const search = shell.slice(opens, shell.indexOf("}, [", opens));
  assert.match(search, /return topics\.filter/, "search should read the whole syllabus");
  assert.doesNotMatch(search, /liveTopics/, "a stage already sat must still be searchable");

  // Both places a learner would look for the control.
  assert.match(shell, /stage-sat-toggle/);
  assert.match(settings, /subject-row-stages/);
  for (const source of [shell, settings]) assert.match(source, /onStageDone/);
});

test("every row on the board says which plan put it there", async () => {
  const shell = await read("app/study-tracker-app.tsx");
  const calendar = await read("app/calendar.tsx");

  // Three plans can schedule a topic, and the row names whichever one owns the
  // date it is showing. A spaced review is the commonest of the three and used
  // to be the one that arrived unlabelled.
  assert.match(shell, /function dueSource/);
  assert.match(shell, /kind: "exam-task", label: exam\.title/);
  assert.match(shell, /kind: "goal-task", label: "Goal plan"/);
  assert.match(shell, /kind: "review", label: "Review"/);
  assert.match(shell, /className={`review-source \${source\.kind}`}/);

  // In the calendar's vocabulary, not a second one. A learner who has learnt
  // what a colour means on one screen should not have to learn it again on the
  // other, so every kind the board hands out has to be one the calendar knows.
  const known = new Set([...calendar.matchAll(/\{ kind: "([\w-]+)"/g)].map((match) => match[1]));
  const used = [...shell.matchAll(/kind: "([\w-]+)", label:/g)].map((match) => match[1]);
  assert.ok(used.length >= 3, `expected every source to be named, found ${used.length}`);
  for (const kind of used) {
    assert.ok(known.has(kind), `the board invents a source the calendar has no name for: ${kind}`);
  }

  // And the chip is painted per kind, or they would all read the same.
  const css = await read("app/globals.css");
  for (const kind of used.filter((kind) => kind !== "review")) {
    assert.ok(css.includes(`.review-source.${kind}{`), `.review-source.${kind} has no colour of its own`);
  }
});

test("rating a point never takes it off the review board", async () => {
  const db = await read("lib/topics-db.ts");

  // The board holds everything due within seven days. Rating a Practising point
  // easy used to move its review from reviewed+7 to reviewed+11, which lifted
  // the row out of that window and made it vanish under the hand that rated it
  // — and, worse, discharged a review that was already owed.
  assert.match(db, /function ratedReviewDue/);
  assert.match(db, /return scheduled < current \? scheduled : current;/,
    "a rating must keep whichever date is sooner");

  // Both writing paths take the rule: one row from the board, and a selection
  // rated together from the bulk bar.
  const clamped = [...db.matchAll(/rateOnly \? ratedReviewDue\(/g)];
  assert.equal(clamped.length, 2, "the single and bulk updates should both clamp");

  // And only a rating is clamped. A status change or a logged review still
  // reschedules from today, which is what they are for.
  assert.match(db, /: scheduled;/);

  // What the app promises about it, in the two places it says so.
  const shell = await read("app/study-tracker-app.tsx");
  assert.match(shell, /Rated hard — its review comes sooner/);
  assert.match(shell, /Rated easy — it will wait longer after the next review/);
  const guide = await read("app/guide-content.ts");
  assert.match(guide, /never defers a review you already owe/);
});

test("the review board shows every point that is due, not the first thirty", async () => {
  const shell = await read("app/study-tracker-app.tsx");
  const route = await read("app/api/topics/route.ts");

  // The queue was sliced to thirty while the counters above it reported the
  // real total, so a learner with a backlog was told about work the board would
  // not show — and anything past the cut could not be reached at all.
  assert.ok(!/queue\.slice\(0, *\d+\)/.test(shell), "the queue must not be truncated");
  assert.match(shell, /queue\.forEach\(\(topic\) => \{/);

  // Folding is what keeps a long board readable, not hiding rows: a closed
  // chapter renders none of them, so grouping the lot stays cheap.
  assert.match(shell, /\{isOpen && \(/);

  // A full board can now hand more ids to "Select all" than the route accepts
  // in one go, so the selection is sent in parts rather than rejected whole.
  assert.match(shell, /const SELECTION_LIMIT = 200;/);
  assert.match(shell, /start \+= SELECTION_LIMIT/);
  assert.match(route, /ids\.length > 200/, "the client's limit should be the route's own");
});

test("the front door is a landing page, not a redirect to a sign-in form", async () => {
  const page = await read("app/page.tsx");
  const session = await read("lib/supabase/session.ts");

  // Signed out, / is the marketing page. It used to redirect to /login, which
  // left the product with no indexable address at all.
  assert.match(page, /if \(!session\) return <Landing/);
  assert.match(page, /landingStats\(\)/);
  assert.match(session, /PUBLIC_EXACT = \["\/", "\/robots\.txt", "\/sitemap\.xml"\]/);

  // Exactly, not as a prefix: everything under / stays behind a session.
  assert.match(session, /PUBLIC_EXACT\.includes\(pathname\)/);
});

test("the landing page is indexable, and says nothing the product cannot do", async () => {
  const landing = await read("app/landing.tsx");
  const layout = await read("app/layout.tsx");
  const features = await read("FEATURES.md");

  // One h1, sections a crawler can follow, and machine-readable answers.
  assert.equal((landing.match(/<h1>/g) ?? []).length, 1, "a page has one h1");
  assert.match(landing, /application\/ld\+json/);
  assert.match(landing, /"@type": "WebApplication"/);
  assert.match(landing, /"@type": "FAQPage"/);
  assert.match(layout, /metadataBase/);
  assert.match(layout, /alternates: \{ canonical/);
  assert.ok(await read("app/robots.ts"));
  assert.ok(await read("app/sitemap.ts"));

  // FEATURES.md is the reference for this copy and carries rules with it. The
  // three that would actually mislead a student are enforced here.
  assert.match(features, /Do not call it "AI-powered"/);
  for (const banned of [/AI[- ]powered/i, /grade guarantee/i, /boost your grades/i]) {
    assert.ok(!banned.test(landing), `landing copy uses banned phrasing: ${banned}`);
  }
  // Nothing on the "not built yet" list may be implied.
  for (const absent of [/sign in with google/i, /download the app/i, /app store/i, /per month/i, /pricing/i]) {
    assert.ok(!absent.test(landing), `landing copy promises something unbuilt: ${absent}`);
  }

  // Numbers on a public page are claims, so they are read rather than typed.
  assert.match(landing, /number\(stats\.subjects\)/);
  assert.match(await read("lib/landing-stats.ts"), /FROM catalogue_papers/);
});

test("every landing screenshot is real, described, and follows the reader's theme", async () => {
  const landing = await read("app/landing.tsx");
  const names = [...landing.matchAll(/file: "([\w-]+)"/g)].map((match) => match[1]);
  assert.ok(names.length >= 4, `expected the app's screens, found ${names.length}`);

  for (const name of names) {
    // Both themes exist on disk: the app follows the reader's, and a page that
    // showed a light product to someone reading in the dark would not.
    for (const theme of ["light", "dark"]) {
      const file = `public/shots/${name}-${theme}.png`;
      await assert.doesNotReject(read(file), `${file} is missing`);
    }
  }
  assert.match(landing, /media="\(prefers-color-scheme: dark\)"/);

  // Alt text that describes what the screenshot shows, not "screenshot".
  const alts = [...landing.matchAll(/alt: "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(alts.length, names.length, "every shot needs alt text");
  for (const alt of alts) {
    assert.ok(alt.length > 60, `alt text is too thin to be useful: "${alt}"`);
    assert.ok(!/^screenshot/i.test(alt), `alt text should describe the screen: "${alt}"`);
  }
});

test("the landing page leads with the six features the product is for", async () => {
  const landing = await read("app/landing.tsx");
  const names = [...landing.matchAll(/file: "([\w-]+)"/g)].map((match) => match[1]);

  // Named because they are the pitch. A page that gives twelve features equal
  // weight tells a reader nothing about which one to come for, which is what
  // the first version of this page did.
  const pillars = [...landing.matchAll(/eyebrow: "([A-Z ]+)"/g)].map((match) => match[1]);
  assert.deepEqual(pillars, [
    "REVIEW BOARD",
    "SYLLABUS IMPORT",
    "SYLLABUS GOALS",
    "EXAM PLANNING",
    "PAST PAPERS",
    "STUDY LOG",
  ]);

  // Each carries a screenshot of its own screen, and the review board leads:
  // it is the screen the rest of the product feeds.
  const shots = [...landing.matchAll(/shot: "([\w-]+)" as const/g)].map((match) => match[1]);
  assert.equal(shots.length, pillars.length, "every pillar needs its own screenshot");
  assert.equal(shots[0], "review-board");
  // The review board leads, and any pillar may claim the full width — the paper
  // catalogue is a table, and a table in half a column is unreadable.
  assert.match(landing, /index === 0 \|\| "wide" in pillar \? "lead"/);
  assert.match(landing, /shot: "past-papers" as const,\s*\n\s*wide: true,/);

  // The two screens a single frame cannot make the case for: the board's
  // counters mean nothing without the queue they are counting, and a goal's
  // summary is a summary of a chapter timeline the first shot stops above.
  // Both get a second frame, and both therefore have to run full width.
  const paired = [...landing.matchAll(/shot2: "([\w-]+)" as const/g)].map((match) => match[1]);
  assert.deepEqual(paired, ["review-queue", "goal-detail"]);
  for (const name of paired) {
    assert.ok(names.includes(name), `${name} needs an entry in SHOTS`);
  }
  assert.match(landing, /shot2: "goal-detail" as const,\s*\n\s*wide: true,/);
  // A second frame with no caption is just a bigger picture: each one says what
  // it adds that the frame above it did not.
  assert.equal((landing.match(/caption2: "/g) ?? []).length, paired.length);

  // Difficulty is a claim about the exam boards' own numbers, so the copy says
  // where it comes from rather than presenting it as an opinion of ours.
  assert.match(landing, /grade boundaries actually landed/);
  assert.match(landing, /Difficulty read from the paper's own grade thresholds/);

  // Everything else is listed as what comes with them, not sold beside them.
  assert.match(landing, /Everything else comes with them/);
  // Scoped to the array itself: the three-step loop above it is written the
  // same way, and counting both made the secondary list look twice its size.
  const alsoBlock = landing.match(/const ALSO = \[[\s\S]*?\n\];/)?.[0] ?? "";
  const also = [...alsoBlock.matchAll(/title: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(also.length > 0 && also.length <= 8, `the secondary list should stay short, found ${also.length}`);
  for (const secondary of also) {
    assert.ok(!pillars.includes(secondary.toUpperCase()), `${secondary} is both a pillar and a footnote`);
  }
});
