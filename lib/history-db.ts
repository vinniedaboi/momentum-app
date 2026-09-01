import { getSql } from "./db";

/**
 * Everything a learner has done, newest first.
 *
 * The app already records each kind of work as it happens — a status change, a
 * review, a note, a logged session, a finished task, a paper sat — but each one
 * only ever showed up where it was made. A topic's timeline knows its own
 * history and nothing else; the calendar knows what is scheduled but not what
 * was done. This is the one place that answers "what have I actually done".
 *
 * It is a union rather than a table. Writing every event a second time into a
 * combined log would give two sources for the same fact and, eventually, two
 * different answers — so the feed is assembled at read time from the rows that
 * already exist, and nothing new has to be kept in step.
 *
 * Order is by when a thing was *recorded*, not by the date it happened: a paper
 * sat last week and logged today belongs at today in a list of what you did.
 * Where those differ the row carries both, and the UI says so.
 */

export const HISTORY_KINDS = ["review", "status", "note", "session", "paper", "task"] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  /** ISO timestamp the row is ordered by. */
  at: string;
  /** The day the work happened, when that is not the day it was recorded. */
  happenedOn: string | null;
  subject: string | null;
  title: string;
  detail: string | null;
};

export type HistoryPage = {
  entries: HistoryEntry[];
  /** Passed back as `before` to fetch the next page. */
  nextCursor: string | null;
};

const PAGE = 40;

function mapRow(row: Record<string, unknown>): HistoryEntry {
  return {
    id: String(row.id),
    kind: row.kind as HistoryKind,
    at: String(row.at),
    happenedOn: row.happened_on ? String(row.happened_on) : null,
    subject: row.subject ? String(row.subject) : null,
    title: String(row.title ?? ""),
    detail: row.detail ? String(row.detail) : null,
  };
}

/**
 * One page of history. `before` is the `at` of the last row already shown, so
 * paging is by cursor rather than by offset — an offset would skip or repeat
 * rows as new activity arrives above it.
 */
export async function getHistory(
  workspaceId: string,
  options: { before?: string | null; kinds?: HistoryKind[] } = {},
): Promise<HistoryPage> {
  const sql = getSql();
  const before = options.before || "9999-12-31";
  const kinds = options.kinds?.length
    ? options.kinds.filter((kind) => HISTORY_KINDS.includes(kind))
    : [...HISTORY_KINDS];
  if (!kinds.length) return { entries: [], nextCursor: null };

  const rows = await sql<Record<string, unknown>[]>`
    with events as (
      -- A topic reviewed, moved between statuses, or annotated.
      select
        'act-' || activity.id            as id,
        activity.event_type              as kind,
        activity.occurred_at             as at,
        null::text                       as happened_on,
        coalesce(subjects.name, subjects.short_name, topics.subject_id) as subject,
        topics.code || ' · ' || topics.title as title,
        case activity.event_type
          when 'status' then coalesce(activity.from_status, 'Not Started') || ' → ' || coalesce(activity.to_status, '')
          when 'review' then 'Marked reviewed'
          else activity.note
        end                              as detail,
        topics.kind                      as topic_kind
      from public.topic_activity as activity
      join public.topics
        on topics.workspace_id = activity.workspace_id and topics.id = activity.topic_id
      left join public.subjects
        on subjects.workspace_id = topics.workspace_id and subjects.id = topics.subject_id
      where activity.workspace_id = ${workspaceId}

      union all

      -- Time logged, with the topics it was attached to.
      select
        'ses-' || sessions.id,
        'session',
        sessions.created_at,
        sessions.study_date,
        coalesce(subjects.name, subjects.short_name, sessions.subject_id),
        sessions.minutes || ' minutes logged',
        coalesce(
          sessions.note,
          (
            select case count(*)
              when 0 then null
              when 1 then '1 topic attached'
              else count(*)::text || ' topics attached'
            end
            from public.study_session_topics as link
            where link.workspace_id = sessions.workspace_id and link.session_id = sessions.id
          )
        ),
        null
      from public.study_sessions as sessions
      left join public.subjects
        on subjects.workspace_id = sessions.workspace_id and subjects.id = sessions.subject_id
      where sessions.workspace_id = ${workspaceId}

      union all

      -- A paper actually sat, not one still only planned.
      select
        'pap-' || papers.id,
        'paper',
        papers.created_at,
        papers.attempt_date,
        coalesce(subjects.name, subjects.short_name, papers.subject_id),
        coalesce(nullif(papers.paper_id, ''), 'Past paper'),
        case when papers.score is not null and papers.max_score is not null
          then papers.score || '/' || papers.max_score
               || coalesce(' · ' || round(papers.percentage)::text || '%', '')
               || coalesce(' · grade ' || papers.grade, '')
          else 'Attempt recorded' end,
        null
      from public.past_papers as papers
      left join public.subjects
        on subjects.workspace_id = papers.workspace_id and subjects.id = papers.subject_id
      where papers.workspace_id = ${workspaceId} and papers.status = 'done'

      union all

      -- A task ticked off.
      select
        'tsk-' || tasks.id,
        'task',
        tasks.completed_at,
        null,
        coalesce(subjects.name, subjects.short_name, tasks.subject_id),
        tasks.title,
        'Task completed',
        null
      from public.study_tasks as tasks
      left join public.subjects
        on subjects.workspace_id = tasks.workspace_id and subjects.id = tasks.subject_id
      where tasks.workspace_id = ${workspaceId}
        and tasks.completed and tasks.completed_at is not null
    )
    select id, kind, at, happened_on, subject, title, detail
    from events
    where kind = any(${kinds}::text[]) and at < ${before}
    order by at desc
    limit ${PAGE + 1}
  `;

  const entries = rows.slice(0, PAGE).map(mapRow);
  const nextCursor = rows.length > PAGE ? entries[entries.length - 1].at : null;
  return { entries, nextCursor };
}

/** How many of each kind there are, for the filter row. */
export async function getHistoryCounts(workspaceId: string) {
  const sql = getSql();
  const rows = await sql<{ kind: string; total: number }[]>`
    select event_type as kind, count(*)::int as total
    from public.topic_activity where workspace_id = ${workspaceId}
    group by event_type
    union all
    select 'session', count(*)::int from public.study_sessions where workspace_id = ${workspaceId}
    union all
    select 'paper', count(*)::int from public.past_papers
      where workspace_id = ${workspaceId} and status = 'done'
    union all
    select 'task', count(*)::int from public.study_tasks
      where workspace_id = ${workspaceId} and completed and completed_at is not null
  `;
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.kind] = (counts[row.kind] ?? 0) + Number(row.total);
  return counts;
}
