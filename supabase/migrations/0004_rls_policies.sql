-- Row level security.
--
-- Two enforcement layers guard tenant data:
--
--   1. Every server-side query in lib/*-db.ts filters on `workspace_id`
--      explicitly. The app connects through the pooler as the `postgres` role,
--      which bypasses RLS, so this is the layer that actually scopes the app.
--   2. These policies scope the PostgREST / supabase-js surface reachable with
--      the publishable key from the browser. Without them the publishable key
--      would expose every row in the project.
--
-- Layer 2 is why the publishable key can safely ship to the client.

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- One owner-scoped policy per workspace table. `for all` covers
-- select/insert/update/delete with the same predicate, which is exactly the
-- rule we want: you may touch a row if, and only if, it is in your workspace.
do $$
declare
  workspace_table text;
begin
  foreach workspace_table in array array[
    'subjects',
    'topics',
    'topic_activity',
    'study_sessions',
    'study_session_topics',
    'study_tasks',
    'study_goals',
    'flashcard_decks',
    'flashcards',
    'past_papers',
    'paper_meta',
    'note_files'
  ]
  loop
    execute format('alter table public.%I enable row level security', workspace_table);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (workspace_id = (select auth.uid())) '
      || 'with check (workspace_id = (select auth.uid()))',
      workspace_table || '_workspace_owner',
      workspace_table
    );
  end loop;
end;
$$;

-- Shared reference data: readable by any signed-in user, written only by the
-- service role (which bypasses RLS), i.e. the offline import scripts.
do $$
declare
  shared_table text;
begin
  foreach shared_table in array array[
    'catalogue_papers',
    'syllabus_versions',
    'syllabus_content'
  ]
  loop
    execute format('alter table public.%I enable row level security', shared_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      shared_table || '_read_all',
      shared_table
    );
  end loop;
end;
$$;
