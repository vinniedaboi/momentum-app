# Legacy Cloudflare D1 importers

These predate the move to Supabase and still write to the local Miniflare D1
SQLite file, which this app no longer uses. They are kept for reference only.

- `import-catalogue.mjs` — superseded by `scripts/import-shared-data.mjs`,
  which loads the same CSV into Postgres.
- `import_syllabus.py` — downloads Cambridge syllabus PDFs, parses them with
  `scripts/parse_syllabus.py`, and writes `syllabus_versions` +
  `syllabus_content` into D1. Rows it already produced can be moved to Postgres
  with `scripts/import-legacy-d1.mjs --shared`. Parsing *new* syllabuses still
  runs against D1, so this needs a Postgres target before it is useful again.

`scripts/parse_syllabus.py` stayed at the top level: it is pure parsing logic
with no database dependency, and its test still runs.
