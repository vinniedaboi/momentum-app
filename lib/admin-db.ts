import { getSql } from "./db";
import { HISTORY_KINDS, type HistoryKind } from "./history-db";

/**
 * What every account has been doing, for whoever runs the service.
 *
 * This is the one module in the app that deliberately does *not* filter on
 * `workspace_id`. Everything in lib/*-db.ts is tenant code and reads exactly
 * one account; this reads all of them, and the only thing standing in front of
 * it is `withAdmin` in lib/admin.ts. Nothing here may be called from a route
 * that is not behind that gate.
 *
 * The feed is the same union the learner's own history is assembled from — see
 * lib/history-db.ts, and keep the two in step: an event kind added there and
 * not here is one the console silently stops reporting.
 *
 * ## What it deliberately does not show
 *
 * An operator needs to know what happened, not to read what people wrote. So
 * every row carries the *shape* of the action — its kind, its account, its
 * subject, the syllabus topic's own code and title, minutes, marks — and none
 * of the free text a learner typed: topic notes, session notes and task titles
 * are replaced with a plain description of the action. The rest of the row is
 * either the app's own vocabulary or the exam board's.
 *
 * The redactions are the three `-- redacted` lines below. Removing them is a
 * deliberate choice about your users' privacy, not a bug fix.
 */

export type AdminEvent = {
  id: string;
  kind: HistoryKind;
  /** ISO timestamp the feed is ordered by. Every source column is text UTC. */
  at: string;
  /** The day the work happened, when that is not the day it was recorded. */
  happenedOn: string | null;
  workspaceId: string;
  email: string | null;
  fullName: string | null;
  subject: string | null;
  title: string;
  detail: string | null;
};

export type AdminEventPage = {
  events: AdminEvent[];
  /** Passed back as `before` for the next page. */
  nextCursor: string | null;
};

/** One account, and how much of the app it has actually touched. */
export type AdminAccount = {
  workspaceId: string;
  email: string | null;
  fullName: string | null;
  createdAt: string | null;
  onboardedAt: string | null;
  /** The most recent thing of any kind, or null for an account that has done none. */
  lastActive: string | null;
  subjects: number;
  topics: number;
  sessions: number;
  minutes: number;
  activity: number;
  papers: number;
};

const PAGE = 50;

/**
 * How many accounts the console lists.
 *
 * Generous for a service this size and still a bound: a page that grows a row
 * per signup forever is one that eventually times out on the query rather than
 * on the rendering, which is the harder failure to diagnose.
 */
const ACCOUNT_LIMIT = 500;

function mapEvent(row: Record<string, unknown>): AdminEvent {
  return {
    id: String(row.id),
    kind: row.kind as HistoryKind,
    at: String(row.at),
    happenedOn: row.happened_on ? String(row.happened_on) : null,
    workspaceId: String(row.workspace_id),
    email: row.email ? String(row.email) : null,
    fullName: row.full_name ? String(row.full_name) : null,
    subject: row.subject ? String(row.subject) : null,
    title: String(row.title ?? ""),
    detail: row.detail ? String(row.detail) : null,
  };
}

/** Timestamptz comes back as a Date; every workspace table stores text UTC. */
function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * One page of everything, newest first.
 *
 * `before` is the `at` of the last row already shown rather than an offset,
 * for the same reason the learner's own feed pages that way: activity arrives
 * at the top, and an offset repeats or skips rows every time it does.
 *
 * `account` narrows to one workspace. It is compared as an empty-string
 * sentinel rather than a null so the predicate can sit in the outer query
 * without a cast on every branch of the union.
 */
export async function getAdminActivity(options: {
  before?: string | null;
  kinds?: HistoryKind[];
  account?: string | null;
} = {}): Promise<AdminEventPage> {
  const sql = getSql();
  const before = options.before || "9999-12-31";
  const account = options.account ?? "";
  const kinds = options.kinds?.length
    ? options.kinds.filter((kind) => HISTORY_KINDS.includes(kind))
    : [...HISTORY_KINDS];
  if (!kinds.length) return { events: [], nextCursor: null };

  const rows = await sql<Record<string, unknown>[]>`
    with events as (
      -- A topic reviewed, moved between statuses, or annotated.
      select
        'act-' || activity.id            as id,
        activity.event_type              as kind,
        activity.occurred_at             as at,
        null::text                       as happened_on,
        topics.workspace_id              as workspace_id,
        coalesce(subjects.name, subjects.short_name, topics.subject_id) as subject,
        topics.code || ' · ' || topics.title as title,
        case activity.event_type
          when 'status' then coalesce(activity.from_status, 'Not Started') || ' → ' || coalesce(activity.to_status, '')
          when 'review' then 'Marked reviewed'
          -- redacted: the learner's own note on the topic.
          else 'Note added'
        end                              as detail
      from public.topic_activity as activity
      join public.topics
        on topics.workspace_id = activity.workspace_id and topics.id = activity.topic_id
      left join public.subjects
        on subjects.workspace_id = topics.workspace_id and subjects.id = topics.subject_id

      union all

      -- Time logged, and how much of the syllabus it was attached to.
      select
        'ses-' || sessions.id,
        'session',
        sessions.created_at,
        sessions.study_date,
        sessions.workspace_id,
        coalesce(subjects.name, subjects.short_name, sessions.subject_id),
        sessions.minutes || ' minutes logged',
        -- redacted: the note the learner wrote on the session.
        (
          select case count(*)
            when 0 then null
            when 1 then '1 topic attached'
            else count(*)::text || ' topics attached'
          end
          from public.study_session_topics as link
          where link.workspace_id = sessions.workspace_id and link.session_id = sessions.id
        )
      from public.study_sessions as sessions
      left join public.subjects
        on subjects.workspace_id = sessions.workspace_id and subjects.id = sessions.subject_id

      union all

      -- A paper actually sat, not one still only planned.
      select
        'pap-' || papers.id,
        'paper',
        papers.created_at,
        papers.attempt_date,
        papers.workspace_id,
        coalesce(subjects.name, subjects.short_name, papers.subject_id),
        coalesce(nullif(papers.paper_id, ''), 'Past paper'),
        case when papers.score is not null and papers.max_score is not null
          then papers.score || '/' || papers.max_score
               || coalesce(' · ' || round(papers.percentage)::text || '%', '')
               || coalesce(' · grade ' || papers.grade, '')
          else 'Attempt recorded' end
      from public.past_papers as papers
      left join public.subjects
        on subjects.workspace_id = papers.workspace_id and subjects.id = papers.subject_id
      where papers.status = 'done'

      union all

      -- A task ticked off. Its title is the learner's own words, so the row
      -- reports the subject it belonged to and nothing else.
      select
        'tsk-' || tasks.id,
        'task',
        tasks.completed_at,
        null,
        tasks.workspace_id,
        coalesce(subjects.name, subjects.short_name, tasks.subject_id),
        -- redacted: the title the learner gave the task.
        'Task completed',
        null
      from public.study_tasks as tasks
      left join public.subjects
        on subjects.workspace_id = tasks.workspace_id and subjects.id = tasks.subject_id
      where tasks.completed and tasks.completed_at is not null
    )
    select events.id, events.kind, events.at, events.happened_on, events.workspace_id,
           events.subject, events.title, events.detail,
           profiles.email, profiles.full_name
    from events
    left join public.profiles on profiles.id = events.workspace_id
    where events.kind = any(${kinds}::text[])
      and events.at < ${before}
      and (${account}::text = '' or events.workspace_id::text = ${account}::text)
    order by events.at desc
    limit ${PAGE + 1}
  `;

  const events = rows.slice(0, PAGE).map(mapEvent);
  const nextCursor = rows.length > PAGE ? events[events.length - 1].at : null;
  return { events, nextCursor };
}

/**
 * Every account, most recently active first.
 *
 * `last_active` is the latest of the same four things the feed is built from.
 * `greatest` ignores nulls in Postgres, so an account that has logged time but
 * never sat a paper still reports the time — and one that has done nothing at
 * all reports null rather than an epoch, which is a different and useful fact.
 *
 * The comparison is lexicographic because every workspace table stores its
 * timestamps as ISO-8601 UTC text, where that ordering is the chronological
 * one. `profiles.created_at` is a real timestamptz and is left out of the
 * `greatest` for exactly that reason: signing up is not activity.
 */
export async function getAdminAccounts(): Promise<AdminAccount[]> {
  const sql = getSql();
  const rows = await sql<Record<string, unknown>[]>`
    select
      profiles.id,
      profiles.email,
      profiles.full_name,
      profiles.created_at,
      profiles.onboarded_at,
      (select count(*)::int from public.subjects
        where subjects.workspace_id = profiles.id and not subjects.archived) as subjects,
      (select count(*)::int from public.topics
        where topics.workspace_id = profiles.id) as topics,
      (select count(*)::int from public.study_sessions
        where study_sessions.workspace_id = profiles.id) as sessions,
      (select coalesce(sum(study_sessions.minutes), 0)::int from public.study_sessions
        where study_sessions.workspace_id = profiles.id) as minutes,
      (select count(*)::int from public.topic_activity
        where topic_activity.workspace_id = profiles.id) as activity,
      (select count(*)::int from public.past_papers
        where past_papers.workspace_id = profiles.id and past_papers.status = 'done') as papers,
      greatest(
        (select max(topic_activity.occurred_at) from public.topic_activity
          where topic_activity.workspace_id = profiles.id),
        (select max(study_sessions.created_at) from public.study_sessions
          where study_sessions.workspace_id = profiles.id),
        (select max(past_papers.created_at) from public.past_papers
          where past_papers.workspace_id = profiles.id),
        (select max(study_tasks.completed_at) from public.study_tasks
          where study_tasks.workspace_id = profiles.id and study_tasks.completed)
      ) as last_active
    from public.profiles
    order by last_active desc nulls last, profiles.created_at desc
    limit ${ACCOUNT_LIMIT}
  `;

  return rows.map((row) => ({
    workspaceId: String(row.id),
    email: row.email ? String(row.email) : null,
    fullName: row.full_name ? String(row.full_name) : null,
    createdAt: isoOrNull(row.created_at),
    onboardedAt: isoOrNull(row.onboarded_at),
    lastActive: isoOrNull(row.last_active),
    subjects: Number(row.subjects ?? 0),
    topics: Number(row.topics ?? 0),
    sessions: Number(row.sessions ?? 0),
    minutes: Number(row.minutes ?? 0),
    activity: Number(row.activity ?? 0),
    papers: Number(row.papers ?? 0),
  }));
}
