# Momentum — release history

What shipped in each release, and the line to lead with when announcing it.

[FEATURES.md](FEATURES.md) says what the product does *today*; this says what
changed and *when*. Entries are written for a student reading an announcement,
not for a developer reading a diff — if a change is not visible to someone using
Momentum, it belongs in the commit message rather than here.

Versions are `major.minor.patch`:

- **major** — the product works differently enough that a returning user has to
  relearn something.
- **minor** — new capability. This is what most releases are, and what is worth
  announcing.
- **patch** — fixes and polish on what is already there.

---

## Unreleased

### Grade targets — what you still need, whatever you are sitting

- **Put in your AS grade and mark, and see what A2 has to average** for the
  overall grade you want. Enter a percentage uniform mark or a raw score out of
  its total.
- **Sitting it all in one go? Put in a mock instead.** An IGCSE has no AS half
  to bank, so the target is simply the boundary the grade needs — and the mock
  says how many points off it you currently are.
- **Priced on your own ladder.** A* to E for an A Level, A* to G for an IGCSE,
  9 to 1 for an International GCSE. The subject picks it from its
  qualification, and you can change it.
- **Every grade is priced, not just the one you picked.** The ladder shows what
  each one would cost you, and marks the ones a perfect paper can no longer
  reach.
- **Pick a grade and it becomes your past-paper target.** Every paper you log
  is scored against it — on the new screen and while you are typing the marks in
  on Past papers — or set your own number to aim above the boundary.
- **Your recent papers project a grade.** The last five attempts become a form
  figure, carried through the same arithmetic to the grade that form lands, with
  a mock standing in until the first paper is logged.

Every figure is an estimate and the screens say so: real boundaries move a mark
or two each session.

### Already sat AS? Say so

- **Mark a stage as sat**, from the subject itself or from the Subjects list.
  Its syllabus points leave the review board, the counters, the nav badge and
  the calendar, so the queue stops asking for work that cannot be redone.
- **Nothing is deleted.** Statuses, notes, history and dates all stay where they
  were, the syllabus is still there to look back at, and putting the stage back
  restores it to the board unchanged.
- The sidebar reports a stage you have sat as **sat** rather than as a
  percentage, and Grade targets opens on it as the half already behind you.

### Fixed

- **"Your exams" no longer floats above the first exam card.** The panel heading
  was spacing itself for a body that starts with its own padding; the exam list
  does not, so the two lots of space were stacking.
- **Logging a past paper works again.** Attempts were being filed under a
  subject's display name rather than its id, which the database rejected, so
  nothing saved. Papers are now logged against a subject you pick from your own
  list, and the stage against that subject's own split.

---

## 1.1.0 — 30 August 2026

**Every major board, the full IB Diploma, and a plan that tells you how long
each syllabus point should take.**

### Every board a student might actually sit

- **601 syllabuses across five boards** — Cambridge, Pearson Edexcel, AQA, OCR
  and the IB — up from twelve hand-picked Cambridge courses.
- **The English boards sit beside the international ones.** AQA and OCR A
  Levels, Edexcel A Levels and International GCSEs are all offered where only
  Cambridge used to be.
- **The IB Diploma Programme, all 173 subjects**, tracked by SL and HL rather
  than by year — including Theory of Knowledge and the Extended Essay.
- **12,058 syllabus points** parsed from the boards' own specification PDFs,
  covering 233 courses. A subject with no published outline is still offered;
  it just arrives without one.
- **A subject you study across two boards is two subjects.** Onboarding asks
  for the subject and its board as separate answers, so a learner sitting
  Edexcel Maths and Cambridge Physics gets both, correctly.

### Know how long to spend on each point

- **Every syllabus goal now says what one point is worth** — your weekly hours
  divided by the work still ahead. A point you have not started earns a full
  share, one you are practising earns less, one you know earns a read-back.
- **The plan says when the date does not work.** 400 points in a fortnight is
  ninety seconds each, and the goal tells you to add hours or move the date
  instead of quietly printing the number.
- **Exam plans cost themselves out.** Each exam shows its total revision time
  and what a topic averages, and every revision day says what it will take
  before you sit down to it.
- **The review board adds up.** Each point carries its minutes, each chapter
  its total, and the queue its whole length — so "review next" is a session you
  can decide to start.

### A board you can actually read

- **Chapters on the review board fold away.** The top one opens on arrival and
  the rest show their count and their time, so a thirty-row queue is something
  you can skim.
- **Dark mode**, across every screen, following your system setting or your own
  choice.
- **The phone layout was rebuilt** around the fold: a review that ran to 330px
  now takes 170, and a phone shows three reviews and the heading where it used
  to show one and a half.
- **Exam revision and goal deadlines land on the same board.** Both planners
  used to schedule work; only one of them showed up in the queue.

### Learn the app while setting it up

- **Onboarding teaches the loop** — statuses, the review board, goals and exam
  plans — as the last step of signing up.
- **A Guide you can come back to**, covering all nine areas of the product,
  built from the same numbers the scheduler uses, so what it promises is what
  happens.

### Fixed

- **Specifications no longer import their own front and back matter.** IGCSE
  Chemistry opened with a chapter called "About this specification"; both maths
  specifications were importing their notation appendix as 144 syllabus points
  ("∉ is not an element of"). Audited across all 235 syllabuses.
- **A unit's topics win the number its boilerplate was claiming**, and where a
  file restarts its numbering each unit, the chapter says which unit it is from
  — two chapters called Trigonometry are now `P1 · Trigonometry` and
  `P2 · Trigonometry`.
- **The sidebar stayed readable when the theme turned over** — 48 rules were
  painting white text on white surfaces in dark mode.
- **A subject's catalogue code is picked deterministically**, and a syllabus
  version with no content falls back to one that has some.

---

## 1.0.0 — 28 August 2026

**Momentum ships as a multi-tenant SaaS.**

Reconstructed from git history — this release predates the changelog and was
never tagged. The date is the last commit of the launch.

- **Accounts and workspaces.** Email sign-up, confirmation, and a four-step
  onboarding that ends on how the tracker works. Every row is scoped to the
  account that owns it.
- **The core loop.** A syllabus becomes a spaced-review schedule: mark a topic
  reviewed and it comes back on its own, 3 to 14 days out depending on how well
  you know it.
- **The exam planner.** Pick the topics a mock actually covers and Momentum
  spreads them across the run-up.
- **Study hours, tasks, notes, flashcards, past papers and a calendar**, all
  feeding the same schedule.
- **Mobile navigation** — a bottom bar and an off-canvas menu.
- **Running on Next.js 16 and Supabase Postgres, deployed to Vercel** in
  Singapore, beside the database.

---

## Keeping this file

Add a bullet to **Unreleased** in the same commit as the change, while you still
remember why it matters to a user. Then cut the release:

```bash
npm version minor
```

That runs the tests, bumps `package.json`, rewrites the `Unreleased` heading
into a dated release, opens a fresh empty `Unreleased`, commits both, and tags
`v1.2.0`. `npm version patch` and `npm version major` do the same at their own
level. Push it with `git push --follow-tags`.

`npm run release:check` says what version we are on and whether anything is
waiting to ship.

Three things stop a release going out wrong:

- The working tree has to be clean, so a release is always its own commit.
- A release with nothing written under `Unreleased` is refused, before anything
  is bumped. A tag that says nothing shipped is worse than no tag.
- `npm test` fails if `package.json` and the newest heading here disagree, so a
  version can never be announced that the app does not answer to.
