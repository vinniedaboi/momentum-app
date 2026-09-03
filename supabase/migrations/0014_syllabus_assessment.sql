-- What each paper of a syllabus is worth.
--
-- The grade planner was doing arithmetic on an assumption: that AS is half an
-- A Level and a one-sitting course is all of itself. The first is true of
-- Cambridge A Levels and the second is trivially true, but neither says what
-- an individual paper carries — and a paper is what a student actually sits
-- and actually has a mark for.
--
-- Every Cambridge syllabus prints this on one page of its overview:
--
--     Paper 2
--     AS Level Structured Questions      Paper 4: Theory (Extended)
--     1 hour 15 minutes                  1 hour 15 minutes
--     60 marks                           80 marks
--     46% of the AS Level                50%
--     23% of the A Level
--
-- which is the same PDF the subject content is parsed from. So this is read
-- rather than assumed, by scripts/parse_assessment.py.
--
-- One row per component per award, because a paper worth 46% of the AS and 23%
-- of the A Level is two facts about two different qualifications, and a planner
-- aiming at one of them should not have to filter out the other.
--
-- `route` is the branch of the syllabus a component belongs to — Core against
-- Extended on an IGCSE, Pure against Mechanics on 9709 — and is why the
-- weightings do not total 100 across the whole table: they total 100 across
-- the combination one candidate actually sits.

create table public.syllabus_assessment (
  syllabus_code text not null,
  board text not null,
  qualification text not null,
  subject text not null,

  -- "Paper 4", and the number on its own for ordering.
  component text not null,
  component_number integer not null,
  component_title text,
  -- The raw total the paper is marked out of, where the overview states it.
  marks integer,

  -- "Core", "Extended", "Practical", "Mechanics" — empty where the syllabus
  -- offers no branches and every candidate sits the same papers.
  route text not null default '',

  -- 'AS', 'A Level', or 'qualification' for a course awarded in one go.
  award text not null,
  weighting_percent double precision not null
    check (weighting_percent > 0 and weighting_percent <= 100),

  -- What the syllabus says about when the component is taken: "Compulsory for
  -- A Level", "Offered only as part of AS Level".
  rule text,

  primary key (syllabus_code, component, award)
);

create index idx_syllabus_assessment_code
  on public.syllabus_assessment (syllabus_code, award, component_number);

alter table public.syllabus_assessment enable row level security;

create policy syllabus_assessment_read_all on public.syllabus_assessment
  for select to authenticated using (true);

comment on table public.syllabus_assessment is
  'Component weightings read from the boards own syllabus PDFs by scripts/parse_assessment.py. Shared reference data: every account reads it, no account writes it.';
