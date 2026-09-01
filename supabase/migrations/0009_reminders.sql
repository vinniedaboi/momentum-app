-- Reminder emails, and the record of what has been sent.
--
-- The app knows what a learner owes today — topics whose review has come round,
-- tasks past their date, an exam close enough to matter — and until now it only
-- said so to someone already looking at it. These two additions let a scheduled
-- job say it by email to someone who is not.
--
-- `notification_log` is doing three jobs at once, which is why it is a table and
-- not a timestamp on the profile:
--
--   * it makes a send idempotent. The unique index is what stops a retried cron
--     run from sending twice, rather than trusting the scheduler to fire once;
--   * it is the back-off state. A send with no visit after it is a send that did
--     not work, and counting those is what decides to ease off and then stop;
--   * it is the measurement. Comparing a send against the activity that follows
--     it is the only way to learn whether any of this is worth doing.

alter table public.profiles
  add column if not exists reminder_email boolean not null default true;

comment on column public.profiles.reminder_email is
  'Whether this learner wants the daily digest. Cleared by the unsubscribe link, which needs no session.';

create table public.notification_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.profiles (id) on delete cascade,
  -- `digest` is what is due today. `activation` is the finite sequence that goes
  -- to someone who imported a syllabus and never marked anything on it: they
  -- have no review dates, so a digest would have nothing to tell them and would
  -- suppress itself forever.
  kind text not null check (kind in ('digest', 'activation')),
  sent_on date not null,
  sent_at timestamptz not null default now(),
  -- How much the mail had to say. Zero should never be sent, so a zero here is a
  -- bug worth seeing in the table.
  items integer not null default 0,
  provider_message_id text
);

-- One of each kind per learner per day, enforced here rather than hoped for.
create unique index idx_notification_log_once
  on public.notification_log (workspace_id, kind, sent_on);

create index idx_notification_log_recent
  on public.notification_log (workspace_id, sent_at desc);

comment on table public.notification_log is
  'One row per reminder sent. Unique per (workspace, kind, day), which is what makes a repeated cron run safe.';

alter table public.notification_log enable row level security;

-- Read-only to the owner: a learner may see what was sent to them, and only the
-- cron job — which connects as `postgres` and bypasses RLS — ever writes here.
create policy notification_log_owner_reads on public.notification_log
  for select to authenticated
  using (workspace_id = (select auth.uid()));
