-- A stage is whatever a subject calls it.
--
-- Every stage column was checked against ('AS', 'A2'), which is one board's
-- vocabulary rather than a rule. The IB Diploma splits a course into SL and HL,
-- and subject settings has always let a learner name their own pair, so those
-- checks rejected rows the app was willing to write. They now police the shape
-- of a stage label; which labels a subject accepts is the subject's own
-- `stages_json`, and the API validates every goal, exam, deck and note against
-- it before writing.

do $$
declare
  found record;
begin
  for found in
    select conrelid::regclass::text as table_name, conname
    from pg_constraint
    where contype = 'c'
      and connamespace = 'public'::regnamespace
      and conrelid in (
        'public.study_goals'::regclass, 'public.exams'::regclass,
        'public.past_papers'::regclass, 'public.flashcard_decks'::regclass,
        'public.note_files'::regclass)
      and pg_get_constraintdef(oid) ilike '%stage%'
  loop
    execute format('alter table %s drop constraint %I', found.table_name, found.conname);
  end loop;
end $$;

alter table public.study_goals add constraint study_goals_stage_check
  check (length(stage) between 1 and 16);
alter table public.past_papers add constraint past_papers_stage_check
  check (length(stage) between 1 and 16);
alter table public.exams add constraint exams_stage_check
  check (stage is null or length(stage) between 1 and 16);
alter table public.flashcard_decks add constraint flashcard_decks_stage_check
  check (stage is null or length(stage) between 1 and 16);
alter table public.note_files add constraint note_files_stage_check
  check (stage is null or length(stage) between 1 and 16);

-- Which stages a syllabus splits into, where the directory knows: `SL|HL` for an
-- IB course offered at both levels, `SL` for one that is standard level only,
-- and `none` for the DP core, which has no levels at all. Null leaves the split
-- to the qualification's default, which is every other board.
alter table public.syllabus_versions add column stages text;
