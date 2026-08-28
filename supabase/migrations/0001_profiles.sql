-- Account profile, one row per Supabase auth user. This is the tenant root:
-- every workspace-scoped table stores `workspace_id = profiles.id = auth.uid()`.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  -- Onboarding answers. Kept on the profile so the app can tailor defaults
  -- (exam board, target year) without re-asking on every device.
  exam_board text,
  qualification text,
  target_year integer,
  weekly_hours_target integer not null default 10,
  timezone text not null default 'Asia/Singapore',
  -- Null until the user finishes onboarding; the app gate reads this.
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user. profiles.id doubles as the workspace_id on every tenant table.';

-- Provision the profile on signup so the app never has to race the first write.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
