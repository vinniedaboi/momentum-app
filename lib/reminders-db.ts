import { getSql } from "./db";

/**
 * Who is owed a reminder today, and what it should say.
 *
 * This is the only query in the app that reads across workspaces, because it
 * answers a question no signed-in learner is asking. Everything it returns is
 * addressed to one learner, and the route that sends it never mixes two.
 *
 * Subject names come out of `name` rather than `short_name`: a chip in the UI
 * has room for "Chem" and a sentence does not, and some of those abbreviations
 * ("C(-FL") are not words at all.
 *
 * Two audiences come out of it, because there are two different silences to
 * break:
 *
 *   * `digest` — someone in the review loop. Their mail is what is due today,
 *     and if nothing is, they hear nothing;
 *   * `activation` — someone who imported a syllabus and never marked a point
 *     on it. They have no review dates at all, so a digest would be empty for
 *     them every day forever. What they need is not a reminder of work waiting
 *     but a first step, and they get three of those in their first week and
 *     then silence.
 */

export type ReminderKind = "digest" | "activation";

export type DueTopic = { subject: string; code: string; title: string; status: string };
export type DueTask = { subject: string; title: string; dueDate: string; overdue: boolean };
export type NearExam = { subject: string; title: string; examDate: string; days: number; uncovered: number };
export type StartableSubject = { subject: string; points: number; firstCode: string | null; firstTitle: string | null };

export type Reminder = {
  workspaceId: string;
  email: string;
  name: string;
  kind: ReminderKind;
  /** How many things the mail has to say. A reminder with none is never sent. */
  items: number;
  reviews: DueTopic[];
  /** Everything due, not just the few the mail has room to name. */
  reviewsTotal: number;
  tasks: DueTask[];
  exams: NearExam[];
  subjects: StartableSubject[];
  /** Days since they finished onboarding, which paces the activation sequence. */
  daysSinceOnboarding: number;
};

/** An exam further out than this is not yet today's problem. */
const EXAM_HORIZON_DAYS = 14;

/**
 * The activation sequence, in days after onboarding. Three mails, then nothing:
 * someone who ignored all three is not waiting for a fourth, and continuing to
 * write to them costs the sender reputation that the digest depends on.
 */
const ACTIVATION_DAYS = [1, 3, 7];

/**
 * Sends since their last visit before the digest eases off, and before it stops.
 * A mail that did not bring someone back is evidence, and enough of them in a
 * row is an answer.
 */
const BACK_OFF_AFTER = 3;
const GIVE_UP_AFTER = 6;

/** Rows the digest query returns, one per candidate learner. */
type Candidate = {
  workspace_id: string;
  email: string;
  full_name: string | null;
  days_since_onboarding: number;
  studied_today: boolean;
  ever_active: boolean;
  unanswered: number;
  sent_today: boolean;
};

export async function remindersFor(today: string): Promise<Reminder[]> {
  const sql = getSql();

  // One pass to find who is even a candidate. The per-learner detail is fetched
  // below only for those who survive this, which at any real number of accounts
  // is a small fraction of them.
  const candidates = await sql<Candidate[]>`
    with last_visit as (
      select workspace_id, max(occurred_at) as seen_at
      from public.topic_activity group by workspace_id
    )
    select
      p.id as workspace_id,
      p.email,
      p.full_name,
      greatest(0, (${today}::date - p.onboarded_at::date))::int as days_since_onboarding,
      exists (
        select 1 from public.study_sessions s
        where s.workspace_id = p.id and s.study_date = ${today}
      ) as studied_today,
      (v.seen_at is not null) as ever_active,
      (
        select count(*) from public.notification_log n
        where n.workspace_id = p.id
          and n.sent_at > coalesce(v.seen_at::timestamptz, '-infinity'::timestamptz)
      )::int as unanswered,
      exists (
        select 1 from public.notification_log n
        where n.workspace_id = p.id and n.sent_on = ${today}::date
      ) as sent_today
    from public.profiles p
    left join last_visit v on v.workspace_id = p.id
    where p.reminder_email
      and p.onboarded_at is not null
      and p.email is not null and p.email <> ''
  `;

  const reminders: Reminder[] = [];
  for (const row of candidates) {
    // Someone who has already opened the app today does not need telling.
    if (row.studied_today || row.sent_today) continue;
    if (row.unanswered >= GIVE_UP_AFTER) continue;
    // Eased off: one a week rather than one a day, on the day they onboarded.
    if (row.unanswered >= BACK_OFF_AFTER && row.days_since_onboarding % 7 !== 0) continue;

    const kind: ReminderKind = row.ever_active ? "digest" : "activation";
    if (kind === "activation" && !ACTIVATION_DAYS.includes(row.days_since_onboarding)) continue;

    const reminder = kind === "digest"
      ? await digestFor(row, today)
      : await activationFor(row);

    // Nothing to say is a reason not to write. A mail that reports an empty
    // queue teaches its reader that the next one is not worth opening either.
    if (reminder.items > 0) reminders.push(reminder);
  }
  return reminders;
}

function base(row: Candidate, kind: ReminderKind): Reminder {
  return {
    workspaceId: row.workspace_id,
    email: row.email,
    name: (row.full_name ?? "").trim().split(/\s+/)[0] || "there",
    kind,
    items: 0,
    reviews: [],
    reviewsTotal: 0,
    tasks: [],
    exams: [],
    subjects: [],
    daysSinceOnboarding: row.days_since_onboarding,
  };
}

async function digestFor(row: Candidate, today: string): Promise<Reminder> {
  const sql = getSql();
  const reminder = base(row, "digest");

  reminder.reviews = await sql<DueTopic[]>`
    select coalesce(s.name, s.short_name, t.subject_id) as subject,
           t.code, t.title, t.status
    from public.topics t
    left join public.subjects s
      on s.workspace_id = t.workspace_id and s.id = t.subject_id
    where t.workspace_id = ${row.workspace_id}
      and t.kind = 'point'
      and t.review_due is not null
      and t.review_due <= ${today}
    order by t.review_due, t.code
    limit 12
  `;

  // Counted separately, because the list above is capped at what a mail can
  // usefully name and the subject line still has to say the true number.
  const [{ total }] = await sql<{ total: number }[]>`
    select count(*)::int as total from public.topics
    where workspace_id = ${row.workspace_id}
      and kind = 'point'
      and review_due is not null
      and review_due <= ${today}
  `;
  reminder.reviewsTotal = total;

  reminder.tasks = await sql<DueTask[]>`
    select coalesce(s.name, s.short_name, k.subject_id) as subject,
           k.title, k.due_date as "dueDate", (k.due_date < ${today}) as overdue
    from public.study_tasks k
    left join public.subjects s
      on s.workspace_id = k.workspace_id and s.id = k.subject_id
    where k.workspace_id = ${row.workspace_id}
      and not k.completed
      and k.due_date <= ${today}
    order by k.due_date
    limit 8
  `;

  reminder.exams = await sql<NearExam[]>`
    select coalesce(s.name, s.short_name, e.subject_id) as subject,
           e.title, e.exam_date as "examDate",
           (e.exam_date::date - ${today}::date)::int as days,
           (
             select count(*) from public.exam_topics x
             join public.topics t
               on t.workspace_id = x.workspace_id and t.id = x.topic_id
             where x.workspace_id = e.workspace_id and x.exam_id = e.id
               and t.status = 'Not Started'
           )::int as uncovered
    from public.exams e
    left join public.subjects s
      on s.workspace_id = e.workspace_id and s.id = e.subject_id
    where e.workspace_id = ${row.workspace_id}
      and e.exam_date >= ${today}
      and e.exam_date::date <= (${today}::date + ${EXAM_HORIZON_DAYS}::int)
    order by e.exam_date
    limit 4
  `;

  reminder.items = reminder.reviewsTotal + reminder.tasks.length + reminder.exams.length;
  return reminder;
}

async function activationFor(row: Candidate): Promise<Reminder> {
  const sql = getSql();
  const reminder = base(row, "activation");

  // The syllabus they imported and have not opened, with the point the app
  // would start them on, so the mail can name a first step rather than ask for
  // one. `order by seq` is the syllabus's own order, so this is point 1.1.
  reminder.subjects = await sql<StartableSubject[]>`
    select
      coalesce(s.name, s.short_name, s.id) as subject,
      count(*) filter (where t.kind = 'point')::int as points,
      (array_agg(t.code order by t.source_row) filter (where t.kind = 'point'))[1] as "firstCode",
      (array_agg(t.title order by t.source_row) filter (where t.kind = 'point'))[1] as "firstTitle"
    from public.subjects s
    join public.topics t
      on t.workspace_id = s.workspace_id and t.subject_id = s.id
    where s.workspace_id = ${row.workspace_id}
      and not s.archived
    group by s.id, s.name, s.short_name
    having count(*) filter (where t.kind = 'point') > 0
    order by count(*) filter (where t.kind = 'point') desc
    limit 3
  `;

  reminder.items = reminder.subjects.length;
  return reminder;
}

/**
 * Records a send. Returns false when this learner already had one of this kind
 * today, which is how a retried cron run stops short of a second mail: the
 * unique index is the arbiter, not the caller's memory of what it did.
 */
export async function recordSend(input: {
  workspaceId: string;
  kind: ReminderKind;
  sentOn: string;
  items: number;
  messageId: string | null;
}) {
  const sql = getSql();
  const rows = await sql`
    insert into public.notification_log (workspace_id, kind, sent_on, items, provider_message_id)
    values (${input.workspaceId}, ${input.kind}, ${input.sentOn}::date, ${input.items}, ${input.messageId})
    on conflict (workspace_id, kind, sent_on) do nothing
    returning id
  `;
  return rows.length > 0;
}

/** Turns the daily digest off for one learner, from a link with no session behind it. */
export async function stopReminders(workspaceId: string) {
  const sql = getSql();
  const rows = await sql`
    update public.profiles set reminder_email = false, updated_at = now()
    where id = ${workspaceId}
    returning id
  `;
  return rows.length > 0;
}
