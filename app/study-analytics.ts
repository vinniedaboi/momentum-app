/**
 * What a pile of logged sessions actually says about how someone studies.
 *
 * The study screen could answer two questions — what did I do today, and what
 * did I do this week — which is enough to log against and not enough to learn
 * anything from. A week is too short to show a habit: it cannot tell a good
 * week from a normal one, it cannot say which subject is quietly getting none
 * of the time, and it resets before a streak means anything.
 *
 * So everything here takes a window, and every figure is reported against the
 * same one. The only inputs are a date and a number of minutes, which is all a
 * session carries — there are no start times, so nothing here pretends to know
 * what time of day anyone works.
 */

/** A syllabus topic a session says it covered. */
export type AnalyticsTopic = {
  id: string;
  code: string;
  title: string;
  kind: "chapter" | "point";
  /** The chapter a point sits inside; null for a chapter logged whole. */
  parentId: string | null;
};

export type AnalyticsSession = {
  studyDate: string;
  minutes: number;
  subjectId: string | null;
  topics: AnalyticsTopic[];
};

/** The windows the screen offers. `days` of null is everything ever logged. */
export const STUDY_RANGES = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
] as const;

export type RangeKey = (typeof STUDY_RANGES)[number]["key"];

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Inclusive of both ends, so a Monday to the next Monday is eight days. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Minutes per day, which almost everything below is counted from. */
export function dailyTotals(sessions: AnalyticsSession[]) {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    totals.set(session.studyDate, (totals.get(session.studyDate) ?? 0) + session.minutes);
  }
  return totals;
}

/**
 * Consecutive days ending today, and the longest run ever.
 *
 * Today not being logged yet does not break a streak — it is not over until
 * the day is. A run counted from yesterday is the honest reading at nine in
 * the morning, and it becomes today's the moment anything is logged.
 */
export function streaks(totals: Map<string, number>, today: string) {
  const days = [...totals.entries()].filter(([, minutes]) => minutes > 0).map(([date]) => date).sort();
  if (!days.length) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let index = 1; index < days.length; index += 1) {
    run = days[index] === addDays(days[index - 1], 1) ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const last = days[days.length - 1];
  let current = 0;
  if (last === today || last === addDays(today, -1)) {
    current = 1;
    for (let index = days.length - 1; index > 0; index -= 1) {
      if (days[index - 1] !== addDays(days[index], -1)) break;
      current += 1;
    }
  }
  return { current, longest };
}

export type Bucket = { key: string; label: string; start: string; end: string; minutes: number };

/**
 * The bars under the summary.
 *
 * A fortnight or less reads as days, because that is a rhythm you recognise —
 * which days of the week you actually sit down. Anything longer reads as
 * weeks, because ninety daily bars is a texture rather than a trend.
 */
export function buckets(totals: Map<string, number>, from: string, to: string): Bucket[] {
  const span = daysBetween(from, to);
  if (span <= 14) {
    return Array.from({ length: span }, (_, index) => {
      const date = addDays(from, index);
      return { key: date, label: date, start: date, end: date, minutes: totals.get(date) ?? 0 };
    });
  }

  // Weeks are counted back from the last day, so the rightmost bar is always
  // the week in progress rather than an arbitrary calendar week.
  const weeks: Bucket[] = [];
  for (let end = to; daysBetween(from, end) > 0; end = addDays(end, -7)) {
    const start = daysBetween(from, addDays(end, -6)) > 0 ? addDays(end, -6) : from;
    let minutes = 0;
    for (let date = start; date <= end; date = addDays(date, 1)) minutes += totals.get(date) ?? 0;
    weeks.unshift({ key: start, label: start, start, end, minutes });
  }
  return weeks;
}

export type StudyAnalytics = {
  from: string;
  to: string;
  /** Days in the window, whether or not anything was logged on them. */
  span: number;
  minutes: number;
  sessionCount: number;
  activeDays: number;
  /** Share of the window's days with anything logged, 0–100. */
  consistency: number;
  perDay: number;
  perActiveDay: number;
  best: { date: string; minutes: number } | null;
  longestSession: number;
  /** The same length of window immediately before this one, where there is one. */
  previousMinutes: number | null;
  /** Per cent up or down on that window, or null when there is nothing to compare. */
  change: number | null;
  streak: { current: number; longest: number };
  bySubject: Array<{
    subjectId: string | null;
    minutes: number;
    share: number;
    sessions: number;
    /** How many of that subject's minutes named a topic, for a filtered split. */
    topicMinutes: number;
  }>;
  /** What each topic got, biggest first. See the split below for what that means. */
  byTopic: TopicSplit[];
  /**
   * Minutes from sessions that named a topic at all — what `byTopic` divides
   * between them. Less than the window's total whenever anything was logged
   * without saying what it was on, which the screen has to admit rather than
   * let the shares quietly fail to add up.
   */
  topicMinutes: number;
  /** Average minutes on each weekday of the window, Sunday first. */
  byWeekday: number[];
  buckets: Bucket[];
  /** Topics marked reviewed by logging, which is the point of attaching them. */
  reviewed: number;
};

/** A topic's share of the time, and how many sittings it came from. */
export type TopicSplit = AnalyticsTopic & {
  /** The subject the sessions were logged under, for the row's own colour. */
  subjectId: string | null;
  minutes: number;
  /** Per cent of the window's whole total, not of the part that named a topic. */
  share: number;
  sessions: number;
};

/**
 * Everything the screen reports, over one window.
 *
 * `days` of null means all of it, which starts at the first session rather
 * than at some arbitrary epoch — a fortnight-old account should not be told it
 * has studied on 2% of its days.
 */
export function studyAnalytics(
  sessions: AnalyticsSession[],
  today: string,
  days: number | null,
): StudyAnalytics {
  const totals = dailyTotals(sessions);
  const earliest = sessions.reduce<string | null>(
    (found, session) => (!found || session.studyDate < found ? session.studyDate : found), null);
  const from = days ? addDays(today, -(days - 1)) : earliest ?? today;
  const to = today;
  const span = Math.max(1, daysBetween(from, to));

  const inRange = sessions.filter((session) => session.studyDate >= from && session.studyDate <= to);
  const minutes = inRange.reduce((sum, session) => sum + session.minutes, 0);

  let activeDays = 0;
  let best: { date: string; minutes: number } | null = null;
  const weekdayMinutes = [0, 0, 0, 0, 0, 0, 0];
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (let index = 0; index < span; index += 1) {
    const date = addDays(from, index);
    const dayMinutes = totals.get(date) ?? 0;
    if (dayMinutes > 0) activeDays += 1;
    if (dayMinutes > 0 && (!best || dayMinutes > best.minutes)) best = { date, minutes: dayMinutes };
    const weekday = weekdayOf(date);
    weekdayMinutes[weekday] += dayMinutes;
    weekdayCounts[weekday] += 1;
  }

  // The window immediately before this one, so "up on last month" means the
  // month before rather than a calendar month that may not have happened yet.
  const previousFrom = addDays(from, -span);
  const previousTo = addDays(from, -1);
  const hasPrevious = Boolean(earliest && earliest <= previousTo);
  const previousMinutes = hasPrevious
    ? sessions
      .filter((session) => session.studyDate >= previousFrom && session.studyDate <= previousTo)
      .reduce((sum, session) => sum + session.minutes, 0)
    : null;

  const bySubject = [...inRange.reduce((groups, session) => {
    const current = groups.get(session.subjectId) ?? { minutes: 0, sessions: 0, topicMinutes: 0 };
    groups.set(session.subjectId, {
      minutes: current.minutes + session.minutes,
      sessions: current.sessions + 1,
      // The same distinction the window draws, drawn again per subject: a
      // split filtered to one course has to say what it is accounting for
      // there, not what the whole window came to.
      topicMinutes: current.topicMinutes + (session.topics.length ? session.minutes : 0),
    });
    return groups;
  }, new Map<string | null, { minutes: number; sessions: number; topicMinutes: number }>()).entries()]
    .map(([subjectId, entry]) => ({
      subjectId,
      minutes: entry.minutes,
      sessions: entry.sessions,
      topicMinutes: entry.topicMinutes,
      share: minutes ? Math.round((entry.minutes / minutes) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  /**
   * Where the hours went inside a subject.
   *
   * A session says how long it ran and which topics it covered, and nothing
   * whatever about how the time divided between them — so an even split is the
   * only division that does not quietly favour one topic over another. It also
   * keeps the parts adding back up to the session, which is what lets this be
   * read against the subject split without the two disagreeing about the same
   * hour. Sessions that named nothing are left out and counted separately.
   */
  const splits = new Map<string, TopicSplit>();
  let topicMinutes = 0;
  for (const session of inRange) {
    if (!session.topics.length) continue;
    topicMinutes += session.minutes;
    const each = session.minutes / session.topics.length;
    for (const topic of session.topics) {
      const current = splits.get(topic.id);
      if (current) {
        current.minutes += each;
        current.sessions += 1;
      } else {
        splits.set(topic.id, { ...topic, subjectId: session.subjectId, minutes: each, share: 0, sessions: 1 });
      }
    }
  }
  // Rounded once, at the end: a topic that took a third of three sessions is
  // owed the thirds it accumulated rather than three rounded fifths of an hour.
  const byTopic = [...splits.values()]
    .map((entry) => ({
      ...entry,
      minutes: Math.round(entry.minutes),
      share: minutes ? Math.round((entry.minutes / minutes) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes || a.code.localeCompare(b.code));

  return {
    from,
    to,
    span,
    minutes,
    sessionCount: inRange.length,
    activeDays,
    consistency: Math.round((activeDays / span) * 100),
    perDay: Math.round(minutes / span),
    perActiveDay: activeDays ? Math.round(minutes / activeDays) : 0,
    best,
    longestSession: inRange.reduce((most, session) => Math.max(most, session.minutes), 0),
    previousMinutes,
    change: previousMinutes ? Math.round(((minutes - previousMinutes) / previousMinutes) * 100) : null,
    streak: streaks(totals, today),
    bySubject,
    byTopic,
    topicMinutes,
    byWeekday: weekdayMinutes.map((total, index) => (weekdayCounts[index] ? Math.round(total / weekdayCounts[index]) : 0)),
    buckets: buckets(totals, from, to),
    reviewed: inRange.reduce((sum, session) => sum + session.topics.length, 0),
  };
}
