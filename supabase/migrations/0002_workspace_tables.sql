-- Workspace-scoped study data.
--
-- Timestamp and date columns are deliberately `text`, holding ISO-8601 strings
-- ('2026-08-28T01:00:00.000Z') and plain dates ('2026-08-28'). The tracker was
-- built on SQLite and does all of its date arithmetic in JavaScript; ISO text
-- sorts chronologically, so keeping the storage format identical avoids a
-- behavioural rewrite of every read path. New tables (profiles) use timestamptz.

create table public.subjects (
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  id text not null,
  name text not null,
  short_name text,
  tone text not null default 'blue',
  board text,
  qualification text,
  syllabus_code text,
  -- Empty array means the subject has no AS/A2 split (IGCSE and similar).
  stages_json text not null default '["AS","A2"]',
  -- Maps a paper label to a stage, e.g. {"P1":"AS","P5":"AS"}.
  paper_stages_json text not null default '{}',
  position integer not null default 0,
  archived boolean not null default false,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id, id)
);

create index idx_subjects_workspace_position on public.subjects (workspace_id, position);

create table public.topics (
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  id text not null,
  subject_id text not null,
  source_row integer not null,
  paper text,
  academic_level text,
  retake boolean not null default false,
  section text,
  code text not null,
  title text not null,
  kind text not null check (kind in ('chapter', 'point')),
  parent_id text,
  in_scope boolean not null default false,
  status text not null default 'Not Started'
    check (status in ('Not Started', 'Learning', 'Practising', 'Exam Ready')),
  covered boolean not null default false,
  confidence integer,
  reviewed_on text,
  reviewed_at text,
  review_due text,
  goal_due text,
  exam_questions integer not null default 0,
  last_test_pct double precision,
  priority text,
  notes text,
  updated_at text not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, subject_id)
    references public.subjects (workspace_id, id) on delete cascade,
  foreign key (workspace_id, parent_id)
    references public.topics (workspace_id, id) on delete cascade
);

create index idx_topics_subject_row on public.topics (workspace_id, subject_id, source_row);
create index idx_topics_review_due on public.topics (workspace_id, review_due) where review_due is not null;
create index idx_topics_goal_due on public.topics (workspace_id, goal_due) where goal_due is not null;
create index idx_topics_parent_id on public.topics (workspace_id, parent_id) where parent_id is not null;

create table public.topic_activity (
  id integer generated always as identity primary key,
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  topic_id text not null,
  event_type text not null check (event_type in ('status', 'review', 'note')),
  from_status text,
  to_status text,
  note text,
  occurred_at text not null,
  foreign key (workspace_id, topic_id)
    references public.topics (workspace_id, id) on delete cascade
);

create index idx_topic_activity_topic_time
  on public.topic_activity (workspace_id, topic_id, occurred_at desc);

create table public.study_sessions (
  id integer generated always as identity primary key,
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  study_date text not null,
  minutes integer not null check (minutes > 0 and minutes <= 1440),
  subject_id text,
  note text,
  created_at text not null,
  updated_at text not null,
  foreign key (workspace_id, subject_id)
    references public.subjects (workspace_id, id) on delete set null (subject_id)
);

create index idx_study_sessions_date on public.study_sessions (workspace_id, study_date desc);
create unique index idx_study_sessions_workspace_id on public.study_sessions (workspace_id, id);

create table public.study_session_topics (
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  session_id integer not null,
  topic_id text not null,
  primary key (session_id, topic_id),
  foreign key (workspace_id, session_id)
    references public.study_sessions (workspace_id, id) on delete cascade,
  foreign key (workspace_id, topic_id)
    references public.topics (workspace_id, id) on delete cascade
);

create index idx_study_session_topics_topic on public.study_session_topics (workspace_id, topic_id);

create table public.study_tasks (
  id integer generated always as identity primary key,
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  subject_id text not null,
  due_date text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  labels_json text not null default '[]',
  completed boolean not null default false,
  completed_at text,
  created_at text not null,
  updated_at text not null,
  foreign key (workspace_id, subject_id)
    references public.subjects (workspace_id, id) on delete cascade
);

create index idx_study_tasks_open_due on public.study_tasks (workspace_id, completed, due_date);
create index idx_study_tasks_subject on public.study_tasks (workspace_id, subject_id);

create table public.study_goals (
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  subject_id text not null,
  stage text not null default 'A2' check (stage in ('AS', 'A2')),
  start_date text not null,
  target_date text not null,
  weekly_hours integer not null default 10 check (weekly_hours >= 1 and weekly_hours <= 80),
  study_days integer not null default 5 check (study_days >= 1 and study_days <= 7),
  pace_mode text not null default 'steady'
    check (pace_mode in ('steady', 'front-loaded', 'finish-line')),
  schedule_applied_at text,
  created_at text not null,
  updated_at text not null,
  primary key (workspace_id, subject_id, stage),
  foreign key (workspace_id, subject_id)
    references public.subjects (workspace_id, id) on delete cascade
);

create table public.flashcard_decks (
  id integer generated always as identity primary key,
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  subject_id text,
  stage text check (stage in ('AS', 'A2')),
  chapter_id text,
  created_at text not null,
  updated_at text not null,
  foreign key (workspace_id, subject_id)
    references public.subjects (workspace_id, id) on delete set null (subject_id)
);

create unique index idx_flashcard_decks_workspace_id on public.flashcard_decks (workspace_id, id);
create index idx_flashcard_decks_updated on public.flashcard_decks (workspace_id, updated_at desc);

create table public.flashcards (
  id integer generated always as identity primary key,
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  deck_id integer not null,
  front text not null,
  back text not null,
  mastery integer not null default 0 check (mastery >= 0 and mastery <= 5),
  last_reviewed_at text,
  created_at text not null,
  updated_at text not null,
  foreign key (workspace_id, deck_id)
    references public.flashcard_decks (workspace_id, id) on delete cascade
);

create index idx_flashcards_deck_id on public.flashcards (workspace_id, deck_id);

create table public.past_papers (
  id integer generated always as identity primary key,
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  paper_id text,
  subject_id text not null,
  stage text not null default 'A2' check (stage in ('AS', 'A2')),
  board text,
  paper text not null,
  variant text,
  session text not null default 'May/June',
  year integer not null,
  attempt_date text not null,
  score double precision,
  max_score double precision,
  percentage double precision,
  grade text,
  duration_minutes integer,
  conditions text not null default 'Timed' check (conditions in ('Timed', 'Untimed', 'Open book')),
  status text not null default 'done' check (status in ('planned', 'done')),
  weak_topics_json text not null default '[]',
  notes text,
  created_at text not null,
  updated_at text not null,
  foreign key (workspace_id, subject_id)
    references public.subjects (workspace_id, id) on delete cascade
);

create index idx_past_papers_attempt_date on public.past_papers (workspace_id, attempt_date desc);
create index idx_past_papers_subject_stage on public.past_papers (workspace_id, subject_id, stage);
create index idx_past_papers_status on public.past_papers (workspace_id, status);
create index idx_past_papers_paper_id on public.past_papers (workspace_id, paper_id);

-- Per-user annotations on catalogue papers (difficulty rating, personal link).
create table public.paper_meta (
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  paper_id text not null,
  difficulty text check (difficulty in ('Easy', 'Medium', 'Hard')),
  resource_url text,
  updated_at text not null,
  primary key (workspace_id, paper_id)
);

create table public.note_files (
  id integer generated always as identity primary key,
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  -- Object path inside the private `notes` storage bucket. Always prefixed with
  -- the owning workspace id so the storage policies can authorise on the path.
  storage_key text not null unique,
  original_name text not null,
  content_type text not null,
  size_bytes integer not null,
  subject_id text,
  stage text check (stage in ('AS', 'A2')),
  chapter_id text,
  created_at text not null,
  foreign key (workspace_id, subject_id)
    references public.subjects (workspace_id, id) on delete set null (subject_id)
);

create index idx_note_files_created_at on public.note_files (workspace_id, created_at desc);
