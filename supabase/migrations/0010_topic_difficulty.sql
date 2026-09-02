-- What a learner makes of a point, alongside how far through it they are.
--
-- Everything the tracker decides about a syllabus point was derived from its
-- status and nothing else: the status sets the review interval, and the status
-- sets the point's share of a plan's hours. Two points at "Practising" were
-- therefore treated identically, however differently they land on the person
-- studying them — the chapter that will not go in got the same seven days and
-- the same thirty minutes as the one that was obvious on the first reading.
--
-- Status is what the work has done; difficulty is what the learner makes of it.
-- Only the second is an opinion, which is why it is a separate column rather
-- than more statuses: a point can be hard and exam ready at once, and the two
-- facts have to be able to move independently.
--
-- 'normal' is the default and the overwhelming majority. This is for marking
-- the outliers at either end, and the arithmetic reading it treats an unmarked
-- point exactly as the app treated every point before this column existed.

alter table public.topics
  add column difficulty text not null default 'normal'
  check (difficulty in ('easy', 'normal', 'hard'));

comment on column public.topics.difficulty is
  'The learner''s own reading of this point. Shortens or stretches its review interval, and raises or lowers its share of a plan''s minutes. See app/topics.ts and app/study-time.ts for the factors.';
