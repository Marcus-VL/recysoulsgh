create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.collection_points (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  region text not null default '',
  point_type text not null check (point_type in ('feira', 'uefs')),
  accepted_materials text[] not null default '{}',
  hours text not null default '',
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, point_type),
  check (latitude between -90 and 90),
  check (longitude between -180 and 180)
);

create table if not exists public.point_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  address text not null default '',
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.point_suggestions
  alter column user_id drop not null;

create table if not exists public.destination_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  material text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.content_entries (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('philosophy', 'quiz')),
  target_id text,
  title text not null,
  body text not null,
  options jsonb not null default '[]'::jsonb,
  correct_answer integer,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (section = 'philosophy' and correct_answer is null)
    or (section = 'quiz' and correct_answer between 0 and 10)
  )
);

alter table public.content_entries
  add column if not exists target_id text;
create unique index if not exists content_entries_target_id_key
  on public.content_entries (target_id)
  where target_id is not null;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to anon, authenticated;

alter table public.profiles enable row level security;
alter table public.collection_points enable row level security;
alter table public.point_suggestions enable row level security;
alter table public.destination_reports enable row level security;
alter table public.content_entries enable row level security;
alter table public.app_admins enable row level security;

drop policy if exists "Users read their profile" on public.profiles;
create policy "Users read their profile" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users create their profile" on public.profiles;
create policy "Users create their profile" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users update their profile" on public.profiles;
create policy "Users update their profile" on public.profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Anyone reads collection points" on public.collection_points;
create policy "Anyone reads collection points" on public.collection_points
  for select to anon, authenticated using (true);
drop policy if exists "Admins manage collection points" on public.collection_points;
create policy "Admins manage collection points" on public.collection_points
  for all to authenticated using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "Users read their point suggestions" on public.point_suggestions;
create policy "Users read their point suggestions" on public.point_suggestions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users submit point suggestions" on public.point_suggestions;
create policy "Users submit point suggestions" on public.point_suggestions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Anyone submits anonymous point suggestions" on public.point_suggestions;
create policy "Anyone submits anonymous point suggestions" on public.point_suggestions
  for insert to anon with check (user_id is null and status = 'pending');
drop policy if exists "Admins read point suggestions" on public.point_suggestions;
create policy "Admins read point suggestions" on public.point_suggestions
  for select to authenticated using (public.is_app_admin());
drop policy if exists "Admins update point suggestions" on public.point_suggestions;
create policy "Admins update point suggestions" on public.point_suggestions
  for update to authenticated using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "Users read their destination reports" on public.destination_reports;
create policy "Users read their destination reports" on public.destination_reports
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users submit destination reports" on public.destination_reports;
create policy "Users submit destination reports" on public.destination_reports
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Admins read destination reports" on public.destination_reports;

do $$
begin
  if to_regclass('public.onboarding_responses') is not null then
    execute 'drop policy if exists "Users read their onboarding" on public.onboarding_responses';
    execute 'drop policy if exists "Users submit their onboarding" on public.onboarding_responses';
    execute 'drop policy if exists "Users update their onboarding" on public.onboarding_responses';
    execute 'alter table public.onboarding_responses enable row level security';
    execute 'revoke all on table public.onboarding_responses from public, anon, authenticated';
  end if;

  if to_regclass('public.survey_feedback') is not null then
    execute 'drop policy if exists "Anyone submits anonymous survey feedback" on public.survey_feedback';
    execute 'drop policy if exists "Admins read anonymous survey feedback" on public.survey_feedback';
    execute 'alter table public.survey_feedback enable row level security';
    execute 'revoke all on table public.survey_feedback from public, anon, authenticated';
  end if;
end;
$$;

drop view if exists public.admin_feedback_summary;

drop policy if exists "Anyone reads published learning content" on public.content_entries;
create policy "Anyone reads published learning content" on public.content_entries
  for select to anon, authenticated using (published = true);
drop policy if exists "Admins manage learning content" on public.content_entries;
create policy "Admins manage learning content" on public.content_entries
  for all to authenticated using (public.is_app_admin())
  with check (public.is_app_admin());

drop policy if exists "Admins can identify themselves" on public.app_admins;
create policy "Admins can identify themselves" on public.app_admins
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.collection_points, public.content_entries to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
revoke all on public.point_suggestions from public, anon, authenticated;
grant insert on public.point_suggestions to anon;
grant select, insert, update on public.point_suggestions to authenticated;
grant select, insert on public.destination_reports to authenticated;
grant select, insert, update, delete on public.collection_points, public.content_entries to authenticated;
grant select on public.app_admins to authenticated;
delete from public.collection_points
where point_type = 'feira'
  and name in (
    'EcoPoint Centro',
    'EcoPoint Kalilândia',
    'EcoPoint Avenida Nóide Cerqueira',
    'EcoPoint Cidade Nova',
    'EcoPoint Feira VII',
    'EcoPoint Tomba'
  );

delete from public.collection_points
where id = '00000000-0000-4000-8000-000000000003'
  and name = 'MP.3 - Laboratório de Eletrônica'
  and point_type = 'uefs';

-- Create the admin account in Supabase Auth first, then add its auth.users UUID:
-- insert into public.app_admins (user_id)
-- select '<AUTH_USER_UUID>'::uuid
-- on conflict (user_id) do nothing;
