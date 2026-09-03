-- Papers say which stage they are; the row does not have to.
--
-- The rule was "a result that carries part of the grade has to say which stage
-- it came from", written when the only way to carry part of a grade was to type
-- one number and label it AS. Once the marks live on the papers themselves the
-- question answers itself: the papers marked sat are the ones that are sat, and
-- a target part way through an award has no single stage to name.
--
-- The last migration exempted a whole award, which was the same realisation
-- arriving one case at a time. This drops the rule rather than carving another
-- hole in it: what remains is a stage that is either named or not, and columns
-- that hold whichever the learner's own route produced.

alter table public.grade_targets
  drop constraint grade_targets_banked_names_its_stage;

comment on column public.grade_targets.completed_stage is
  'The stage a typed-in result came from, where the learner named one. Null for a mock, for a course with every paper sat, and for any target whose marks live on rows in grade_target_components — which say for themselves what has been sat.';
