# Momentum — Feature Guide

> **Know exactly what to review next.**
> Momentum turns a Cambridge syllabus into a day-by-day revision schedule, then
> keeps it honest as the exam gets closer.

This document is the reference for marketing copy, landing pages and demo
recordings. Every feature listed here is built and working.

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

- AS and A2 tracked separately, with per-paper stage rules
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

### 7. Flashcards

Recall practice tied to the syllabus.

- Decks scoped to a subject, stage, or a specific chapter
- Five-level mastery rating; cards resurface based on how well you knew them
- **Due for review** and **Needs work** views
- CSV import and export, so existing decks come across
- Shuffle, edit in place, reset a deck's progress

**Why it matters:** recall practice that knows which chapter it belongs to.

### 8. Study hours

Time logging that feeds the schedule.

- Log minutes against a date, subject and optional note
- Attach the syllabus topics you covered — **logging the session also marks
  those topics reviewed and reschedules them**
- Weekly totals and a daily study rhythm

**Why it matters:** one action instead of two. Log the session; the schedule
updates itself.

### 9. Tasks

Everything that is not a review.

- Linked to a subject, with a due date and priority
- Custom labels (Homework, Coursework, anything you like)
- Filter by subject or label
- Due tasks surface on the review board alongside topic reviews

### 10. Notes library

- Upload PDFs, Word and PowerPoint files, text and images, up to 20 MB each
- Filed by subject, stage and chapter
- Stored privately per account

### 11. Calendar

One month view combining reviews due, task deadlines, logged study sessions,
goal milestones, scheduled syllabus points, exam revision and exam days.

### 12. Subject management

- Add any subject, with its exam board, qualification and syllabus code
- Import a syllabus from the built-in directory, or bring your own
- Define which papers count as AS and which as A2 — or opt out of stages
  entirely for IGCSE and similar
- Reorder, recolour and archive subjects
- Deleting a subject shows exactly how much data goes with it, first

### 13. Accounts and onboarding

- Email and password sign-up, with confirmation
- Three-step setup: your details → pick your subjects → done
- **52 subjects to choose from**, across Cambridge International AS & A Level,
  Cambridge IGCSE and Edexcel International A Level — searchable, and filtered
  by qualification
- 11 of them arrive **with their full official syllabus tree already loaded**,
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
