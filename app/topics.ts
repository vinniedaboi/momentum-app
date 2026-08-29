/**
 * A syllabus row and the tracking state attached to it.
 *
 * This sat in `study-tracker-app.tsx` and was imported from there by eight
 * views. It now has its own module so that `app/data` can describe the topics
 * endpoint without importing from the component that renders it.
 */

const STATUSES = ["Not Started", "Learning", "Practising", "Covered", "Exam Ready"] as const;
type StudyStatus = (typeof STATUSES)[number];

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

export { STATUSES };
export type { StudyStatus };
