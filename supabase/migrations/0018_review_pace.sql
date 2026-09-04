-- How long each status parks a point for, as the learner wants it.
--
-- The gaps were one table compiled into the app: three days at Learning, seven
-- at Practising, ten at Covered, fourteen at Exam Ready. That is a sensible
-- pace for a school year and the wrong one for a fortnight before a paper, and
-- a learner who found it too slow or too punishing had nowhere to say so.
--
-- Four columns rather than one json blob, because each is a number with its own
-- bound and the check constraints are the point: a zero here would schedule a
-- point to come back the day it was studied, forever, and a null would make the
-- scheduler's arithmetic disappear. Defaults match the compiled table exactly,
-- so an account that never touches this behaves as it always did.
--
-- "Not Started" has no column: a point nobody has looked at is due now, and
-- that is not a pace anyone should be able to set.

alter table public.profiles
  add column review_days_learning integer not null default 3
    check (review_days_learning between 1 and 180),
  add column review_days_practising integer not null default 7
    check (review_days_practising between 1 and 180),
  add column review_days_covered integer not null default 10
    check (review_days_covered between 1 and 180),
  add column review_days_exam_ready integer not null default 14
    check (review_days_exam_ready between 1 and 180);

comment on column public.profiles.review_days_learning is
  'Days a point at Learning waits before its next review. See app/topics.ts for the defaults and the difficulty factors applied on top.';
