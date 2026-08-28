-- Shared reference data. These three tables are the same for every account:
-- the Cambridge past-paper catalogue and the syllabus trees parsed from the
-- official PDFs by scripts/import_syllabus.py. Signed-in users read them;
-- only the service role writes them.

create table public.catalogue_papers (
  id text primary key,
  board text not null,
  qualification text not null,
  subject text not null,
  syllabus_code text not null,
  label text not null,
  year integer not null,
  season text not null,
  season_code text not null,
  component text,
  variant text,
  paper_unit_code text not null,
  stage text,
  difficulty text,
  threshold_a double precision,
  threshold_b double precision,
  threshold_c double precision,
  qp_url text,
  ms_url text,
  er_url text
);

create index idx_catalogue_qual_subject on public.catalogue_papers (qualification, subject);
create index idx_catalogue_year on public.catalogue_papers (year);
create index idx_catalogue_subject_year on public.catalogue_papers (subject, year);

create table public.syllabus_versions (
  record_id text primary key,
  board text not null,
  qualification text not null,
  subject text not null,
  syllabus_code text not null,
  year_from integer,
  year_to integer,
  is_current boolean not null default false,
  is_latest boolean not null default false,
  pdf_url text,
  page_url text,
  notes text
);

create index idx_syllabus_versions_subject on public.syllabus_versions (subject, year_from desc);

create table public.syllabus_content (
  record_id text not null references public.syllabus_versions (record_id) on delete cascade,
  syllabus_code text not null,
  seq integer not null,
  code text not null,
  kind text not null check (kind in ('chapter', 'point')),
  parent_code text,
  title text not null,
  academic_level text,
  primary key (record_id, seq)
);

create index idx_syllabus_content_record on public.syllabus_content (record_id, seq);
