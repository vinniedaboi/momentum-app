// Migrates the single-user Cloudflare D1 database into one Supabase workspace.
//
//   node scripts/import-legacy-d1.mjs --email you@example.com
//   node scripts/import-legacy-d1.mjs --workspace <uuid> --sqlite path/to.sqlite
//   node scripts/import-legacy-d1.mjs --email you@example.com --dry-run
//
// The target account must already exist — sign up through the app first. Every
// tenant row already in that workspace is replaced, so this is a migration, not
// a merge. Run it once; running it twice is safe and idempotent.
//
// `--shared` also copies the parsed syllabus_content rows into the shared table,
// which the Node importer cannot produce on its own (they come from the Python
// PDF parser).

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import postgres from "postgres";

const DEFAULT_D1_DIR = "../Study Tracker Project/study-tracker-app/.wrangler/state/v3/d1/miniflare-D1DatabaseObject";

function readArg(name, fallback = undefined) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

/** Largest .sqlite in the Miniflare D1 directory is the app database. */
function findSqlite() {
  const explicit = readArg("sqlite");
  if (explicit) return resolve(explicit);
  const dir = resolve(DEFAULT_D1_DIR);
  const candidates = readdirSync(dir)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => ({ path: join(dir, name), size: statSync(join(dir, name)).size }))
    .sort((a, b) => b.size - a.size);
  if (!candidates.length) throw new Error(`No D1 database found in ${dir}`);
  return candidates[0].path;
}

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(resolve(".env.local"), "utf8");
  const match = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  if (!match) throw new Error("DATABASE_URL is not set.");
  return match[1].trim();
}

const bool = (value) => value === 1 || value === true || value === "1";
const orNull = (value) => (value === undefined ? null : value);

const sqlitePath = findSqlite();
const d1 = new DatabaseSync(sqlitePath, { readOnly: true });
const all = (query, ...params) => d1.prepare(query).all(...params);

/** Tables the source may or may not have, depending on how old it is. */
function tableExists(name) {
  return d1.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}
const read = (name, query) => (tableExists(name) ? all(query) : []);

// ---------------------------------------------------------------- extract

const subjects = read("subjects", "SELECT * FROM subjects ORDER BY position, id");
const topics = read("topics", "SELECT * FROM topics ORDER BY CASE kind WHEN 'chapter' THEN 0 ELSE 1 END, source_row");
const activity = read("topic_activity", "SELECT * FROM topic_activity ORDER BY id");
const sessions = read("study_sessions", "SELECT * FROM study_sessions ORDER BY id");
const sessionTopics = read("study_session_topics", "SELECT * FROM study_session_topics");
const tasks = read("study_tasks", "SELECT * FROM study_tasks ORDER BY id");
const goals = read("study_goals", "SELECT * FROM study_goals");
const decks = read("flashcard_decks", "SELECT * FROM flashcard_decks ORDER BY id");
const cards = read("flashcards", "SELECT * FROM flashcards ORDER BY id");
const papers = read("past_papers", "SELECT * FROM past_papers ORDER BY id");
const paperMeta = read("paper_meta", "SELECT * FROM paper_meta");
const notes = read("note_files", "SELECT * FROM note_files ORDER BY id");
const syllabusContent = read("syllabus_content", "SELECT * FROM syllabus_content ORDER BY record_id, seq");

console.log(`source: ${sqlitePath}`);
console.log(
  [
    `subjects ${subjects.length}`, `topics ${topics.length}`, `activity ${activity.length}`,
    `sessions ${sessions.length}`, `session_topics ${sessionTopics.length}`, `tasks ${tasks.length}`,
    `goals ${goals.length}`, `decks ${decks.length}`, `cards ${cards.length}`,
    `papers ${papers.length}`, `paper_meta ${paperMeta.length}`, `notes ${notes.length}`,
  ].join(", "),
);

if (notes.length) {
  console.warn(
    `\n  WARNING: ${notes.length} note_files rows reference Cloudflare R2 objects that do not exist\n` +
    "  in Supabase Storage. Their metadata is imported, but the downloads will 404.\n",
  );
}

if (hasFlag("dry-run")) {
  console.log("\ndry run — nothing written.");
  process.exit(0);
}

// ---------------------------------------------------------------- load

const sql = postgres(connectionString(), { prepare: false, max: 1, connect_timeout: 30 });

/**
 * Bulk insert for tables whose ids are generated fresh. Tables whose ids must
 * survive the move (anything another table points at) are inserted row by row
 * below with OVERRIDING SYSTEM VALUE, which identity columns require.
 */
async function insertRows(tx, table, rows, columns) {
  if (!rows.length) return;
  for (let start = 0; start < rows.length; start += 500) {
    const chunk = rows.slice(start, start + 500);
    await tx`INSERT INTO ${tx(table)} ${tx(chunk, ...columns)}`;
  }
}

try {
  const workspaceArg = readArg("workspace");
  const email = readArg("email");

  const profiles = workspaceArg
    ? await sql`SELECT id, email FROM profiles WHERE id = ${workspaceArg}`
    : email
      ? await sql`SELECT id, email FROM profiles WHERE lower(email) = ${email.toLowerCase()}`
      : [];

  if (!profiles.length) {
    throw new Error(
      workspaceArg || email
        ? `No account found for ${workspaceArg ?? email}. Sign up in the app first, then re-run.`
        : "Pass --email <address> or --workspace <uuid>.",
    );
  }
  const ws = profiles[0].id;
  console.log(`\ntarget: ${profiles[0].email} (${ws})`);

  await sql.begin(async (tx) => {
    // Deleting the subjects cascades topics, activity, sessions, tasks, goals,
    // decks, cards and papers. paper_meta and note_files hang off the profile.
    await tx`DELETE FROM subjects WHERE workspace_id = ${ws}`;
    await tx`DELETE FROM paper_meta WHERE workspace_id = ${ws}`;
    await tx`DELETE FROM note_files WHERE workspace_id = ${ws}`;
    await tx`DELETE FROM study_sessions WHERE workspace_id = ${ws}`;

    await insertRows(tx, "subjects", subjects.map((r) => ({
      workspace_id: ws, id: r.id, name: r.name, short_name: orNull(r.short_name),
      tone: r.tone ?? "blue", board: orNull(r.board), qualification: orNull(r.qualification),
      syllabus_code: orNull(r.syllabus_code),
      stages_json: r.stages_json ?? '["AS","A2"]', paper_stages_json: r.paper_stages_json ?? "{}",
      position: r.position ?? 0, archived: bool(r.archived),
      created_at: r.created_at, updated_at: r.updated_at,
    })), [
      "workspace_id", "id", "name", "short_name", "tone", "board", "qualification",
      "syllabus_code", "stages_json", "paper_stages_json", "position", "archived",
      "created_at", "updated_at",
    ]);

    // topics was read chapters-first so the self-referencing parent_id resolves.
    await insertRows(tx, "topics", topics.map((r) => ({
      workspace_id: ws, id: r.id, subject_id: r.subject_id, source_row: r.source_row,
      paper: orNull(r.paper), academic_level: orNull(r.academic_level), retake: bool(r.retake),
      section: orNull(r.section), code: r.code, title: r.title, kind: r.kind,
      parent_id: orNull(r.parent_id), in_scope: bool(r.in_scope), status: r.status,
      covered: bool(r.covered), confidence: orNull(r.confidence),
      reviewed_on: orNull(r.reviewed_on), reviewed_at: orNull(r.reviewed_at),
      review_due: orNull(r.review_due), goal_due: orNull(r.goal_due),
      exam_questions: r.exam_questions ?? 0, last_test_pct: orNull(r.last_test_pct),
      priority: orNull(r.priority), notes: orNull(r.notes), updated_at: r.updated_at,
    })), [
      "workspace_id", "id", "subject_id", "source_row", "paper", "academic_level", "retake",
      "section", "code", "title", "kind", "parent_id", "in_scope", "status", "covered",
      "confidence", "reviewed_on", "reviewed_at", "review_due", "goal_due", "exam_questions",
      "last_test_pct", "priority", "notes", "updated_at",
    ]);

    await insertRows(tx, "topic_activity", activity.map((r) => ({
      workspace_id: ws, topic_id: r.topic_id, event_type: r.event_type,
      from_status: orNull(r.from_status), to_status: orNull(r.to_status),
      note: orNull(r.note), occurred_at: r.occurred_at,
    })), ["workspace_id", "topic_id", "event_type", "from_status", "to_status", "note", "occurred_at"]);

    // Session ids are preserved so study_session_topics keeps pointing at the
    // right rows; the identity sequence is realigned afterwards.
    for (const r of sessions) {
      await tx`
        INSERT INTO study_sessions (id, workspace_id, study_date, minutes, subject_id, note, created_at, updated_at)
        OVERRIDING SYSTEM VALUE
        VALUES (${r.id}, ${ws}, ${r.study_date}, ${r.minutes}, ${orNull(r.subject_id)},
                ${orNull(r.note)}, ${r.created_at}, ${r.updated_at})
      `;
    }

    await insertRows(tx, "study_session_topics", sessionTopics.map((r) => ({
      workspace_id: ws, session_id: r.session_id, topic_id: r.topic_id,
    })), ["workspace_id", "session_id", "topic_id"]);

    await insertRows(tx, "study_tasks", tasks.map((r) => ({
      workspace_id: ws, title: r.title, subject_id: r.subject_id, due_date: r.due_date,
      priority: r.priority ?? "medium", labels_json: r.labels_json ?? "[]",
      completed: bool(r.completed), completed_at: orNull(r.completed_at),
      created_at: r.created_at, updated_at: r.updated_at,
    })), [
      "workspace_id", "title", "subject_id", "due_date", "priority", "labels_json",
      "completed", "completed_at", "created_at", "updated_at",
    ]);

    await insertRows(tx, "study_goals", goals.map((r) => ({
      workspace_id: ws, subject_id: r.subject_id, stage: r.stage ?? "A2",
      start_date: r.start_date, target_date: r.target_date,
      weekly_hours: r.weekly_hours ?? 10, study_days: r.study_days ?? 5,
      pace_mode: r.pace_mode ?? "steady", schedule_applied_at: orNull(r.schedule_applied_at),
      created_at: r.created_at, updated_at: r.updated_at,
    })), [
      "workspace_id", "subject_id", "stage", "start_date", "target_date", "weekly_hours",
      "study_days", "pace_mode", "schedule_applied_at", "created_at", "updated_at",
    ]);

    for (const r of decks) {
      await tx`
        INSERT INTO flashcard_decks (id, workspace_id, title, subject_id, stage, chapter_id, created_at, updated_at)
        OVERRIDING SYSTEM VALUE
        VALUES (${r.id}, ${ws}, ${r.title}, ${orNull(r.subject_id)}, ${orNull(r.stage)},
                ${orNull(r.chapter_id)}, ${r.created_at}, ${r.updated_at})
      `;
    }
    for (const r of cards) {
      await tx`
        INSERT INTO flashcards (id, workspace_id, deck_id, front, back, mastery, last_reviewed_at, created_at, updated_at)
        OVERRIDING SYSTEM VALUE
        VALUES (${r.id}, ${ws}, ${r.deck_id}, ${r.front}, ${r.back}, ${r.mastery ?? 0},
                ${orNull(r.last_reviewed_at)}, ${r.created_at}, ${r.updated_at})
      `;
    }
    for (const r of papers) {
      await tx`
        INSERT INTO past_papers (
          id, workspace_id, paper_id, subject_id, stage, board, paper, variant, session, year,
          attempt_date, score, max_score, percentage, grade, duration_minutes, conditions,
          status, weak_topics_json, notes, created_at, updated_at
        )
        OVERRIDING SYSTEM VALUE
        VALUES (
          ${r.id}, ${ws}, ${orNull(r.paper_id)}, ${r.subject_id}, ${r.stage ?? "A2"}, ${orNull(r.board)},
          ${r.paper}, ${orNull(r.variant)}, ${r.session ?? "May/June"}, ${r.year}, ${r.attempt_date},
          ${orNull(r.score)}, ${orNull(r.max_score)}, ${orNull(r.percentage)}, ${orNull(r.grade)},
          ${orNull(r.duration_minutes)}, ${r.conditions ?? "Timed"}, ${r.status ?? "done"},
          ${r.weak_topics_json ?? "[]"}, ${orNull(r.notes)}, ${r.created_at}, ${r.updated_at}
        )
      `;
    }

    await insertRows(tx, "paper_meta", paperMeta.map((r) => ({
      workspace_id: ws, paper_id: r.paper_id, difficulty: orNull(r.difficulty),
      resource_url: orNull(r.resource_url), updated_at: r.updated_at,
    })), ["workspace_id", "paper_id", "difficulty", "resource_url", "updated_at"]);

    for (const r of notes) {
      await tx`
        INSERT INTO note_files (id, workspace_id, storage_key, original_name, content_type, size_bytes, subject_id, stage, chapter_id, created_at)
        OVERRIDING SYSTEM VALUE
        VALUES (${r.id}, ${ws}, ${r.storage_key}, ${r.original_name}, ${r.content_type},
                ${r.size_bytes}, ${orNull(r.subject_id)}, ${orNull(r.stage)}, ${orNull(r.chapter_id)}, ${r.created_at})
      `;
    }

    // Realign every identity sequence past the ids we forced in.
    for (const table of ["topic_activity", "study_sessions", "study_tasks", "flashcard_decks", "flashcards", "past_papers", "note_files"]) {
      await tx.unsafe(
        `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`,
      );
    }

    // Imported data means onboarding is already answered.
    await tx`
      UPDATE profiles SET onboarded_at = COALESCE(onboarded_at, now()), updated_at = now()
      WHERE id = ${ws}
    `;
  });

  if (hasFlag("shared") && syllabusContent.length) {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM syllabus_content`;
      await insertRows(tx, "syllabus_content", syllabusContent.map((r) => ({
        record_id: r.record_id, syllabus_code: r.syllabus_code, seq: r.seq, code: r.code,
        kind: r.kind, parent_code: orNull(r.parent_code), title: r.title,
        academic_level: orNull(r.academic_level),
      })), ["record_id", "syllabus_code", "seq", "code", "kind", "parent_code", "title", "academic_level"]);
    });
    console.log(`syllabus_content: ${syllabusContent.length} shared rows`);
  }

  const [summary] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM subjects        WHERE workspace_id = ${ws}) AS subjects,
      (SELECT COUNT(*)::int FROM topics          WHERE workspace_id = ${ws}) AS topics,
      (SELECT COUNT(*)::int FROM topic_activity  WHERE workspace_id = ${ws}) AS activity,
      (SELECT COUNT(*)::int FROM study_sessions  WHERE workspace_id = ${ws}) AS sessions,
      (SELECT COUNT(*)::int FROM study_goals     WHERE workspace_id = ${ws}) AS goals,
      (SELECT COUNT(*)::int FROM topics          WHERE workspace_id = ${ws} AND review_due IS NOT NULL) AS scheduled
  `;
  console.log("\nimported:", JSON.stringify(summary));
  console.log("done.");
} finally {
  await sql.end();
}
