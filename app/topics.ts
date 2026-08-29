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

export { REVIEW_INTERVALS, STATUSES };
export type { StudyStatus };
