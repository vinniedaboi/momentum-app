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
 */
const REVIEW_INTERVALS: Record<StudyStatus, number> = {
  "Not Started": 0,
  Learning: 3,
  Practising: 7,
  Covered: 10,
  "Exam Ready": 14,
};

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
 * "Not Started" is zero on purpose — it has no interval to bend, and a point
 * that has never been looked at is due now whatever anyone makes of it.
 */
function reviewInterval(status: StudyStatus, difficulty: TopicDifficulty = "normal") {
  const base = REVIEW_INTERVALS[status];
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

export { DIFFICULTIES, DIFFICULTY_PACE, REVIEW_INTERVALS, STATUSES, reviewInterval };
export type { StudyStatus, TopicDifficulty };
