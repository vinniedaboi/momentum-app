-- Grade targets.
--
-- A student who has already sat AS arrives with half the A Level behind them
-- and one question: what do I now need in A2? That is arithmetic the app can
-- do, but only if it knows the result already banked.
--
-- One row per subject rather than per stage, because the row is about the
-- *pair* of stages: the one that is finished, and the one still to sit. A
-- second row would have nothing to say.
--
-- The percentage is stored rather than derived from the grade, because a
-- grade is a band and a band is not enough to plan against — a low A and a
-- high A ask for very different A2 papers.

create table public.grade_targets (
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  subject_id text not null,

  -- The stage already sat, and what it came out as. The grade is kept for the
  -- learner to recognise their own result; every calculation reads the mark.
  completed_stage text not null,
  completed_grade text,
  -- The raw marks as they were written on the statement of results, so the
  -- form can show back what was typed. Null when a percentage was entered
  -- directly, which is what a Cambridge percentage uniform mark already is.
  completed_mark double precision,
  completed_max double precision,
  completed_percent double precision not null
    check (completed_percent >= 0 and completed_percent <= 100),

  -- What share of the final grade the completed stage carries. 50 for every
  -- A Level that splits into AS and A2; a column rather than a constant so a
  -- course weighted differently is not silently mis-reported.
  completed_weight integer not null default 50
    check (completed_weight >= 5 and completed_weight <= 95),

  -- The stage still to sit, and the overall grade being worked towards.
  remaining_stage text not null,
  target_grade text not null,

  -- The past-paper target for the remaining stage. Null means "whatever the
  -- target grade needs", which is the answer for almost everyone; a number is
  -- a learner who has chosen to aim somewhere else.
  paper_target_percent double precision
    check (paper_target_percent is null
      or (paper_target_percent >= 0 and paper_target_percent <= 100)),

  created_at text not null,
  updated_at text not null,

  primary key (workspace_id, subject_id),
  constraint grade_targets_stage_check
    check (length(completed_stage) between 1 and 16 and length(remaining_stage) between 1 and 16),
  constraint grade_targets_distinct_stages check (completed_stage <> remaining_stage),
  foreign key (workspace_id, subject_id)
    references public.subjects (workspace_id, id) on delete cascade
);

alter table public.grade_targets enable row level security;

create policy grade_targets_workspace_owner on public.grade_targets
  for all to authenticated
  using (workspace_id = (select auth.uid()))
  with check (workspace_id = (select auth.uid()));

comment on table public.grade_targets is
  'The result a learner already holds for one stage of a subject, and the overall grade they are working towards in the other. See app/grade-targets.ts for the arithmetic it feeds.';
