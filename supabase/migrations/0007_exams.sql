-- Exam planner.
--
-- A syllabus goal paces a whole stage of a subject and writes its plan into
-- `topics.goal_due`. An exam is different in two ways, which is why it needs
-- its own tables rather than another column on `topics`:
--
--   1. An assessment usually covers only part of the syllabus, so the student
--      picks the topics.
--   2. A topic can sit in several exams at once (a mock and the real paper),
--      so its revision date cannot live in a single column on the topic.

create table public.exams (
  id integer generated always as identity primary key,
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  subject_id text not null,
  title text not null,
  -- Null when the subject has no AS/A2 split, or the exam spans both.
  stage text check (stage in ('AS', 'A2')),
  exam_date text not null,
  start_date text not null,
  weekly_hours integer not null default 10 check (weekly_hours >= 1 and weekly_hours <= 80),
  study_days integer not null default 5 check (study_days >= 1 and study_days <= 7),
  pace_mode text not null default 'steady'
    check (pace_mode in ('steady', 'front-loaded', 'finish-line')),
  notes text,
  -- Null means the revision plan still has to be written; the read path
  -- applies it, so an interrupted save recovers on the next load.
  schedule_applied_at text,
  created_at text not null,
  updated_at text not null,
  foreign key (workspace_id, subject_id)
    references public.subjects (workspace_id, id) on delete cascade
);

create unique index idx_exams_workspace_id on public.exams (workspace_id, id);
create index idx_exams_date on public.exams (workspace_id, exam_date);

create table public.exam_topics (
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  exam_id integer not null,
  topic_id text not null,
  -- The scheduled revision date for this topic in this exam's plan. Null once
  -- the topic is already finished, so the plan only shows outstanding work.
  revise_on text,
  primary key (exam_id, topic_id),
  foreign key (workspace_id, exam_id)
    references public.exams (workspace_id, id) on delete cascade,
  foreign key (workspace_id, topic_id)
    references public.topics (workspace_id, id) on delete cascade
);

create index idx_exam_topics_exam on public.exam_topics (workspace_id, exam_id);
create index idx_exam_topics_revise on public.exam_topics (workspace_id, revise_on)
  where revise_on is not null;

alter table public.exams enable row level security;
alter table public.exam_topics enable row level security;

create policy exams_workspace_owner on public.exams
  for all to authenticated
  using (workspace_id = (select auth.uid()))
  with check (workspace_id = (select auth.uid()));

create policy exam_topics_workspace_owner on public.exam_topics
  for all to authenticated
  using (workspace_id = (select auth.uid()))
  with check (workspace_id = (select auth.uid()));
