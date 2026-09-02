/** Client-side view of a configured subject, mirroring lib/subjects-db.ts. */
export const SUBJECT_TONES = ["blue", "violet", "coral", "teal", "amber", "rose", "lime", "slate"] as const;
export type SubjectTone = (typeof SUBJECT_TONES)[number];

export type Subject = {
  id: string;
  workspaceId: string;
  name: string;
  shortName: string | null;
  tone: SubjectTone;
  board: string | null;
  qualification: string | null;
  syllabusCode: string | null;
  stages: string[];
  paperStages: Record<string, string>;
  /** The stages already sat. See `stageIsDone` for what that changes. */
  completedStages: string[];
  position: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SubjectInput = {
  name: string;
  shortName: string | null;
  tone: SubjectTone;
  board: string | null;
  qualification: string | null;
  syllabusCode: string | null;
  stages: string[];
  paperStages: Record<string, string>;
};

/**
 * Whether a stage has been sat already.
 *
 * A stage marked done keeps everything it has — statuses, history, dates — and
 * only stops being asked for: its points leave the review board, the counters
 * and the calendar. That is the difference between this and archiving the
 * subject, which takes the other half of the course with it.
 */
export function stageIsDone(subject: Subject | null | undefined, stage: string) {
  return Boolean(subject?.completedStages.includes(stage));
}

/** Every stage of a subject has been sat, so nothing of it is still to come. */
export function subjectIsDone(subject: Subject) {
  return subject.stages.length > 0 && subject.stages.every((stage) => stageIsDone(subject, stage));
}

/** Subjects with a syllabus to track, in display order. */
export function activeSubjects(subjects: Subject[]) {
  return subjects.filter((subject) => !subject.archived && subject.stages.length > 0);
}

export function subjectById(subjects: Subject[]) {
  return new Map(subjects.map((subject) => [subject.id, subject]));
}

/**
 * Falls back to the raw id so rows referencing a deleted subject, or a
 * catalogue subject you do not track, still render something meaningful.
 */
export function subjectName(subjects: Subject[] | Map<string, Subject>, id: string | null | undefined) {
  if (!id) return "General study";
  const lookup = subjects instanceof Map ? subjects : subjectById(subjects);
  return lookup.get(id)?.name ?? id;
}

export function subjectTone(subjects: Subject[] | Map<string, Subject>, id: string | null | undefined) {
  if (!id) return "slate";
  const lookup = subjects instanceof Map ? subjects : subjectById(subjects);
  return lookup.get(id)?.tone ?? "slate";
}
