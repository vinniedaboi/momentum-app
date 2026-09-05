-- Boundaries a learner supplies for their own course.
--
-- The ladder has always priced grades against the standard uniform-mark bands,
-- and every screen that shows a figure says so: real boundaries move a mark or
-- two each session and differ by board, so the numbers are close rather than
-- exact. That is the right default and the wrong ceiling — a learner holding
-- their board's published thresholds for the session, or their school's own,
-- could only watch the screen disagree with a number they already had.
--
-- This is where those go: an object of grade -> the overall percentage that
-- grade starts at. Partial sets are allowed, because a learner often knows only
-- what the A took; a grade the object does not name keeps the standard band.
-- Null is the standard bands throughout, which is what every existing row
-- means, so no backfill is needed.

alter table public.grade_targets
  add column thresholds jsonb;

comment on column public.grade_targets.thresholds is
  'The learner''s own grade boundaries: an object of grade -> the overall percentage it starts at, strictly descending across the scale. Null means the standard uniform-mark bands defined in app/grade-targets.ts.';
