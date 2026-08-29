# Momentum — Study Tracker SaaS

Multi-tenant revision planner for Cambridge AS & A Level. Turns a syllabus into
a spaced-review schedule, tracks past-paper performance, and paces everything
against a target exam date.

Built with **Next.js 16** (App Router), **Supabase** (Postgres, Auth, Storage),
and deployed on **Vercel**.

See [FEATURES.md](FEATURES.md) for the full feature breakdown.

---

## Architecture

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 App Router, React 19, all routes server-rendered on demand |
| Database | Supabase Postgres, reached with [postgres.js](https://github.com/porsager/postgres) through the transaction pooler |
| Auth | Supabase Auth (email + password), cookie sessions via `@supabase/ssr` |
| File storage | Supabase Storage, private `notes` bucket |
| Styling | Tailwind v4 plus hand-written CSS in `app/*.css` |

### Tenancy model

`profiles.id` **is** the workspace id, and every tenant table carries
`workspace_id uuid`. Two layers keep accounts apart:

1. **Explicit filtering.** Every statement in `lib/*-db.ts` filters on
   `workspace_id`. The app connects as the `postgres` role, which bypasses RLS,
   so this is the layer that actually scopes the app. `npm test` asserts that
   every workspace module does it.
2. **Row level security.** Policies scope the PostgREST surface that the
   browser's publishable key can reach. Without them, that key would expose
   every row in the project.

Route handlers never see a request without a session: `proxy.ts` redirects
anonymous page loads to `/login` and answers `/api/*` with 401, and
`withWorkspace()` in `lib/auth.ts` re-checks before any handler body runs.

Three tables are deliberately **not** workspace-scoped — `catalogue_papers`,
`syllabus_versions` and `syllabus_content` are shared reference data, readable
by any signed-in user and writable only by the service role.

---

## Local setup

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill it in:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` —
  Supabase → Project Settings → Data API.
- `DATABASE_URL` — Supabase → Project Settings → Database → Connection string →
  **Transaction pooler** (port 6543). Serverless functions must use the pooler,
  never the direct `5432` host.
- `NEXT_PUBLIC_SITE_URL` — optional; leave it unset unless you want every
  confirmation email to point at one fixed origin.

Then:

```bash
npm run dev
```

### Database schema

The migrations in `supabase/migrations/` are already applied to the project.
To rebuild a fresh project, run them in filename order.

### Shared reference data

The past-paper catalogue and syllabus directory ship as CSVs and load once per
environment:

```bash
npm run import:shared
```

`syllabus_content` (spec points parsed from the boards' own PDFs) is not produced
by this importer — it comes from the Python PDF parser:

```bash
python scripts/parse_syllabus_content.py
```

That reads every specification the directory links and writes
`data/syllabus-content.json`, which `npm run import:shared` then loads. Board
content is never committed; regenerate it per environment.

The IB is the exception it cannot fetch. Its subject guides are published through
the programme resource centre rather than the open web, and the public subject
briefs — which do carry the course's syllabus outline — sit behind a bot
challenge that answers this script with a page instead of a PDF. So an IB course
is read from `data/ib-briefs/`, which you fill by hand: open the course page in
`Syllabus_Page_URL` and save its subject brief. One brief serves every subject on
its page, so the Language A: literature brief is the syllabus for all eighty of
its languages, and a course with no brief in the folder is offered without a
syllabus.

Downloading them is the manual step; naming them is not:

```bash
python scripts/install_ib_briefs.py            # reads ~/Downloads
```

That reads each PDF's own title page, files it under the name the parser looks
for (`sciences-biology.pdf` for `.../curriculum/sciences/biology/`, or the
subject code where one page carries two courses, `166711.pdf` for Mathematics:
analysis and approaches), keeps the better of two copies of the same course, and
lists what is still missing with the page to get each from.

Not every brief can be read. The ones published before 2020 set their syllabus
table in two columns, which the PDF text layer interleaves; the reader detects
that and returns nothing rather than an invented outline, so those courses stay
syllabus-less until the IB reissues the brief.

### Migrating the old single-user database

```bash
node scripts/import-legacy-d1.mjs --email you@example.com --shared
```

Reads the Cloudflare D1 SQLite file directly (auto-located in the sibling
`study-tracker-app/.wrangler/` directory; override with `--sqlite`) and loads it
into one account's workspace. The target account must already exist, so sign up
in the app first. Add `--dry-run` to see the row counts without writing.

This **replaces** every tenant row in that workspace rather than merging, and
marks the profile onboarded. Note metadata comes across but the R2 objects
behind it do not, so any note downloads will 404.

---

## Deploying to Vercel

1. Push this repository to GitHub and import it in Vercel. The Next.js preset is
   detected automatically; `vercel.json` supplies the rest.

2. Add two environment variables (Production, Preview and Development):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same page |
   | `DATABASE_URL` | Database → Connection string → **Transaction pooler** (port 6543) |

   `NEXT_PUBLIC_SITE_URL` is optional — see `.env.example`. The two
   `NEXT_PUBLIC_*` values are inlined at build time, so they must exist before
   the first build, and changing them needs a redeploy.

3. In Supabase → Authentication → URL Configuration:
   - **Site URL** → your production origin.
   - **Redirect URLs** → add `https://<your-domain>/auth/callback`. To let
     preview deployments confirm sign-ups too, also add
     `https://<your-project>-*.vercel.app/auth/callback`; or set
     `NEXT_PUBLIC_SITE_URL` and keep the single production entry.

   Confirmation emails silently fail to sign anyone in until this is done.

4. Load the shared reference data once, from your machine, against the same
   database: `npm run import:shared`.

### Region

The functions are pinned to `sin1` (Singapore) in `vercel.json` to sit beside
the `ap-southeast-1` Supabase project. **If you move the database, change this
too** — Vercel otherwise defaults to US East, and a page that issues several
queries would pay a cross-Pacific round trip on each one.

The **build** region is separate and not configurable on every plan; a log line
saying `Running build in Washington, D.C.` is expected and says nothing about
where the functions run. Confirm the function region under Project Settings →
Functions after the first deploy.

### .vercelignore

Patterns use gitignore semantics, so an unanchored `supabase/` also matches
`lib/supabase/`. Every pattern here is anchored with a leading `/`, and
`npm test` walks the tree to prove no runtime file is dropped.

### Connection pooling

Every warm function instance holds its own pool, so `lib/db.ts` drops to a
single connection with a short idle timeout when `VERCEL` is set. That, plus
the transaction pooler on port 6543, is what keeps a scaled-out deployment
inside Supabase's connection limit. Never point `DATABASE_URL` at the direct
`db.<ref>.supabase.co:5432` host from serverless.

### Email confirmation

Supabase requires email confirmation by default. Both paths are handled:
with confirmation on, sign-up routes to `/check-email` and the emailed link
lands on `/auth/callback`; with it off (Authentication → Sign In / Providers),
the session arrives immediately and sign-up goes straight to onboarding.

### What is not deployed

`.vercelignore` keeps `data/`, `scripts/`, `supabase/` and `tests/` out of the
upload — none of them are imported at runtime, and `data/` alone is 4 MB of
catalogue CSV. The migrations and importers stay in git; they just run from a
developer's machine, not from a function.

---

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Development server on port 3000 (pass `-- --port 3100` if the old app holds it) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Source-level guardrails: tenancy scoping, auth wiring, RLS coverage, UI copy |
| `npm run import:shared` | Load the catalogue and syllabus CSVs into Postgres |
| `npm run import:legacy` | Migrate the old Cloudflare D1 database into one account |
| `npm run seed:demo -- --email <a>` | Fill an account with demo study history for recording |
| `npm run smoke -- <workspace-uuid>` | Exercise the data layer against real Postgres (writes to that workspace) |

---

## Repository layout

```
app/                 App Router pages, API routes and the client UI
  api/               12 workspace-scoped endpoints + /api/onboarding
  login/ signup/     Auth screens
  onboarding/        Four-step account setup, ending on how the tracker works
lib/                 Data access, one module per feature area
  supabase/          Server, browser and proxy Supabase clients
  db.ts              postgres.js pool
  auth.ts            Session resolution and the withWorkspace guard
supabase/migrations/ Schema, RLS policies and the storage bucket
scripts/             Shared-data and legacy-D1 importers, syllabus PDF parser
tests/               Source-level guardrails
```
