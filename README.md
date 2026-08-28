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
- `NEXT_PUBLIC_SITE_URL` — `http://localhost:3000` locally, the deployed origin
  in production.

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

`syllabus_content` (spec points parsed from Cambridge PDFs) is not produced by
this importer — it comes from the Python PDF parser. If you already have those
rows in the old Cloudflare database, `import-legacy-d1.mjs --shared` copies them
across. To parse new syllabuses from scratch you still need the Python flow in
`scripts/legacy-d1/`, which has no Postgres target yet.

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

1. Push this repository to GitHub.
2. Import it in Vercel. The framework preset is detected automatically.
3. Add the four environment variables above to the Vercel project, setting
   `NEXT_PUBLIC_SITE_URL` to the deployed origin.
4. In Supabase → Authentication → URL Configuration, set the **Site URL** to the
   deployed origin and add `https://<your-domain>/auth/callback` to the
   redirect allowlist. Confirmation emails will not work until you do.

### Email confirmation

Supabase requires email confirmation by default. Both paths are handled:
with confirmation on, sign-up routes to `/check-email` and the emailed link
lands on `/auth/callback`; with it off (Authentication → Sign In / Providers),
the session arrives immediately and sign-up goes straight to onboarding.

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

---

## Repository layout

```
app/                 App Router pages, API routes and the client UI
  api/               12 workspace-scoped endpoints + /api/onboarding
  login/ signup/     Auth screens
  onboarding/        Three-step account setup
lib/                 Data access, one module per feature area
  supabase/          Server, browser and proxy Supabase clients
  db.ts              postgres.js pool
  auth.ts            Session resolution and the withWorkspace guard
supabase/migrations/ Schema, RLS policies and the storage bucket
scripts/             Shared-data and legacy-D1 importers, syllabus PDF parser
tests/               Source-level guardrails
```
