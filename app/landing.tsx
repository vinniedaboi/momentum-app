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
    file: "review-board",
    width: 1440,
    height: 900,
    alt: "The Momentum review board, showing five overdue topics, nine due today and sixteen in the next seven days, above a queue of syllabus points grouped by chapter, each row naming the plan that scheduled it and how long it is worth.",
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
] as const;

type ShotName = (typeof SHOTS)[number]["file"];

/** A screenshot that follows the reader's theme, as the app itself does. */
function Shot({ name, priority = false, wide = false }: {
  name: ShotName;
  priority?: boolean;
  wide?: boolean;
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
          sizes={wide ? "(max-width: 900px) 100vw, 1100px" : "(max-width: 900px) 100vw, 640px"}
        />
      </picture>
    </figure>
  );
}

const LOOP = [
  {
    icon: "hours" as const,
    title: "Log what you studied",
    body: "Minutes against a subject, and the syllabus points you covered. That single action also marks those points reviewed.",
  },
  {
    icon: "review" as const,
    title: "Topics reschedule themselves",
    body: "Every point you touch is given its next date automatically, from how far through it you are and how hard you find it.",
  },
  {
    icon: "spark" as const,
    title: "The board tells you what is next",
    body: "Open it and work the list. No planning session, no deciding where to start.",
  },
];

/**
 * The six the product is actually for. Each gets a section of its own with a
 * screenshot of the real screen; everything else is listed further down as
 * what comes with them, because a landing page that gives twelve features
 * equal weight tells a reader nothing about which one to come for.
 */
const PILLARS = [
  {
    shot: "review-board" as const,
    eyebrow: "REVIEW BOARD",
    title: "Stop deciding what to study",
    body: "Every spec point across every subject already has a date, so the day's list is worked out before you open it. You stop picking the chapter that happens to be nearest, and nothing quietly falls off the syllabus because you forgot it was there.",
    ticks: [
      "Reviews, goal work and exam revision in one queue",
      "Overdue, due today and the week ahead, counted",
      "Narrow it to one subject when you only have an hour",
      "Due homework and coursework sit alongside",
    ],
  },
  {
    shot: "syllabus-import" as const,
    eyebrow: "SYLLABUS IMPORT",
    title: "A percentage that actually means something",
    body: "Your subjects arrive with the exam board's own chapters and spec points, in order. So 58% covered means 58% of the syllabus — not 58% of a list you wrote yourself, which is the number that leaves half a paper untouched and still reads as nearly done.",
    ticks: [
      "Cambridge, IB, Edexcel, AQA and OCR",
      "AS and A2 — or SL and HL — measured separately",
      "Nothing to type in: pick the subject, get the syllabus",
      "Or bring your own by pasting an outline",
    ],
  },
  {
    shot: "syllabus-goals" as const,
    eyebrow: "SYLLABUS GOALS",
    title: "Finish the syllabus before the exam, not after it",
    body: "Give it the date you want to be done and it spreads everything you have not covered across the days you actually study. You get a date on each spec point and a pace to hold — and when you slip, it tells you the new pace rather than letting the deadline arrive quietly.",
    ticks: [
      "How much is left, and how far ahead or behind you are",
      "Chapter-by-chapter milestones between now and the date",
      "The minutes each remaining point can realistically get",
      "Says outright when a date leaves too little time",
    ],
  },
  {
    shot: "exam-planner" as const,
    eyebrow: "EXAM PLANNING",
    title: "Walk into each paper knowing you covered it",
    body: "A mock in three weeks covers chapters 1 to 6, not the course. Tick what it actually includes and the run-up is built around that — so the fortnight before a paper goes on what the paper asks, and readiness is a number rather than a feeling.",
    ticks: [
      "A countdown, and how ready you are against it",
      "Hours counted only from that exam's own topics",
      "Tick topics off the revision plan as you cover them",
      "Mocks and the real paper planned side by side",
    ],
  },
  {
    shot: "past-papers" as const,
    wide: true,
    eyebrow: "PAST PAPERS",
    title: "Find the three topics costing you the marks",
    body: "It is usually the same three. Record each attempt against the spec points that lost the marks and the pattern stops being a suspicion — then those points go back onto the review board, instead of being the thing you keep meaning to look at. Every Cambridge paper is there to work from, and each one is rated by where its grade boundaries actually landed, so a hard paper is one the examiners had to drop the A threshold for.",
    ticks: [
      "Score, grade, timing and conditions on every attempt",
      "Weak topics tagged to the syllabus point that lost them",
      "Difficulty read from the paper's own grade thresholds",
      "Question papers, mark schemes and examiner reports, linked",
    ],
  },
  {
    shot: "study-log" as const,
    eyebrow: "STUDY LOG",
    title: "Log it once, and everything else stays current",
    body: "Put in the hours and tick what you covered. That one act marks those topics reviewed, books their next date, moves your syllabus percentage, and counts towards whichever goal or exam owns them. There is nothing to keep in step by hand.",
    ticks: [
      "Daily and weekly totals, and your real study rhythm",
      "Paste a YPT total in, or add sessions one at a time",
      "Hours checked against the target your own plan set",
      "No second place to update after you have studied",
    ],
  },
];

/** What comes with them. Named, not sold. */
const ALSO = [
  { icon: "calendar" as const, title: "Calendar", body: "Reviews, deadlines, sessions, milestones and exam days in one month view, filterable by source." },
  { icon: "flashcards" as const, title: "Flashcards", body: "Decks scoped to a subject, stage or chapter, with a five-level mastery rating and CSV import." },
  { icon: "tasks" as const, title: "Tasks", body: "Homework and coursework with a due date, priority and your own labels." },
  { icon: "notes" as const, title: "Notes library", body: "PDFs, documents, slides and images filed by subject, stage and chapter." },
  { icon: "trending" as const, title: "History", body: "Every review, status change, session and paper, newest first." },
  { icon: "subjects" as const, title: "Subject setup", body: "Add, reorder, recolour or archive subjects, and set which papers belong to which stage." },
];

const FAQ = [
  {
    q: "Which exam boards does Momentum support?",
    a: "Cambridge International AS & A Level and IGCSE, the IB Diploma Programme, Edexcel International A Level and International GCSE, and the AQA, OCR and Edexcel A levels. You can also add any subject of your own and paste or import its syllabus.",
  },
  {
    q: "Do I have to type my syllabus in?",
    a: "No. Most subjects arrive with their full official structure already loaded — every chapter and spec point, in order. Anything without one can take a pasted outline or a CSV, and can be imported later.",
  },
  {
    q: "How does the scheduling work?",
    a: "It is deterministic, not a guess. Each status carries an interval, a rating you give a topic stretches or shortens it, and a finish date or exam spreads the outstanding work across the days you said you study. The app shows you the rule it is following.",
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
          <Link href="/signup" className="landing-cta">Create free account</Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <p className="eyebrow">FOR A LEVEL, IGCSE AND IB STUDENTS</p>
          <h1>Know exactly what to review next.</h1>
          <p className="landing-lede">
            Momentum loads your real syllabus, tracks how much of it you have actually
            covered, and paces the rest so you finish before the exam — not the week after.
          </p>
          <div className="landing-hero-actions">
            <Link href="/signup" className="landing-cta large">Create a free account</Link>
            <Link href="/login" className="landing-ghost large">I already have one</Link>
          </div>
          <p className="landing-hero-note">
            Free, with no limits. Your syllabus is loaded for you at sign-up.
          </p>
          <ul className="landing-pillar-strip" aria-label="What Momentum does">
            {PILLARS.map((pillar) => (
              <li key={pillar.eyebrow}>{pillar.eyebrow.toLowerCase().replace(/^./, (c) => c.toUpperCase())}</li>
            ))}
          </ul>
        </section>

        <section className="landing-stats" aria-label="What is loaded in">
          <div><strong>{number(stats.subjects)}</strong><span>subjects to choose from</span></div>
          <div><strong>{number(stats.syllabuses)}</strong><span>with the full syllabus loaded</span></div>
          <div><strong>{number(stats.specPoints)}</strong><span>spec points parsed from the official documents</span></div>
          <div><strong>{number(stats.papers)}</strong><span>past papers in the catalogue</span></div>
        </section>

        <section className="landing-problem">
          <h2>Revision planning eats the time you meant to spend revising.</h2>
          <p>
            A spreadsheet for the syllabus, a notes app for the notes, a folder of past
            papers, a calendar for the deadlines. Nothing talks to anything else, so the
            honest answer to <em>what should I revise right now</em> takes twenty minutes
            to work out — and usually gets skipped.
          </p>
          <p><strong>Momentum answers that question in one screen.</strong></p>
        </section>

        <section id="how-it-works" className="landing-loop">
          <p className="eyebrow">THE LOOP</p>
          <h2>Three moves, and the schedule runs itself</h2>
          <ol>
            {LOOP.map((step, index) => (
              <li key={step.title}>
                <span className="landing-loop-mark" aria-hidden="true"><Icon name={step.icon} /></span>
                <div>
                  <p className="landing-loop-index">Step {index + 1}</p>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {PILLARS.map((pillar, index) => (
          <section
            key={pillar.eyebrow}
            className={index === 0 || "wide" in pillar ? "landing-pillar lead" : `landing-pillar ${index % 2 === 0 ? "" : "reversed"}`}
            id={index === 0 ? "features" : undefined}
          >
            <div className="landing-feature-copy">
              <p className="eyebrow">{pillar.eyebrow}</p>
              <h2 dangerouslySetInnerHTML={{ __html: pillar.title }} />
              <p>{pillar.body}</p>
              <ul className="landing-ticks">
                {pillar.ticks.map((tick) => <li key={tick}>{tick}</li>)}
              </ul>
            </div>
            <Shot name={pillar.shot} priority={index === 0} wide={index === 0 || "wide" in pillar} />
          </section>
        ))}

        <section className="landing-schedule">
          <div>
            <p className="eyebrow">NOTHING TO CONFIGURE</p>
            <h2>Set a status. The next review is scheduled from it.</h2>
            <p>
              These are the actual intervals the scheduler uses, not an illustration of
              them. Marking a topic hard brings its review forward and gives it a bigger
              share of your planned hours; marking one easy does the reverse.
            </p>
          </div>
          <table>
            <caption className="sr-only">How long each status parks a topic for</caption>
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
          <p>
            Setup takes about a minute: your details, the subjects you study, and your
            syllabus is loaded for you.
          </p>
          <div className="landing-hero-actions">
            <Link href="/signup" className="landing-cta large">Create a free account</Link>
            <Link href="/login" className="landing-ghost large">Sign in</Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
