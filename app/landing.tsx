import Link from "next/link";
import Image from "next/image";
import Icon from "./icons";
import MomentumMark from "./momentum-mark";
import SiteFooter from "./site-footer";
import ThemeToggle from "./theme-toggle";
import { REVIEW_INTERVALS, STATUSES } from "./topics";
import type { LandingStats } from "../lib/landing-stats";

/**
 * The public front door.
 *
 * Copy comes from FEATURES.md, which is the repository's own reference for it
 * and carries the rules this page has to keep: nothing is described as
 * AI-powered, because the scheduling is deterministic and saying otherwise
 * invites the wrong comparison; no grade outcome is promised; and nothing on
 * the "not built yet" list — billing, native apps, third-party sign-in, shared
 * workspaces — is implied anywhere here.
 *
 * The screenshots are the real application photographed against demo data, not
 * a mockup of it, and each is captured in both themes so the page never shows a
 * light product to someone reading in the dark.
 */

const SHOTS = [
  {
    // One capture, not a crop of one: the board is photographed at the height
    // its own content ends at, so the sidebar finishes on Sign out and the
    // queue finishes on a chapter rather than part-way through a row. See
    // scripts/capture-board.md for how to retake it.
    file: "board-hero",
    width: 1440,
    height: 1340,
    alt: "The Momentum review board: a sidebar of screens and four tracked subjects, beside counters reading 28 overdue, 62 due today, 46 in the next seven days and 10% of the syllabus covered, then 2h logged today, a Mathematics homework task due today, and the queue itself — the Series chapter opened to show four syllabus points, each six or eight days overdue, with what it is worth, its difficulty, its status and a button marking it reviewed.",
  },
  {
    file: "review-queue",
    width: 1440,
    height: 1078,
    alt: "The Momentum review queue expanded to individual syllabus points: stress and strain two days overdue and marked hard, elastic and plastic behaviour due today for a Physics P2 mock, the Young modulus, strain energy and Hooke's law each carrying the plan that scheduled it, how long it is worth, and a status of learning, practising, covered or exam ready.",
  },
  {
    file: "syllabus-import",
    width: 1000,
    height: 820,
    alt: "Momentum's sign-up subject picker, listing Physics, Chemistry, Mathematics, Biology and more with the number of syllabus rows each one arrives with, and the exam board each is taught on.",
  },
  {
    file: "syllabus-goals",
    width: 1440,
    height: 900,
    alt: "A Physics AS syllabus goal in Momentum, showing 57% progress, days remaining, the required weekly pace, whether the plan is on track, and how many minutes each syllabus point is worth.",
  },
  {
    file: "goal-detail",
    width: 1440,
    height: 490,
    alt: "The chapter timeline of a Momentum syllabus goal: Deformation of solids 59% covered with nineteen hours left and flagged as needing attention, then Ideal gases due 17 September, Temperature due 4 October and Thermal properties due 24 October, each with its own percentage, points covered and hours remaining.",
  },
  {
    file: "exam-planner",
    width: 1440,
    height: 900,
    alt: "The Momentum exam planner counting down twenty-three days to a Physics P2 mock, with cards for time remaining, required pace, exam readiness and study hours logged against the exam's own topics.",
  },
  {
    file: "past-papers",
    width: 1440,
    height: 1240,
    alt: "The Momentum past papers screen: five logged attempts averaging 78.8%, above a searchable catalogue of Cambridge papers filtered by year, season, paper, variant and difficulty, each row showing its difficulty and its A, B and C grade thresholds alongside links to the question paper, mark scheme and examiner report.",
  },
  {
    file: "study-log",
    width: 1440,
    height: 900,
    alt: "Momentum's study hours screen, showing 1h 35m logged today and 13h 15m across the week, a quick-log form, and a bar chart of daily study totals for the last seven days.",
  },
  /*
   * Crops of the screens above, cut by scripts/crop-landing-shots.py. A whole
   * 1440px screen shrunk into part of a column shows nothing, so where the
   * argument rests on a figure being read, the figure gets cut out and shown
   * at a size it can be read at.
   */
  {
    file: "status-rows",
    width: 1044,
    height: 354,
    alt: "Four syllabus points in the Momentum queue, one at each status: stress and strain rated hard, set to Learning and two days overdue; elastic and plastic behaviour set to Practising and due today; the Young modulus set to Covered and due today; strain energy set to Exam Ready and due tomorrow.",
  },
  {
    file: "review-pace",
    width: 1044,
    height: 538,
    alt: "Momentum's review pace panel set to the Intensive preset, with Standard and Relaxed presets beside it, and the gap for each status set by hand: Learning coming back after 2 days, Practising after 4, Covered after 6 and Exam Ready after 9.",
  },
  {
    file: "paper-figures",
    width: 1055,
    height: 140,
    alt: "Momentum's past-paper summary cards: five papers attempted, a 78.8% average across the five scored, a best paper of 90.7% on Mathematics Paper 2, and a catalogue of 9,393 papers with mark schemes.",
  },
  {
    file: "paper-catalogue",
    width: 1055,
    height: 940,
    alt: "Momentum's past paper catalogue, filtered by year, season, paper, variant and difficulty across 412 Physics papers, each row showing its stage, its difficulty, its A, B and C grade thresholds, and links to the question paper, mark scheme and examiner report.",
  },
  /* The four the loop runs on, all at 2.26:1 so its steps sit in bands of one
     height however wide the column gets. */
  {
    file: "loop-subjects",
    width: 810,
    height: 358,
    alt: "Momentum's sign-up subject picker: cards for Physics, Chemistry and Mathematics arriving with 412, 388 and 264 syllabus rows, each naming the exam board it is taught on.",
  },
  {
    file: "loop-board",
    width: 1055,
    height: 466,
    alt: "The top of the Momentum review board: six overdue, eleven due today, twenty in the next seven days, 58% of the syllabus covered, and 1h 35m logged today.",
  },
  {
    file: "loop-log",
    width: 1055,
    height: 466,
    alt: "Momentum's quick-log form — date, hours, minutes, subject and a note — beside a bar chart of the last seven days of study, totalling 13h 15m.",
  },
  {
    file: "loop-reschedule",
    width: 1055,
    height: 466,
    alt: "Four Physics syllabus points in the Momentum queue: stress and strain two days overdue and rated hard, elastic and plastic behaviour and the Young modulus due today, strain energy tomorrow, each carrying a status of learning, practising, covered or exam ready.",
  },
] as const;

type ShotName = (typeof SHOTS)[number]["file"];

/** A screenshot that follows the reader's theme, as the app itself does. */
function Shot({ name, priority = false, wide = false, caption, sizes }: {
  name: ShotName;
  priority?: boolean;
  wide?: boolean;
  caption?: string;
  /** Overrides the two column widths below, for a frame neither describes. */
  sizes?: string;
}) {
  const shot = SHOTS.find((item) => item.file === name)!;
  return (
    <figure className="landing-shot">
      <picture>
        <source srcSet={`/shots/${name}-dark.png`} media="(prefers-color-scheme: dark)" />
        <Image
          src={`/shots/${name}-light.png`}
          alt={shot.alt}
          width={shot.width}
          height={shot.height}
          priority={priority}
          loading={priority ? undefined : "lazy"}
          sizes={sizes ?? (wide ? "(max-width: 900px) 100vw, 1100px" : "(max-width: 900px) 100vw, 640px")}
        />
      </picture>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

/**
 * The boards a visitor can arrive with. Named once: the strip at the top counts
 * them, the line under it prints them and the FAQ answers with them, so the
 * three cannot drift into disagreeing about how many there are.
 */
const BOARDS = ["Cambridge International", "Edexcel", "AQA", "OCR", "IB Diploma"];

/**
 * What the hero screenshot is showing, said out loud.
 *
 * The board is the one picture that has to land in about three seconds, and on
 * its own it asks to be inspected: four numbers on four cards, none of which
 * explain why they are worth having. These sit under the cards they belong to —
 * see the offsets in landing.css — so the page does the inspecting instead.
 */
const CALLOUTS = [
  { card: "Overdue", note: "What slipped. Start here." },
  { card: "Due today", note: "Worked out before you opened it." },
  { card: "Next 7 days", note: "Reviews, goals and exam revision in one queue." },
  { card: "Syllabus progress", note: "Measured against the board's own spec points." },
];

/**
 * What a learner actually does, in the order they actually do it.
 *
 * It used to open on logging time, which is nobody's first move: you cannot log
 * against spec points before the syllabus is in, and the thing people do every
 * day is open the board, not fill in a form. So the picking of subjects is here
 * as the one-off it is, and the three that repeat run board → log → reschedule,
 * closing back on the board.
 *
 * Each step carries the screen it happens on, because the claim in the copy —
 * the counters, the row of dates, the syllabus row counts — is a thing you can
 * see rather than take on trust.
 */
const LOOP = [
  {
    icon: "subjects" as const,
    shot: "loop-subjects" as const,
    once: true,
    title: "Pick your subjects",
    body: "The syllabus comes with them: the exam board's own chapters and spec points, in order, already scheduled. This is the whole of the setup, and it takes about a minute.",
  },
  {
    icon: "review" as const,
    shot: "loop-board" as const,
    title: "Open the board",
    body: "Overdue first, then what is due today. The list was worked out before you got there, so the session starts with studying rather than with deciding what to study.",
  },
  {
    icon: "hours" as const,
    shot: "loop-log" as const,
    title: "Log what you studied",
    body: "The minutes, and the spec points they covered. That one entry counts as the review as well — you are never recording the same work twice.",
  },
  {
    icon: "spark" as const,
    shot: "loop-reschedule" as const,
    title: "Every point books its own next date",
    body: "The status you gave it sets how long it goes away for, and your syllabus percentage moves with it. Tomorrow's board is built by the time you close the tab.",
  },
];

/**
 * The six the product is actually for. Each gets a section of its own with a
 * screenshot of the real screen; everything else is listed further down as
 * what comes with them, because a landing page that gives twelve features
 * equal weight tells a reader nothing about which one to come for.
 *
 * The first three are the argument, and are printed before anything else: the
 * board says what you do daily, the syllabus says what the numbers are measured
 * against, and past papers is the one nothing else on the market does — it used
 * to sit fifth, two thirds of the way down, which is past where most readers
 * stop. The three that follow are the planning around them.
 */
const PILLARS = [
  {
    // The board itself is the hero picture now, so this section shows the queue
    // underneath it rather than printing the same screen again.
    shot: "review-queue" as const,
    caption: "The queue itself — every point with its date, what it is worth, and how hard you find it.",
    eyebrow: "REVIEW BOARD",
    title: "Stop deciding what to study",
    body: "Every spec point already has a date, so the day's list is worked out before you open it. Nothing falls off the syllabus because you forgot it was there.",
    ticks: [
      "Reviews, goal work and exam revision in one queue",
      "Rate one hard and it comes back sooner; easy, and it waits",
      "Narrow it to one subject when you only have an hour",
    ],
    more: { href: "#scheduling", label: "See how the scheduling works" },
  },
  {
    shot: "syllabus-import" as const,
    eyebrow: "SYLLABUS IMPORT",
    title: "A percentage that actually means something",
    body: "Your subjects arrive with the exam board's own chapters and spec points, in order. So 58% covered means 58% of the syllabus — not 58% of a list you wrote yourself.",
    ticks: [
      "Cambridge, IB, Edexcel, AQA and OCR",
      "Nothing to type in: pick the subject, get the syllabus",
      "Or bring your own by pasting an outline",
    ],
  },
  {
    // The figures lead, at a size they can be read at, because the argument
    // here is about a number. The catalogue under them is cut below those same
    // cards, so the two frames are not the same picture twice.
    shot: "paper-figures" as const,
    shot2: "paper-catalogue" as const,
    wide: true,
    caption: "What your own attempts come to — and the catalogue they came out of.",
    caption2: "Every Cambridge paper, with the thresholds it was marked against and the files to sit it.",
    eyebrow: "PAST PAPERS",
    title: "Stop recording the score. Find out where the marks went.",
    body: "78.8% is the number every tracker will give you, and there is nothing you can do with it. Log the attempt against the spec points that lost the marks and they are ranked by how many papers they have cost you — usually the same three — then go straight back on the review board. Every Cambridge paper is here too, each rated by where its grade boundaries actually landed: a hard paper is one the examiners had to drop the A threshold for.",
    ticks: [
      "Weak topics tagged to the syllabus point that lost them",
      "Difficulty read from the paper's own grade thresholds",
      "Question papers, mark schemes and examiner reports, linked",
    ],
  },
  {
    shot: "syllabus-goals" as const,
    shot2: "goal-detail" as const,
    wide: true,
    caption: "How long is left, the pace it needs, whether you are ahead or behind.",
    caption2: "And the route to it — every chapter with a date of its own.",
    eyebrow: "SYLLABUS GOALS",
    title: "Finish the syllabus before the exam, not after it",
    body: "Give it your finish date. It spreads what is left across the days you actually study, puts a date on every point, and tells you the new pace when you slip.",
    ticks: [
      "How much is left, and how far ahead or behind you are",
      "Chapter-by-chapter milestones between now and the date",
      "Says outright when a date leaves too little time",
    ],
  },
  {
    shot: "exam-planner" as const,
    eyebrow: "EXAM PLANNING",
    title: "Walk into each paper knowing you covered it",
    body: "A mock in three weeks covers chapters 1 to 6, not the course. Tick what it includes, and the run-up is built around that — readiness as a number, not a feeling.",
    ticks: [
      "A countdown, and how ready you are against it",
      "Hours counted only from that exam's own topics",
      "Tick topics off the revision plan as you cover them",
    ],
  },
  {
    shot: "study-log" as const,
    eyebrow: "STUDY LOG",
    title: "Log it once, and everything else stays current",
    body: "Put in the hours, tick what you covered. That one act marks those topics reviewed, books their next date, and moves your syllabus percentage. Nothing to keep in step by hand.",
    ticks: [
      "Daily and weekly totals, and your real study rhythm",
      "Paste a daily total in, or add sessions one at a time",
      "Hours checked against the target your own plan set",
    ],
  },
];

/**
 * What students have said, in their own words and no further than them.
 *
 * Unattributed on purpose. These are real and were said to us, but nobody has
 * yet given a name to put under one, and a first name, a year group or a school
 * invented to make a quote look sourced is a fabricated review — which is worse
 * than no name at all, because a reader who suspects one stops believing the
 * rest of the page too. A quote joins this list when someone actually says it,
 * and gains a name when they say we may use theirs.
 */
const QUOTES = [
  "The best study app I have ever used.",
  "Everything I need in one place.",
];

/**
 * Where Momentum sits next to the things a student already has open.
 *
 * The columns are kinds of tool rather than named products, because a table
 * that puts a competitor's name above a row of crosses is a claim about their
 * roadmap this page cannot stand behind. The last row is the point of the
 * table: Momentum has no notes and no practice questions in it, and saying so
 * is what makes the rows above it worth reading.
 */
const COMPARE = {
  columns: ["A planner or calendar", "A revision-notes site"],
  rows: [
    { feature: "Your exam board's syllabus, loaded for you", them: ["You type it in", "To read"], us: "To revise, with dates" },
    { feature: "Schedules individual spec points", them: ["No", "Not usually"], us: "Yes" },
    { feature: "Brings a topic back on its own", them: ["No", "Sometimes"], us: "Yes" },
    { feature: "Plans a mock covering only part of the course", them: ["Not usually", "Not usually"], us: "Yes" },
    { feature: "Ties a lost mark to the spec point behind it", them: ["No", "Not usually"], us: "Yes" },
    { feature: "Rates a paper by where its boundaries landed", them: ["No", "No"], us: "Yes" },
    { feature: "Logging your hours moves the plan", them: ["No", "No"], us: "Yes" },
    { feature: "Notes, videos and practice questions", them: ["No", "Yes"], us: "Bring your own" },
  ],
};

/**
 * Where each of the six sits. A section runs full width when one column is too
 * narrow to read what is in the picture — the review board's queue, the goal's
 * chapter timeline, the paper catalogue — and the rest sit beside their
 * screenshot, alternating sides.
 *
 * The alternation counts only those: counting raw positions would put every
 * side-by-side section on the same side once the full-width ones are taken out
 * of the sequence.
 */
let sides = 0;
const LAYOUTS = PILLARS.map((pillar, index) =>
  index === 0 || "wide" in pillar ? "lead" : sides++ % 2 === 0 ? "" : "reversed",
);

/** What comes with them. Named, not sold. */
const ALSO = [
  { icon: "grades" as const, title: "Grade calculator", body: "Turn an AS result or a mock into the mark every paper still has to hit — on the standard bands, or boundaries you type in yourself." },
  { icon: "calendar" as const, title: "Calendar", body: "Reviews, deadlines, sessions and exam days in one month." },
  { icon: "flashcards" as const, title: "Flashcards", body: "Decks scoped to a subject or chapter, with CSV import." },
  { icon: "tasks" as const, title: "Tasks", body: "Homework and coursework, with a due date and a priority." },
  { icon: "notes" as const, title: "Notes library", body: "PDFs, slides and images, filed by subject and chapter." },
  { icon: "trending" as const, title: "History", body: "Every review, session and paper, newest first." },
  { icon: "subjects" as const, title: "Subject setup", body: "Add, reorder, recolour or archive your subjects." },
];

const FAQ = [
  {
    q: "Which exam boards does Momentum support?",
    a: "Cambridge International AS & A Level and IGCSE, the IB Diploma Programme, Edexcel International A Level and International GCSE, and the AQA, OCR and Edexcel A levels. You can also add any subject of your own and paste or import its syllabus.",
  },
  {
    q: "Does Momentum teach me the content?",
    a: "No, and it does not try to. There are no notes, videos or practice questions in it. Keep whatever you already learn from — your textbook, your teacher's slides, a revision site — and let Momentum work out which of them you should have open tonight, and what your last paper says you got wrong.",
  },
  {
    q: "Do I have to type my syllabus in?",
    a: "No. Most subjects arrive with their full official structure already loaded — every chapter and spec point, in order. Anything without one can take a pasted outline or a CSV, and can be imported later.",
  },
  {
    q: "How does the scheduling work?",
    a: "It is deterministic, not a guess. Each status carries an interval — the sensible default, or a gap you set yourself, from a preset or one status at a time — a rating you give a topic stretches or shortens it, and a finish date or exam spreads the outstanding work across the days you said you study. The app shows you the rule it is following.",
  },
  {
    q: "What does it cost?",
    a: "Nothing. Every account is free, with no limits on subjects, topics or papers.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Every account is fully isolated — separate data, enforced in the application layer and again by database row-level security.",
  },
  {
    q: "Does it work on a phone?",
    a: "Yes. Momentum is a responsive web app, so it works in any modern browser on a phone, tablet or laptop. There is no native app to install.",
  },
];

export default function Landing({ stats }: { stats: LandingStats }) {
  const number = (value: number) => value.toLocaleString("en-GB");

  /*
   * Structured data, built from the same arrays the page renders, so the
   * machine-readable answer and the one a reader sees cannot drift apart. The
   * price is stated because it is genuinely zero: an omitted price reads as
   * "ask us", which is not true here.
   */
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: "Momentum",
        applicationCategory: "EducationalApplication",
        operatingSystem: "Any modern web browser",
        description:
          "A revision planner for A Level, IGCSE and IB students. Momentum loads the official "
          + "syllabus, schedules every spec point, and answers what to revise today.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
        featureList: [...PILLARS.map((p) => p.title), ...ALSO.map((a) => a.title)],
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };

  /*
   * Built once and printed in two places: the board goes first, then the table
   * of intervals that fills it, then the loop that runs it, and the other five
   * follow those. The layout and the alternation are still worked out across
   * the whole list, so splitting where they are printed does not change which
   * of them runs full width or which side any of them sits on.
   */
  const pillars = PILLARS.map((pillar, index) => (
    <section
      key={pillar.eyebrow}
      className={`landing-pillar ${LAYOUTS[index]}`.trimEnd()}
      id={index === 0 ? "features" : undefined}
    >
      <div className="landing-feature-copy">
        <p className="eyebrow">{pillar.eyebrow}</p>
        <h2 dangerouslySetInnerHTML={{ __html: pillar.title }} />
        <p>{pillar.body}</p>
        <ul className="landing-ticks">
          {pillar.ticks.map((tick) => <li key={tick}>{tick}</li>)}
        </ul>
        {/* The mechanics live at the bottom of the page now, so the section
            that raises them carries the way down to them. */}
        {pillar.more ? (
          <a className="landing-more" href={pillar.more.href}>
            {pillar.more.label}
            <span aria-hidden="true">→</span>
          </a>
        ) : null}
      </div>
      <div className="landing-shot-stack">
        <Shot name={pillar.shot} wide={LAYOUTS[index] === "lead"} caption={pillar.caption} />
        {pillar.shot2 ? (
          <Shot name={pillar.shot2} wide={LAYOUTS[index] === "lead"} caption={pillar.caption2} />
        ) : null}
      </div>
    </section>
  ));

  return (
    <div className="landing">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <header className="landing-nav">
        <Link href="/" className="landing-brand" aria-label="Momentum home">
          <span className="brand-mark"><MomentumMark /></span>
          <span>
            <b>Momentum</b>
            <small>Focus. Study. Grow.</small>
          </span>
        </Link>
        <nav aria-label="Landing page">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="landing-nav-actions">
          <ThemeToggle />
          <Link href="/login" className="landing-signin">Sign in</Link>
          <Link href="/signup" className="landing-cta">Build my plan</Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <p className="eyebrow">FOR A LEVEL, IGCSE AND IB STUDENTS</p>
          {/*
            * The question a student actually has at half seven in the evening,
            * answered in the words they would use to ask it. It led on the cost
            * of planning before, which is the reason the product exists rather
            * than the thing it gives you — an argument you have to follow, in
            * the one place on the page that has to land without being followed.
            */}
          <h1>Know exactly what to revise today.</h1>
          <p className="landing-lede">
            Momentum loads your exam board&rsquo;s own syllabus, puts a date on every spec
            point, and has the day&rsquo;s list ready before you open it.
          </p>
          <div className="landing-hero-actions">
            <Link href="/signup" className="landing-cta large">Build my revision plan</Link>
            <Link href="/login" className="landing-ghost large">I already have an account</Link>
          </div>
          <p className="landing-hero-note">
            Free. No card, no trial, no limits &mdash; and setup takes about a minute.
          </p>
          {/* The board, and what to take from it. This is the only picture above
              the fold, so it is the one worth fetching eagerly. It is held
              narrower than the page: the whole board is a tall thing, and at
              full width it would stand a screen and a half high before the
              labels under it were reached. */}
          <div className="landing-hero-board">
            <Shot name="board-hero" priority sizes="(max-width: 940px) 100vw, 900px" />
            <ul className="landing-hero-callouts" aria-label="What the board is showing">
              {CALLOUTS.map((callout) => (
                <li key={callout.card}>
                  <b>{callout.card}</b>
                  {callout.note}
                </li>
              ))}
            </ul>
          </div>
          <ul className="landing-pillar-strip" aria-label="What Momentum does">
            {PILLARS.map((pillar) => (
              <li key={pillar.eyebrow}>{pillar.eyebrow.toLowerCase().replace(/^./, (c) => c.toUpperCase())}</li>
            ))}
          </ul>
        </section>

        {/*
          * What is loaded in. The subject count used to lead it and was read as
          * a contradiction — 484 subjects against 233 syllabuses reads as "only
          * half of them work" to anyone who does not already know that a subject
          * without a parsed tree still takes an imported one. So the boards lead
          * instead, and the two figures that are genuinely large follow.
          */}
        <section className="landing-stats" aria-label="What is loaded in">
          <div className="landing-stats-row">
            <div><strong>{BOARDS.length}</strong><span>exam boards</span></div>
            <div><strong>{number(stats.syllabuses)}</strong><span>syllabuses loaded in full</span></div>
            <div><strong>{number(stats.specPoints)}</strong><span>spec points parsed</span></div>
            <div><strong>{number(stats.papers)}</strong><span>past papers, with mark schemes</span></div>
          </div>
          <p>{BOARDS.join(" · ")} — and {number(stats.subjects)} subjects to pick from.</p>
        </section>

        {/* The board first: it is the screen the rest of the product feeds, and
            the one a reader has to see to know what any of this is. */}
        {pillars[0]}

        {/* Then where Momentum sits, answered before the feature list rather
            than after it. "Why do I need this when I already have somewhere to
            revise from" is the question standing between the board and reading
            any further, and a reader who has not had it answered reads the
            sections below as a pitch for something replacing what they use. */}
        <section className="landing-compare">
          <p className="eyebrow">WHERE IT SITS</p>
          <h2>Keep what you study from. Momentum decides what needs studying.</h2>
          <p className="landing-compare-lede">
            It is not a replacement for your textbook, your teacher&rsquo;s slides or the site
            you get practice questions from. It is the layer above them — the one that
            says which to open tonight, and puts what your last paper got wrong back in
            the queue.
          </p>
          <div className="landing-compare-scroll">
            <table>
              <caption className="sr-only">
                What a planner, a revision-notes site and Momentum each do
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">What it does</span>
                  </th>
                  {COMPARE.columns.map((column) => <th key={column} scope="col">{column}</th>)}
                  <th scope="col" className="us">Momentum</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.rows.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row">{row.feature}</th>
                    {row.them.map((cell, index) => (
                      <td key={COMPARE.columns[index]} className={cell === "No" ? "no" : undefined}>{cell}</td>
                    ))}
                    <td className="us">{row.us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* And the other two that carry the page — the syllabus its numbers are
            measured against, and the past papers that feed it — then the loop
            that runs them, the planning around it, and the mechanics last. */}
        {pillars.slice(1, 3)}

        <section id="how-it-works" className="landing-loop">
          <p className="eyebrow">THE LOOP</p>
          <h2>Set it up once. After that it is the same three moves.</h2>
          <p className="landing-loop-lede">
            Nobody starts by logging time. You start by saying what you study — and
            from then on it is the app holding the plan, not you.
          </p>
          <ol>
            {LOOP.map((step, index) => (
              <li key={step.title}>
                <div className="landing-loop-copy">
                  <span className="landing-loop-mark" aria-hidden="true"><Icon name={step.icon} /></span>
                  {/* The one-off is not step one of three: numbering it as such
                      is what made a list of three moves print four steps. */}
                  <p className="landing-loop-index">
                    {"once" in step ? "Setup" : `Step ${index}`}
                    {"once" in step ? <span className="landing-loop-once">once</span> : null}
                  </p>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </div>
                <Shot name={step.shot} sizes="(max-width: 900px) 100vw, 620px" />
              </li>
            ))}
          </ol>
          <p className="landing-loop-back">
            <span aria-hidden="true"><Icon name="review" /></span>
            Then it is step 1 again, on a board that has already counted what you did.
          </p>
        </section>

        {pillars.slice(3)}

        <section id="scheduling" className="landing-schedule">
          <div>
            <p className="eyebrow">GOOD DEFAULTS, YOURS TO CHANGE</p>
            <h2>Set a status. The next review is scheduled from it.</h2>
            <p>
              These are the intervals a new account starts with — real gaps, not an
              illustration. Mark a topic hard and its review comes forward; mark one
              easy and it goes back. And the gaps are yours to set: tighten them for an
              exam three weeks out, or loosen them for a slow burn — each status by hand,
              or from an Intensive, Standard or Relaxed preset. Change it and everything
              you have studied is re-planned, without a thing turning overdue.
            </p>
          </div>
          <table>
            <caption className="sr-only">How long each status parks a topic for, by default</caption>
            <thead>
              <tr><th scope="col">Status</th><th scope="col">Means</th><th scope="col">Comes back in</th></tr>
            </thead>
            <tbody>
              {STATUSES.map((status) => (
                <tr key={status}>
                  <th scope="row">{status}</th>
                  <td>
                    {status === "Not Started" ? "Untouched"
                      : status === "Learning" ? "First pass done"
                      : status === "Practising" ? "Working through questions"
                      : status === "Covered" ? "Content complete"
                      : "Confident under exam conditions"}
                  </td>
                  <td>{REVIEW_INTERVALS[status] ? `${REVIEW_INTERVALS[status]} days` : "Due now"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* The same statuses on real rows, because a table of intervals is a
              claim about the app and this is the app making it. Not Started is
              the one row of that table with no interval to show, so the four
              here are the whole of what it schedules. */}
          <Shot
            name="status-rows"
            wide
            caption="One row at each status that parks a topic, with the rating that stretches or shortens its next date."
          />
          <Shot
            name="review-pace"
            wide
            caption="Set your own gap for each status, or start from a preset — the Intensive pace here, tighter than the defaults in the table."
          />
        </section>

        <section className="landing-quotes" aria-label="What students have said">
          <p className="eyebrow">WHAT STUDENTS SAY</p>
          <ul>
            {QUOTES.map((quote) => (
              <li key={quote}><blockquote>{quote}</blockquote></li>
            ))}
          </ul>
        </section>

        <section className="landing-features">
          <p className="eyebrow">AND THE REST OF IT</p>
          <h2>Everything else comes with them</h2>
          <div className="landing-feature-grid">
            {ALSO.map((feature) => (
              <article key={feature.title}>
                <span aria-hidden="true"><Icon name={feature.icon} /></span>
                <strong>{feature.title}</strong>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="faq" className="landing-faq">
          <p className="eyebrow">QUESTIONS</p>
          <h2>Before you sign up</h2>
          <div className="landing-faq-list">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-close">
          <h2>Open the app. Work the list.</h2>
          <p>About a minute to set up. Pick your subjects, and the syllabus loads itself.</p>
          <div className="landing-hero-actions">
            <Link href="/signup" className="landing-cta large">Build my revision plan</Link>
            <Link href="/login" className="landing-ghost large">Sign in</Link>
          </div>
          <p className="landing-hero-note">Free. No card, no trial, no limits.</p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
