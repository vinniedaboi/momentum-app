# Legacy Cloudflare D1 importers

These predate the move to Supabase and still write to the local Miniflare D1
SQLite file, which this app no longer uses. They are kept for reference only.

- `import-catalogue.mjs` — superseded by `scripts/import-shared-data.mjs`,
  which loads the same CSV into Postgres.
- `import_syllabus.py` — downloads Cambridge syllabus PDFs, parses them with
  `scripts/parse_syllabus.py`, and writes `syllabus_versions` +
  `syllabus_content`. Only the versions half is ported so far (also by
  `import-shared-data.mjs`); the PDF-parsing half still needs a Postgres
  target before `syllabus_content` can be populated.

`scripts/parse_syllabus.py` stayed at the top level: it is pure parsing logic
with no database dependency, and its test still runs.
