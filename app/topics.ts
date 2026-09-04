/**
 * A syllabus row and the tracking state attached to it.
 *
 * This sat in `study-tracker-app.tsx` and was imported from there by eight
 * views. It now has its own module so that `app/data` can describe the topics
 * endpoint without importing from the component that renders it.
 */

const STATUSES = ["Not Started", "Learning", "Practising", "Covered", "Exam Ready"] as const;
type StudyStatus = (typeof STATUSES)[number];

/**
 * Days a status parks a topic for before it comes back onto the review board.
 * The scheduler in lib/topics-db.ts reads this, and so does the guide, so what
 * a learner is told is what actually happens.
 *
 * These are the gaps an account starts with. A learner who wants a different
 * pace edits them, and their own numbers ride over this table everywhere the
 * scheduler reads it — see `ReviewPace` below.
 */
const REVIEW_INTERVALS: Record<StudyStatus, number> = {
  "Not Started": 0,
  Learning: 3,
  Practising: 7,
  Covered: 10,
  "Exam Ready": 14,
};

/**
 * The statuses whose gap a learner can set. "Not Started" is left out because
 * it has no gap to set: a point nobody has looked at is due now, and a learner
 * asking for that in five days is really asking not to have started it.
 */
const PACED_STATUSES = ["Learning", "Practising", "Covered", "Exam Ready"] as const;
type PacedStatus = (typeof PACED_STATUSES)[number];

/** One learner's own gaps, in days, for each status that has one. */
type ReviewPace = Record<PacedStatus, number>;

/** A day is the floor because the board works in whole calendar days. */
const MIN_REVIEW_DAYS = 1;
const MAX_REVIEW_DAYS = 180;

const DEFAULT_REVIEW_PACE: ReviewPace = {
  Learning: REVIEW_INTERVALS.Learning,
  Practising: REVIEW_INTERVALS.Practising,
  Covered: REVIEW_INTERVALS.Covered,
  "Exam Ready": REVIEW_INTERVALS["Exam Ready"],
};

/**
 * Three paces to start from, because most learners want "sooner" or "later"
 * rather than four numbers. Picking one fills the numbers in; editing any of
 * them afterwards is what makes the pace custom.
 */
const PACE_PRESETS = [
  {
    id: "intensive",
    label: "Intensive",
    note: "Tight gaps for an exam close enough to count in weeks.",
    pace: { Learning: 2, Practising: 4, Covered: 6, "Exam Ready": 9 } as ReviewPace,
  },
  {
    id: "standard",
    label: "Standard",
    note: "The default spacing, and a fair pace for a whole school year.",
    pace: DEFAULT_REVIEW_PACE,
  },
  {
    id: "relaxed",
    label: "Relaxed",
    note: "Longer gaps, for a syllabus you are working through slowly.",
    pace: { Learning: 5, Practising: 10, Covered: 16, "Exam Ready": 21 } as ReviewPace,
  },
] as const;

/** The preset a set of gaps matches exactly, or null once it has been edited. */
function matchingPreset(pace: ReviewPace) {
  return PACE_PRESETS.find((preset) =>
    PACED_STATUSES.every((status) => preset.pace[status] === pace[status]))?.id ?? null;
}

/**
 * A pace the scheduler can trust, whatever arrived. Anything missing, unparsable
 * or out of range falls back to the default for that status rather than
 * rejecting the lot, so one bad field cannot leave an account unschedulable.
 */
function normalisePace(input: Partial<Record<PacedStatus, unknown>> | null | undefined): ReviewPace {
  const pace = { ...DEFAULT_REVIEW_PACE };
  for (const status of PACED_STATUSES) {
    const value = Number(input?.[status]);
    if (!Number.isFinite(value)) continue;
    pace[status] = Math.min(MAX_REVIEW_DAYS, Math.max(MIN_REVIEW_DAYS, Math.round(value)));
  }
  return pace;
}

const DIFFICULTIES = ["easy", "normal", "hard"] as const;
type TopicDifficulty = (typeof DIFFICULTIES)[number];

/**
 * What a learner's own reading of a point does to the interval its status
 * earns. A point you are struggling with comes back at roughly half the
 * spacing; one you find obvious is parked for half as long again.
 *
 * Status says how far through the work you are, difficulty says how it lands on
 * you, and only the second is an opinion. Keeping them apart is what lets a
 * point be hard and exam ready at the same time.
 */
const DIFFICULTY_PACE: Record<TopicDifficulty, number> = {
  easy: 1.6,
  normal: 1,
  hard: 0.55,
};

/**
 * Days before a point comes back, given both. The scheduler in lib/topics-db.ts
 * writes what this returns and the guide quotes it, so a learner is never
 * promised a review in four days that the scheduler gives in seven.
 *
 * `pace` is the learner's own table of gaps; without one the defaults apply,
 * which is what every account had before the pace was theirs to set.
 *
 * "Not Started" is zero on purpose — it has no interval to bend, and a point
 * that has never been looked at is due now whatever anyone makes of it, so no
 * pace of any kind is allowed to move it.
 */
function reviewInterval(status: StudyStatus, difficulty: TopicDifficulty = "normal", pace?: ReviewPace) {
  const base = pace && status !== "Not Started" ? pace[status] : REVIEW_INTERVALS[status];
  return base ? Math.max(1, Math.round(base * DIFFICULTY_PACE[difficulty])) : base;
}

export type Topic = {
  id: string;
  subjectId: string;
  sourceRow: number;
  paper: string | null;
  academicLevel: string | null;
  retake: boolean;
  section: string | null;
  code: string;
  title: string;
  kind: "chapter" | "point";
  parentId: string | null;
  inScope: boolean;
  status: StudyStatus;
  /** The learner's own reading of it. Unrated points are "normal". */
  difficulty: TopicDifficulty;
  confidence: number | null;
  reviewedOn: string | null;
  reviewedAt: string | null;
  reviewDue: string | null;
  goalDue: string | null;
  examQuestions: number;
  lastTestPct: number | null;
  priority: string | null;
  notes: string | null;
  updatedAt: string;
};

export {
  DEFAULT_REVIEW_PACE, DIFFICULTIES, DIFFICULTY_PACE, MAX_REVIEW_DAYS, MIN_REVIEW_DAYS,
  PACED_STATUSES, PACE_PRESETS, REVIEW_INTERVALS, STATUSES, matchingPreset, normalisePace, reviewInterval,
};
export type { PacedStatus, ReviewPace, StudyStatus, TopicDifficulty };
