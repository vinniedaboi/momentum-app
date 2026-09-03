-- Grade targets for a course sat in one go.
--
-- The table was written for an A Level: half the grade banked as an AS result,
-- half still to come. An IGCSE is sat in a single sitting, so there is no
-- banked half — but the question a student asks is the same one, and so is the
-- arithmetic, once the banked result is allowed to carry no weight at all.
--
-- At weight zero the formula collapses to "you need the boundary", which is
-- exactly the answer for a one-sitting course, and the mark on the row becomes
-- a mock: evidence of where they are rather than a share of where they end up.
-- That is why `completed_stage` becomes nullable — a mock is not a stage of
-- the course — and why the two stages no longer have to differ.
--
-- `grade_scale` is the other half of it. An A Level runs A* to E, an IGCSE to
-- G, and an International GCSE is graded 9 to 1; pricing all three against one
-- ladder would have quietly told half the users the wrong number.

alter table public.grade_targets
  add column grade_scale text not null default 'a-level'
  check (grade_scale in ('a-level', 'igcse', 'numeric'));

alter table public.grade_targets
  alter column completed_stage drop not null;

alter table public.grade_targets
  drop constraint grade_targets_distinct_stages;

alter table public.grade_targets
  drop constraint grade_targets_completed_weight_check;

alter table public.grade_targets
  add constraint grade_targets_completed_weight_check
  check (completed_weight >= 0 and completed_weight <= 95);

-- A result that carries part of the grade has to say which stage it came from;
-- one that carries none of it is a mock, and mocks belong to no stage.
alter table public.grade_targets
  add constraint grade_targets_banked_names_its_stage
  check (completed_stage is not null or completed_weight = 0);

alter table public.grade_targets
  drop constraint grade_targets_stage_check;

alter table public.grade_targets
  add constraint grade_targets_stage_check
  check (
    (completed_stage is null or length(completed_stage) between 1 and 16)
    and length(remaining_stage) between 1 and 16
  );

comment on column public.grade_targets.completed_weight is
  'The share of the final grade the result on this row already owns: 50 for an AS half of an A Level, 0 for a mock, which informs the target without counting towards it.';
