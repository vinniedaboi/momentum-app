-- A grade target made of papers rather than of one number.
--
-- The planner asked for a single percentage and a single weight — "AS, worth
-- 50%" — which is true of a Cambridge A Level as a whole and true of nothing
-- else. A student does not sit an AS; they sit Paper 1, Paper 2 and Paper 3,
-- each worth its own share, and they get a mark back for each one at a
-- different time. An IGCSE is the same story without the halves: 30% multiple
-- choice, 50% theory, 20% practical.
--
-- So the banked figure stops being typed and starts being counted. Each row
-- here is one paper of the course:
--
--   sat   a real result. Its weighting leaves the pot and its marks go in.
--   mock  a paper sat under exam conditions that counts for nothing. It
--         forecasts what that component will do without banking anything.
--   todo  not sat yet, and nothing known about it.
--
-- `grade_targets.completed_percent` and `completed_weight` stay as they are —
-- they are what the ladder reads — but they are now the sum of the sat rows
-- rather than something a learner had to work out for themselves. A target
-- with no components behind it still works exactly as it did, which is what
-- keeps a subject the board's own PDFs cannot speak for usable.
--
-- The weightings themselves come from public.syllabus_assessment, read out of
-- the syllabus PDFs; a copy is kept on the row because a learner may correct
-- it, and because a syllabus revision must not silently restate what a result
-- already sat was worth.

alter table public.grade_targets
  add column award text not null default 'A Level';

comment on column public.grade_targets.award is
  'Which award the components are weighted against: AS, A Level, or qualification for a course sat in one go. Matches syllabus_assessment.award.';

create table public.grade_target_components (
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  subject_id text not null,

  -- "Paper 4", as the syllabus names it.
  component text not null,
  title text,
  weighting double precision not null
    check (weighting > 0 and weighting <= 100),

  -- What was scored, where anything was. Null max falls back to a percentage
  -- typed straight into the mark, which is how a result slip usually reads.
  mark double precision,
  max_mark double precision,

  status text not null default 'todo'
    check (status in ('sat', 'mock', 'todo')),
  -- Syllabus order, so Paper 10 sorts after Paper 9 rather than after Paper 1.
  position integer not null default 0,

  created_at text not null,
  updated_at text not null,

  primary key (workspace_id, subject_id, component),
  constraint grade_target_components_scored
    check (status = 'todo' or mark is not null),
  foreign key (workspace_id, subject_id)
    references public.grade_targets (workspace_id, subject_id) on delete cascade
);

create index idx_grade_target_components_subject
  on public.grade_target_components (workspace_id, subject_id, position);

alter table public.grade_target_components enable row level security;

create policy grade_target_components_workspace_owner on public.grade_target_components
  for all to authenticated
  using (workspace_id = (select auth.uid()))
  with check (workspace_id = (select auth.uid()));
