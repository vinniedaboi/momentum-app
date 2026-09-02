-- Stages a learner has already sat.
--
-- A subject's stages say how the course is split. They do not say where the
-- learner is in it, so a student who sat AS in June arrived in September to a
-- review board still asking them to revise it — work that is finished and
-- cannot be redone.
--
-- Archiving the subject is too blunt: the A2 half is the whole point of the
-- year. So the flag belongs to the stage rather than to the subject, and it is
-- a list because a course can have more than two stages and because a learner
-- can be finished with all of them.
--
-- Nothing is deleted by marking a stage done. Its points keep their statuses,
-- history and dates; they simply stop being asked for. Unmarking brings them
-- straight back, which is what makes this safe to try.

alter table public.subjects
  add column completed_stages_json text not null default '[]';

comment on column public.subjects.completed_stages_json is
  'Stages of this subject the learner has already sat, as a JSON array of stage labels drawn from stages_json. Their syllabus points drop off the review board and the calendar. See app/subjects.ts.';
