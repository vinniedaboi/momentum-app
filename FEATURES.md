# Momentum — Feature Guide

> **Know exactly what to review next.**
> Momentum turns a Cambridge syllabus into a day-by-day revision schedule, then
> keeps it honest as the exam gets closer.

This document is the reference for marketing copy, landing pages and demo
recordings. Every feature listed here is built and working.

It says what Momentum does *today*. For what changed and when — the
release-by-release history to announce from — see
[CHANGELOG.md](CHANGELOG.md).

---

## The problem

A-Level students track revision across a spreadsheet, a notes app, a folder of
past papers and a calendar. Nothing talks to each other, so the honest answer to
"what should I revise right now?" takes twenty minutes to work out — and usually
gets skipped.

Momentum answers that question in one screen.

---

## The core loop

**Log what you studied → topics reschedule themselves → the review board tells
you what is next.**

Everything else in the product feeds that loop.

| Status | Meaning | Comes back in |
| --- | --- | --- |
| Not Started | Untouched | — |
| Learning | First pass done | 3 days |
| Practising | Working through questions | 7 days |
| Covered | Content complete | 10 days |
| Exam Ready | Confident under exam conditions | 14 days |

Marking a topic reviewed reschedules it automatically. Nothing to configure.

---

## Features

### 1. Review board

The home screen. Four counters — **Overdue**, **Due today**, **Upcoming**,
**Exam ready** — sit above a queue of exactly what needs attention.

- Click a counter to filter the queue to it
- Update one spec point, or select many and mark them all reviewed at once
- Review a whole chapter in one action, cascading to every point beneath it
- Search across every topic, chapter and syllabus code

**Why it matters:** the queue replaces the twenty-minute planning session. Open
the app, work the list.

### 2. Syllabus tracking

Every subject arrives with its full official structure — chapters and individual
spec points, in syllabus order.

- Each stage tracked separately — AS and A2 on an A Level, SL and HL in the
  IB — with per-paper stage rules
- **Mark a stage as already sat** and its points leave the review board, the
  counters and the calendar, so the queue only asks for work still ahead of you.
  Nothing is deleted, and putting the stage back restores it unchanged
- Live progress percentages per stage, shown in the sidebar
- Per-topic timeline: every status change and review, plus your own written
  progress notes
- Confidence ratings, priorities and last test scores per point

**Why it matters:** progress is measured against the real syllabus, not a
to-do list you invented.

### 3. Syllabus goals and pacing

Pick a finish date. Momentum builds the plan.

- Set the target date, hours per week, and how many days a week you study
- Choose a pacing style: **steady**, **front-loaded**, or **finish-line**
- Every outstanding spec point gets its own scheduled date, snapped to days you
  actually study
- Already-finished points are skipped, so the plan only ever shows real work
- The required pace recalculates as you fall behind or get ahead

**Why it matters:** "finish the syllabus by March" becomes a specific list of
what to do on a specific day.

### 4. Exam planner

Syllabus goals pace a whole stage. An assessment rarely covers a whole stage,
so the exam planner asks which topics it actually includes.

- Add any mock or real paper with its date, and Momentum counts down to it
- **Tick the topics it covers** — a whole chapter at once, or individual spec
  points; part-selected chapters show how many are in
- The selection is spread across the run-up, using the same steady /
  front-loaded / finish-line pacing as syllabus goals
- Topics already at Covered or Exam Ready drop off the plan, so it only lists
  work still to do
- Progress, days remaining, and how many revision dates have slipped, per exam
- Revision dates and the exam day both appear on the calendar

A topic can sit in several exams at once — a mock and the real paper — and each
keeps its own dates, independently of any syllabus goal.

**Why it matters:** "the mock is in three weeks and covers chapters 1 to 6" is
the question students actually ask. A whole-syllabus plan cannot answer it.

### 5. Past papers

A full record of every attempt, and what it tells you.

- Score, total marks, automatic percentage, grade, and time taken
- Exam conditions: timed, untimed, or open book
- Plan papers ahead of time, then fill in the result
- Tag the weak topics behind each lost mark
- Scores tracked over time, per subject and stage

**Why it matters:** the same three topics usually cost the marks. Momentum makes
that pattern impossible to miss.

### 6. Paper catalogue

A searchable directory of Cambridge past papers, built in.

- Filter by qualification, subject, year, season, component, variant, difficulty
- Direct links to question papers, mark schemes and examiner reports
- Grade thresholds where published
- Rate any paper's difficulty and attach your own resource link
- Log an attempt straight from a catalogue row

**Why it matters:** no more hunting across three websites for a mark scheme.

### 7. Grade targets

Two shapes of one question — *what do I need?* — and the same arithmetic answers
both.

**Sat AS already?** Enter the grade and the mark and Momentum works out what A2
has to average, because the AS half is banked whatever happens next.

**Sat in one go — an IGCSE, a linear A Level?** Enter a mock instead. It counts
for nothing towards the real grade, so what you need is simply the boundary, and
the mock says how far off it you are.

- **Weighted by the real syllabus.** Tick the papers you sit and each carries
  the share the board gives it — Physics 9702 is 15.5 / 23 / 11.5 / 38.5 / 11.5
  across its five, not a flat half-and-half. Read from Cambridge's own PDFs for
  131 syllabuses
- **Any other course, entered by hand.** Add your own papers, name them and set
  what each is worth. The weightings are printed at the front of every
  specification, so a niche subject is a minute of typing rather than a dead end
- **It says where the figures came from.** The list names the syllabus its
  papers, weightings and mark totals were read out of — the qualification, the
  code and the exam years — and links the board's own PDF, so a number you doubt
  is one press from the document that states it
- **Correct ours too.** Every name, weighting and mark total on the list is
  editable, whether it came from the board's PDF or from you; a figure you have
  changed offers the syllabus's own back in one press
- A paper marked **sat** banks its marks and its weight; one marked **mock**
  forecasts what it will do without counting towards anything
- Enter the mark as a percentage uniform mark, or a raw score out of its total
- Momentum prices **every** grade, not just the one you picked: what each would
  now cost you, and which are already beyond a perfect paper
- **Priced on your own ladder** — A* to E for an A Level, A* to G for an IGCSE,
  9 to 1 for an International GCSE, picked from the subject's qualification
- Pick a grade from that ladder and its required percentage becomes the target
  every past paper for that stage is measured against — on this screen and on
  Past papers
- **A final grade once every paper is marked.** With nothing outstanding there
  is nothing to target, so the screen reports the result instead: the
  percentage, the grade, and whether it cleared the one you were aiming at —
  answered live as you fill the form in, so it doubles as a grade calculator.
  Half the papers in, and it prices what is left instead
- **Three readings of the same marks** while some papers are still ahead:
  what the banked half came to, what those papers came to *on their own*, and
  where the two land together. A2 is not certificated separately, so the middle
  figure is one no board gives you
- Your recent papers become a form figure, projected forward to the grade that
  form would land; a mock stands in until the first paper is logged
- Override the paper target by hand to aim above the boundary

The arithmetic is the boards' own: weighted shares of one percentage against the
standard boundaries. The screens say plainly that real boundaries move each
session, so the figures are close rather than exact.

**Why it matters:** "am I still in it for an A?" is the question behind every
revision session, and until now it was answered by guesswork on the back of a
past paper.

### 8. Flashcards

Recall practice tied to the syllabus.

- Decks scoped to a subject, stage, or a specific chapter
- Five-level mastery rating; cards resurface based on how well you knew them
- **Due for review** and **Needs work** views
- CSV import and export, so existing decks come across
- Shuffle, edit in place, reset a deck's progress

**Why it matters:** recall practice that knows which chapter it belongs to.

### 9. Study hours

Time logging that feeds the schedule, and an honest account of what you have
actually done.

- Log minutes against a date, subject and optional note
- Attach the syllabus topics you covered — **logging the session also marks
  those topics reviewed and reschedules them**
- **Choose the window** — 7 days, 30, 90, or everything you have ever logged —
  and every figure below answers for it
- Total against the same length of time before it, daily average *and* the
  average on the days you actually studied, consistency, and your streak beside
  your best ever
- A rhythm chart that reads as days over a fortnight and as weeks over longer
- **Time by subject**, biggest share first, and **your week** — what you average
  on each day of the week
- **Time by topic** — each topic you ticked while logging, biggest first, with
  its chapter and how many sittings it came from. A session's minutes are split
  evenly between the topics it names, and time logged without one is left out of
  the split rather than shared between them
- Sessions, longest single sitting, and how many topic reviews logging drove

**Why it matters:** one action instead of two — log the session, and the
schedule updates itself. And a week is enough to log against but not enough to
learn from: the subject quietly getting none of your time only shows up over a
month.

### 10. Tasks

Everything that is not a review.

- Linked to a subject, with a due date and priority
- Custom labels (Homework, Coursework, anything you like)
- Filter by subject or label
- Due tasks surface on the review board alongside topic reviews

### 11. Notes library

- Upload PDFs, Word and PowerPoint files, text and images, up to 20 MB each
- Filed by subject, stage and chapter
- Stored privately per account

### 12. Calendar

One month view combining reviews due, task deadlines, logged study sessions,
goal milestones, scheduled syllabus points, exam revision and exam days.

### 13. Subject management

- Add any subject, with its exam board, qualification and syllabus code
- Import a syllabus from the built-in directory, or bring your own
- Choose the split — AS + A2, SL + HL, or none at all for IGCSE and similar —
  and say which papers belong to which stage
- Mark a stage as already sat, from the subject itself or from this list
- Reorder, recolour and archive subjects
- Deleting a subject shows exactly how much data goes with it, first

### 14. Accounts and onboarding

- Email and password sign-up, with confirmation
- Four-step setup: your details → pick your subjects → how the tracker works
  → done
- **484 subjects to choose from**, across the IB Diploma Programme, Cambridge
  International AS & A Level and IGCSE, Edexcel International A Level and
  International GCSE, and the AQA, OCR and Edexcel A levels — searchable, and
  filtered by qualification
- 233 of them arrive **with their full official syllabus tree already loaded**,
  every chapter and spec point in order; the rest are created ready for a
  syllabus to be imported later
- Every account is fully isolated: separate data, enforced in the application
  layer and again by database row-level security

**Why it matters:** a new user has a working, populated tracker in under a
minute — not an empty shell asking them to type in a syllabus.

---

## Positioning

**For** A-Level and IGCSE students
**who** are revising across several subjects with a fixed exam date,
**Momentum is** a revision planner
**that** turns the official syllabus into a self-updating review schedule.

**Unlike** general study apps and spreadsheet templates, Momentum knows the
actual syllabus structure, reschedules topics for you, and connects past-paper
performance back to the specific spec points that lost the marks.

### Three lines that carry the product

1. **Know exactly what to review next.** No planning session required.
2. **Your syllabus, already loaded.** Every chapter and spec point, on day one.
3. **Log it once.** Study time, reviews and the schedule all update together.

---

## Demo recording guide

A five-beat script for UGC and product video. Total runtime ~90 seconds.

### Setup before recording

- Use a fresh account so onboarding is genuine
- Pick Mathematics and Physics at the subject step — enough syllabus to look
  substantial, few enough to stay readable. Both are bundled subjects, so they
  load the richest trees
- Before filming, populate the account so the analytics views are not empty.
  `npm run seed:demo -- --email <account>` writes a fortnight of study sessions,
  four past papers on a rising score curve, a flashcard deck at mixed mastery,
  tasks and a paced goal — all through the app's own data layer, so the review
  schedule lands exactly as real use would leave it
- Record at 1440×900 or larger; the sidebar and review queue both need width

### Beat 1 — The empty-hands problem (0:00–0:10)

Open on the review board. Voiceover: *"Every morning the same question — what am
I actually supposed to revise today?"*

Show the four counters. Let **Overdue** land.

### Beat 2 — Setup is instant (0:10–0:25)

Cut to the onboarding subject picker. Type a subject name into the search to
show the breadth — 52 subjects across three qualifications — then select two,
showing the syllabus row counts on each card. Hit **Finish setup**.

Land on a fully populated syllabus tree. *"Your whole syllabus, already in
there."*

This is the strongest single moment in the demo. Do not rush it.

### Beat 3 — The core loop (0:25–0:45)

Open a chapter. Mark two spec points **Practising**. Show the review date
appearing on each one.

*"Mark what you have done. It schedules the next review itself."*

### Beat 4 — It connects (0:45–1:10)

Go to Study hours. Log 90 minutes against three topics. Save.

Cut straight back to the review board and show those topics rescheduled.

*"Log the session once — the schedule updates itself."*

Then Past papers: show a logged attempt with its weak topics tagged.

### Beat 5 — The plan (1:10–1:30)

Open Syllabus goals. Set a target date, drag the pacing to **finish-line**,
save. Show the calendar filling with scheduled points.

*"Pick your exam date. Get the plan."*

Close on the review board.

### Shots worth capturing separately

- The subject picker with row counts — best single screenshot for a landing page
- The four review counters with a real overdue number
- The calendar in month view, densely filled
- A past-paper record with weak topics tagged
- The goal pacing control mid-drag

### Copy to avoid

- Do not call it "AI-powered" — it is deterministic scheduling, and saying
  otherwise invites the wrong comparison
- Do not promise grade improvements
- "Spaced repetition" is accurate but jargon; "it comes back when you need it"
  tests better with students

---

## Not built yet

Honest list, so nothing here ends up in marketing copy by accident.

- Billing and paid plans — every account is currently free and unlimited
- Google or Apple sign-in — email and password only
- Mobile apps — the web app is responsive, but there is no native client
- Shared or class workspaces — the schema anticipates them, the product does not
  expose them
- Per-user time zones — review dates currently roll over on Singapore time for
  every account
- Parsed spec-point content beyond the four bundled starter subjects
