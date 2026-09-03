import type { IconName } from "./icons";
import { DIFFICULTIES, REVIEW_INTERVALS, STATUSES, reviewInterval, type StudyStatus, type TopicDifficulty } from "./topics";
import { DIFFICULTY_EFFORT } from "./study-time";

/**
 * What the app does, written once.
 *
 * Onboarding shows the loop and the guide shows all of it, and the two used to
 * be the same explanation typed twice — which is how a product ends up telling
 * a learner one thing at sign-up and another a week later. The review intervals
 * come from the scheduler's own table rather than from prose, so the guide
 * cannot promise a review in three days that the scheduler gives in five.
 */

export type LoopStep = {
  icon: IconName;
  title: string;
  body: string;
  /** The view this step happens in, named as the sidebar names it. */
  where: string;
};

export type GuideItem = { term: string; detail: string };

export type GuideSection = {
  id: string;
  icon: IconName;
  title: string;
  lead: string;
  items: GuideItem[];
  /** The thing regular users work out late, if nobody tells them. */
  tip?: string;
};

/**
 * The five moves that make up a week of using this. Onboarding shows these
 * before a learner reaches the app, and the guide opens with them.
 */
export const CORE_LOOP: LoopStep[] = [
  {
    icon: "subjects",
    title: "Your syllabus is the checklist",
    body: "Each subject arrives as its real chapters and syllabus points. You give a point a status as you work through it — Learning, Practising, Covered, Exam ready — instead of inventing a to-do list.",
    where: "A subject in the sidebar",
  },
  {
    icon: "review",
    title: "The board decides what is next",
    body: "Every point you touch is scheduled to come back, sooner when it is new and later once it is solid. Open the board and work the queue: overdue first, then today's.",
    where: "Review board",
  },
  {
    icon: "goals",
    title: "A finish date becomes a plan",
    body: "Set the date you want the syllabus done by, your hours and your study days, and every outstanding point gets its own day. Points you have already finished are skipped, and the pace recalculates as you go.",
    where: "Syllabus goals",
  },
  {
    icon: "hours",
    title: "Logging time is the whole admin",
    body: "Log a session, tick the topics it covered, and those topics count as reviewed and reschedule themselves. One action, not two.",
    where: "Study hours",
  },
  {
    icon: "papers",
    title: "Papers show where the marks go",
    body: "Record each attempt with its score and the topics that cost you marks. The same three usually do, and the score history makes that impossible to miss.",
    where: "Past papers",
  },
];

/** The status table, straight from the scheduler. */
export const STATUS_GUIDE: Array<{ status: StudyStatus; meaning: string; days: number }> = [
  { status: "Not Started", meaning: "Untouched", days: REVIEW_INTERVALS["Not Started"] },
  { status: "Learning", meaning: "First pass done", days: REVIEW_INTERVALS.Learning },
  { status: "Practising", meaning: "Working through questions", days: REVIEW_INTERVALS.Practising },
  { status: "Covered", meaning: "Content complete", days: REVIEW_INTERVALS.Covered },
  { status: "Exam Ready", meaning: "Confident under exam conditions", days: REVIEW_INTERVALS["Exam Ready"] },
];

// A guard, not decoration: a status added to the tracker without a line here
// would ship a guide that quietly omits it.
const described = new Set(STATUS_GUIDE.map((row) => row.status));
export const STATUSES_DESCRIBED = STATUSES.every((status) => described.has(status));

const DIFFICULTY_MEANING: Record<TopicDifficulty, string> = {
  easy: "Went in first time",
  normal: "Nothing unusual",
  hard: "Keeps not sticking",
};

/**
 * What rating a point actually does, read from the two tables that do it rather
 * than described in prose beside them. Days are quoted for a point at
 * Practising, the middle of the status scale, because a factor on its own says
 * nothing a learner can picture.
 */
export const DIFFICULTY_GUIDE: Array<{
  difficulty: TopicDifficulty;
  label: string;
  meaning: string;
  days: number;
  share: number;
}> = DIFFICULTIES.map((difficulty) => ({
  difficulty,
  label: difficulty[0].toUpperCase() + difficulty.slice(1),
  meaning: DIFFICULTY_MEANING[difficulty],
  days: reviewInterval("Practising", difficulty),
  share: DIFFICULTY_EFFORT[difficulty],
}));

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "review-board",
    icon: "review",
    title: "Review board",
    lead: "The home screen, and the answer to “what am I supposed to study today?”. Four counters sit above a queue of exactly what needs attention.",
    items: [
      { term: "Filter by counter", detail: "Click Overdue, Due today or Next 7 days to narrow the queue to it. Click again to clear." },
      { term: "Work in bulk", detail: "Select several rows and mark them reviewed together, or review a whole chapter in one action and every point beneath it follows." },
      { term: "Due tasks sit alongside", detail: "Anything from Tasks that is due shows on the board too, so one list covers reviews and coursework." },
      { term: "Search", detail: "The search box spans every topic, chapter and syllabus code across all your subjects." },
      { term: "Chapters fold away", detail: "The queue groups by chapter. The top one opens on arrival and the rest stay folded, each showing how many reviews it holds and how long they will take." },
      { term: "Every point carries its minutes", detail: "The time beside a point is its share of whichever plan put it there, so the whole queue adds up to a session you can actually sit." },
      { term: "Say what you find hard", detail: "Every row carries a rating beside its status. Marking a point hard brings its review forward and gives it a bigger slice of your planned hours; marking one easy hands that time to the rest and lets it wait longer from its next review. A rating never defers a review you already owe, so nothing leaves the board while you are working down it." },
    ],
    tip: "An empty board is the goal, not a bug. It means nothing is due — pick a subject and push new content forward.",
  },
  {
    id: "subjects",
    icon: "subjects",
    title: "Subjects and stages",
    lead: "A subject carries its board, its qualification, its syllabus code and how the course is split.",
    items: [
      { term: "Stages", detail: "An A Level splits into AS and A2, an IB course into SL and HL, and a one-year course into neither. Each stage is tracked, paced and reported separately." },
      { term: "Where content lands", detail: "Content marked for the second stage — A2, or the IB's HL-only topics — sits in that track. Everything else belongs to the stage both years share." },
      { term: "Bring your own syllabus", detail: "A subject with no official tree yet takes a pasted outline: numbered headings become chapters, and the lines under them become points. CSV works too." },
      { term: "Papers per stage", detail: "Say which papers belong to which stage and any imported chapter tagged with that paper follows it." },
      { term: "Mark a stage as sat", detail: "Once AS is behind you, say so on the subject or in Subjects. Its points leave the review board, the counters and the calendar, so the queue only asks for work you can still do." },
    ],
    tip: "Marking a stage sat deletes nothing. Statuses, notes, history and dates all stay exactly where they were, the syllabus is still there to look at, and putting the stage back restores it to the board unchanged.",
  },
  {
    id: "goals",
    icon: "goals",
    title: "Syllabus goals",
    lead: "Turns “finish the syllabus by March” into a specific list of what to do on a specific day.",
    items: [
      { term: "One goal per stage", detail: "Set the finish date, weekly hours and how many days a week you study. The plan only ever lands on days you said you study." },
      { term: "Pacing", detail: "Steady spreads the work evenly, front-loaded gets the hard yards done early, and finish-line leaves more for the run-up." },
      { term: "It skips what is done", detail: "Points already Covered or Exam ready are left out, so the plan is the work that remains." },
      { term: "It adjusts", detail: "The required pace is recalculated from real progress, so falling behind changes the number rather than silently failing." },
      { term: "Time per point", detail: "Your weekly hours divided by the work still left. A point you have not started earns a full share, one you are practising earns less, and the plan says outright when the date leaves too little for either." },
      { term: "Difficulty moves the hours, not the total", detail: "Minutes per point is your plan's time divided by the work left, so rating a point hard takes minutes from the ones you called easy rather than adding any to your week. Your weekly target never changes — only where it goes." },
    ],
    tip: "Scheduled dates appear on the review board next to reviews, so the plan and the queue are the same list.",
  },
  {
    id: "exams",
    icon: "exams",
    title: "Exam planner",
    lead: "A goal paces a whole stage. A mock rarely covers a whole stage, so an exam asks which topics it actually includes.",
    items: [
      { term: "Pick the coverage", detail: "Tick whole chapters or individual points. A part-selected chapter shows how many of its points are in." },
      { term: "The run-up is scheduled", detail: "Your selection is spread across the days before the exam with the same pacing choices as a goal." },
      { term: "Overlapping exams are fine", detail: "A topic can belong to a mock and the real paper at once; each exam keeps its own dates." },
      { term: "Slippage is visible", detail: "Each exam shows progress, days left, and how many revision dates have gone past." },
      { term: "How long each day takes", detail: "The plan divides the exam's weekly hours across the topics it covers, so a revision day says what it will cost before you sit down to it." },
    ],
  },
  {
    id: "hours",
    icon: "hours",
    title: "Study hours",
    lead: "Time logging that feeds the schedule instead of sitting in a spreadsheet.",
    items: [
      { term: "Log the session", detail: "Minutes against a date and subject, with an optional note about what you did." },
      { term: "Tick what you covered", detail: "Attach the syllabus topics — they count as reviewed and are rescheduled, so logging the session is the only step." },
      { term: "Pick a window", detail: "7 days, 30, 90 or everything you have logged. Every figure on the screen answers for the one you pick — a week cannot tell a good week from an ordinary one, and it resets before a habit shows up in it." },
      { term: "Two kinds of average", detail: "What you average across every day of the window, and what you average on the days you actually studied. The gap between them is the honest measure of consistency, and it sits beside your streak." },
      { term: "Where the time goes", detail: "Each subject's share of the window, biggest first, so the course quietly getting none of it is impossible to miss." },
      { term: "When you study", detail: "Your average for each day of the week — the Sunday you always work and the Friday you never do." },
    ],
    tip: "The chart follows the window: a fortnight or less reads as days, anything longer as weeks counted back from today. Ninety daily bars is a texture rather than a trend.",
  },
  {
    id: "papers",
    icon: "papers",
    title: "Past papers",
    lead: "Every attempt, and what it tells you.",
    items: [
      { term: "Record the attempt", detail: "Score, total, percentage, grade, time taken, and whether it was timed, untimed or open book." },
      { term: "Plan ahead", detail: "Add a paper as planned, then fill in the result when you sit it." },
      { term: "Tag the weak topics", detail: "Say which topics cost the marks and the pattern across attempts becomes obvious." },
      { term: "The catalogue", detail: "Thousands of past papers are built in, filterable by subject, year, season, component and difficulty, with links to the paper, mark scheme and examiner report." },
      { term: "A number to beat", detail: "Set a grade target and every paper for that stage is scored against what the grade needs, as you type the marks in." },
    ],
  },
  {
    id: "grades",
    icon: "grades",
    title: "Grade targets",
    lead: "You have a result in hand. This is what the exam still to come has to do about it.",
    items: [
      { term: "Enter what you got", detail: "An AS result if you have sat one, or a mock if the course is sat in a single go. The grade and the mark — a percentage uniform mark, or a raw score out of its total." },
      { term: "Paper by paper", detail: "Where we can read the syllabus, the form lists the real components and what each is worth — 46% of the AS for Physics Paper 2, 50% of the IGCSE for a Chemistry theory paper. Tick the ones you sit, and what is banked is counted from them rather than estimated." },
      { term: "Or add your own", detail: "For a course we have not parsed, add the papers yourself: a name, what each is worth, and what it is marked out of. Every specification prints those in its assessment overview." },
      { term: "AS counts, a mock does not", detail: "An AS result carries half the A Level whatever happens next, so A2 only has to make up the difference. A mock carries nothing, so what you need is simply the boundary — and the mock says how far off it you are." },
      { term: "Your own ladder", detail: "A Levels are priced A* to E, IGCSEs A* to G, and International GCSEs 9 to 1. The subject picks the ladder from its qualification, and you can change it." },
      { term: "Every grade is priced", detail: "Not just the one you picked: the ladder shows what each overall grade would now cost you, and which are already out of reach." },
      { term: "Pick a target", detail: "Choose a grade from the ladder and its required percentage becomes the target every past paper for that stage is measured against." },
      { term: "Watch the projection", detail: "Your recent papers become a form figure, and the screen shows the overall grade that form would land. Until a paper is logged, a mock stands in for it." },
    ],
    tip: "An AS and an A2 are assumed to be weighted evenly, which is how an A Level that splits in two is put together — change the split on the form if your course differs. Boundaries move a mark or two each session, so every figure is close rather than exact.",
  },
  {
    id: "flashcards",
    icon: "flashcards",
    title: "Flashcards",
    lead: "Recall practice that knows which chapter it belongs to.",
    items: [
      { term: "Scoped decks", detail: "A deck belongs to a subject, a stage, and optionally one chapter." },
      { term: "Mastery", detail: "Rate recall on five levels; weaker cards come back sooner, and Due for review and Needs work collect them." },
      { term: "Import and export", detail: "CSV in and out, so decks you already have come across." },
    ],
  },
  {
    id: "tasks",
    icon: "tasks",
    title: "Tasks and notes",
    lead: "The work that is not a review, and the files behind it.",
    items: [
      { term: "Tasks", detail: "Homework, coursework, anything — with a subject, due date, priority and your own labels. Due ones surface on the review board." },
      { term: "Notes library", detail: "PDFs, Word, PowerPoint, text and images up to 20 MB, filed by subject, stage and chapter, and private to your account." },
    ],
  },
  {
    id: "calendar",
    icon: "calendar",
    title: "Calendar",
    lead: "One month view of everything with a date on it.",
    items: [
      { term: "What it shows", detail: "Reviews due, task deadlines, logged study sessions, goal milestones, scheduled syllabus points, exam revision and exam days." },
      { term: "What it is for", detail: "Seeing the week before it happens — where the load is, and which days are already full." },
      { term: "Show only what you want", detail: "The chips along the top turn each source on and off, so a month can be read as just its exams, or just what is due." },
    ],
  },
  {
    id: "history",
    icon: "trending",
    title: "History",
    lead: "Everything you have done, newest first — the answer to “what have I actually got through this week”.",
    items: [
      { term: "What it collects", detail: "Every review and status change, the notes you write on a topic, each session you log, each task you tick off and each paper you sit. All of it in one list." },
      { term: "Grouped by day", detail: "Today and yesterday are named and everything older carries its date, so a heavy day reads as a run of marks down the rail and a quiet one as a gap." },
      { term: "Filter by kind", detail: "The chips turn each kind on and off and carry the number of each you have logged." },
      { term: "What happened, not what was planned", detail: "The calendar shows what is scheduled; this shows what you did. A paper sat last week but recorded today sits under today, with the day you sat it beside it." },
    ],
    tip: "An empty week here is worth more than a full review board — it is the one screen that will not flatter you.",
  },
];
