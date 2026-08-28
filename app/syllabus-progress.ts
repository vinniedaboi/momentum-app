export const PROGRESS_STATUSES = ["Not Started", "Learning", "Practising", "Covered", "Exam Ready"] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

/**
 * Syllabus progress is a scale, not a gate. A point you are actively working
 * through earns partial credit, so the number moves with real work instead of
 * sitting at zero until you are willing to claim mastery.
 */
export const PROGRESS_WEIGHTS: Record<ProgressStatus, number> = {
  "Not Started": 0,
  Learning: 0.25,
  Practising: 0.6,
  Covered: 0.85,
  "Exam Ready": 1,
};

/** Segments are drawn strongest first, so the bar reads as a maturity gradient. */
export const SEGMENT_ORDER = ["Exam Ready", "Covered", "Practising", "Learning"] as const;

export type ProgressBreakdown = {
  total: number;
  /** Weighted completion, 0-100. */
  percent: number;
  notStarted: number;
  learning: number;
  practising: number;
  covered: number;
  ready: number;
  /** Points at Covered or Exam Ready — the old all-or-nothing count. */
  coveredOrReady: number;
  /** Points past Not Started. */
  started: number;
  /** Share of points at Exam Ready, 0-100. */
  readyPercent: number;
};

export function progressWeight(status: string) {
  return PROGRESS_WEIGHTS[status as ProgressStatus] ?? 0;
}

export function syllabusProgress(points: Array<{ status: string }>): ProgressBreakdown {
  const total = points.length;
  const count = (status: ProgressStatus) => points.filter((point) => point.status === status).length;
  const learning = count("Learning");
  const practising = count("Practising");
  const covered = count("Covered");
  const ready = count("Exam Ready");
  const earned = points.reduce((sum, point) => sum + progressWeight(point.status), 0);
  return {
    total,
    percent: total ? Math.round((earned / total) * 100) : 0,
    notStarted: count("Not Started"),
    learning,
    practising,
    covered,
    ready,
    coveredOrReady: covered + ready,
    started: learning + practising + covered + ready,
    readyPercent: total ? Math.round((ready / total) * 100) : 0,
  };
}

export type ProgressSegment = { status: ProgressStatus; count: number; width: number };

/**
 * Widths are each status's weighted contribution, so the filled length of the
 * bar always equals the headline percentage.
 */
export function progressSegments(points: Array<{ status: string }>): ProgressSegment[] {
  const total = points.length;
  if (!total) return [];
  return SEGMENT_ORDER.map((status) => {
    const count = points.filter((point) => point.status === status).length;
    return { status, count, width: (count * PROGRESS_WEIGHTS[status] / total) * 100 };
  }).filter((segment) => segment.count > 0);
}

export function segmentSlug(status: ProgressStatus) {
  return status.toLowerCase().replaceAll(" ", "-");
}
