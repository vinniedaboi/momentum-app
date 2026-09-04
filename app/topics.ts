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

/**
 * The fewest points a day a catch-up will deal out, so a small syllabus does
 * not trickle back over a fortnight. Roughly one sitting's worth.
 */
const MIN_CATCH_UP_PER_DAY = 10;

/**
 * Reviews a day this pace asks for once it has settled.
 *
 * A point on a seven-day gap is a seventh of a review a day, so the whole
 * syllabus comes to the sum of those fractions. That is the load the learner
 * has just chosen, which makes it the honest rate to hand back work they are
 * suddenly behind on: no day of the catch-up is heavier than an ordinary day
 * will be once the new pace is running.
 */
function catchUpPerDay(intervals: number[]) {
  const rate = intervals.reduce((sum, days) => sum + 1 / Math.max(1, days), 0);
  return Math.max(MIN_CATCH_UP_PER_DAY, Math.ceil(rate));
}

/**
 * Where each point lands when the pace changes, as days from today.
 *
 * Re-dating every point from the day it was last studied is arithmetically
 * right and, on a tighter pace, useless: a whole syllabus turns overdue at
 * once, and a board reporting two hundred late reviews is telling a learner
 * nothing they can act on. Overdue should mean they fell behind, not that they
 * changed their mind about spacing.
 *
 * So nothing is allowed to land in the past. A point the new pace would have
 * put behind today is dealt back from today forward, the ones furthest past
 * their date first, at the rate above. Points the new pace leaves in the future
 * keep the date it gives them.
 *
 * The catch-up is self-limiting: dealing N points at a rate of at least
 * N / longest-gap a day empties the backlog inside one of those gaps, so a
 * learner is never handed a queue longer than the pace they asked for. Working
 * in offsets rather than dates keeps this pure integer arithmetic, and leaves
 * every calendar question with the caller.
 */
function repaceOffsets(points: Array<{ id: string; interval: number; dueIn: number }>) {
  const perDay = catchUpPerDay(points.map((point) => point.interval));
  const behind = points
    .filter((point) => point.dueIn < 0)
    // Furthest past its date first, and among equals the tightest gap, which is
    // the point the learner asked to see most often.
    .sort((a, b) => a.dueIn - b.dueIn || a.interval - b.interval);

  return [
    ...points.filter((point) => point.dueIn >= 0).map((point) => ({ id: point.id, dueIn: point.dueIn })),
    ...behind.map((point, index) => ({ id: point.id, dueIn: Math.floor(index / perDay) })),
  ];
}

export {
  DEFAULT_REVIEW_PACE, DIFFICULTIES, DIFFICULTY_PACE, MAX_REVIEW_DAYS, MIN_CATCH_UP_PER_DAY, MIN_REVIEW_DAYS,
  PACED_STATUSES, PACE_PRESETS, REVIEW_INTERVALS, STATUSES, catchUpPerDay, matchingPreset, normalisePace,
  repaceOffsets, reviewInterval,
};
export type { PacedStatus, ReviewPace, StudyStatus, TopicDifficulty };
