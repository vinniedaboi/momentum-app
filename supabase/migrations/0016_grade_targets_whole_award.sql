-- A grade target can be entirely settled.
--
-- The banked share was capped at 95 because it was a number a learner typed:
-- "AS counts for half the A Level", and a hundred per cent would have meant a
-- course with nothing left to sit, which the planner had no way to express.
--
-- Papers changed that. A student who has sat every paper of an award and filled
-- in every mark has banked all of it — the screen now reports that as a final
-- grade rather than as a target — and the column has to be able to hold it.
--
-- The integer assumption goes with it. A share typed by hand is a round number;
-- a share counted from papers is not. Cambridge Physics 9702 alone has papers
-- worth 15.5, 23, 11.5 and 38.5 per cent of the A Level, so a candidate part
-- way through banks 38.5 rather than 39.

alter table public.grade_targets
  drop constraint grade_targets_completed_weight_check;

alter table public.grade_targets
  add constraint grade_targets_completed_weight_check
  check (completed_weight >= 0 and completed_weight <= 100);

alter table public.grade_targets
  alter column completed_weight type double precision;

comment on column public.grade_targets.completed_weight is
  'The share of the final grade the marks on this row already own: 50 for an AS half of an A Level, 0 for a mock, 100 for a course with every paper sat, and any fraction in between once it is counted from papers rather than typed.';

-- And a course with everything banked belongs to no stage in particular.
--
-- The rule was "a result that carries part of the grade has to say which stage
-- it came from", which is right for a half and wrong for a whole: a candidate
-- who has sat every paper has not banked AS, they have finished the course.
-- So a stage is named for a partial bank, and for nothing else.

alter table public.grade_targets
  drop constraint grade_targets_banked_names_its_stage;

alter table public.grade_targets
  add constraint grade_targets_banked_names_its_stage
  check (
    completed_stage is not null
    or completed_weight <= 0
    or completed_weight >= 99.95
  );
