/**
 * Spreading a body of work across a window, shared by syllabus goals and the
 * exam planner. Both answer the same question — "if I have this much left and
 * this long to do it, when should each piece land?" — so the maths lives here
 * rather than in two places that can drift.
 */

export const PACE_MODES = ["steady", "front-loaded", "finish-line"] as const;
export type PaceMode = (typeof PACE_MODES)[number];

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000));
}

/**
 * Bends an even 0..1 progression. Front-loading pushes work earlier, so the
 * curve sits below the diagonal; a finish-line push does the opposite.
 */
export function paceFraction(fraction: number, mode: PaceMode) {
  if (mode === "front-loaded") return Math.pow(fraction, 1.3);
  if (mode === "finish-line") return Math.pow(fraction, 0.72);
  return fraction;
}

/** Pushes an offset onto the nearest day of the week the learner studies. */
export function snapToStudyDay(offset: number, studyDays: number) {
  if (studyDays >= 7) return offset;
  const allowed = studyDays === 1
    ? [0]
    : Array.from({ length: studyDays }, (_, index) => Math.round(index * 6 / (studyDays - 1)));
  const week = Math.floor(offset / 7);
  const day = offset % 7;
  const next = allowed.find((allowedDay) => allowedDay >= day);
  return next == null ? (week + 1) * 7 + allowed[0] : week * 7 + next;
}

export type PacingWindow = {
  startDate: string;
  endDate: string;
  paceMode: PaceMode;
  studyDays: number;
};

/**
 * One date per item, in order, none later than the deadline. Positions come
 * from the item's place in the sequence rather than the calendar, so a plan
 * stays evenly weighted however long the window is.
 */
export function pacedDates(count: number, window: PacingWindow): string[] {
  if (count <= 0) return [];
  const totalDays = daysBetween(window.startDate, window.endDate);

  return Array.from({ length: count }, (_, index) => {
    const progress = (index + 1) / count;
    const rawOffset = Math.round(totalDays * paceFraction(progress, window.paceMode));
    const scheduled = addDays(window.startDate, snapToStudyDay(rawOffset, window.studyDays));
    return scheduled > window.endDate ? window.endDate : scheduled;
  });
}
