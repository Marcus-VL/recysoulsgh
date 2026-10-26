create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.onboarding_responses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  previous_disposal text not null,
  knows_collection_point boolean not null default false,
  known_point text,
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
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text not null default '',
  notes text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.destination_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  destination text not null,
  material text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.survey_feedback (
  id uuid primary key default gen_random_uuid(),
  previous_disposal text not null check (
    previous_disposal in ('lixo_comum', 'guardo', 'loja_assistencia', 'ecoponto', 'outro')
  ),
  knows_collection_point boolean,
  known_point text,
  created_at timestamptz not null default now(),
  check (known_point is null or length(known_point) <= 300)
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
alter table public.onboarding_responses enable row level security;
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

drop policy if exists "Users read their onboarding" on public.onboarding_responses;
create policy "Users read their onboarding" on public.onboarding_responses
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users submit their onboarding" on public.onboarding_responses;
create policy "Users submit their onboarding" on public.onboarding_responses
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users update their onboarding" on public.onboarding_responses;
create policy "Users update their onboarding" on public.onboarding_responses
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
drop policy if exists "Admins manage point suggestions" on public.point_suggestions;

drop policy if exists "Users read their destination reports" on public.destination_reports;
create policy "Users read their destination reports" on public.destination_reports
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users submit destination reports" on public.destination_reports;
create policy "Users submit destination reports" on public.destination_reports
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Admins read destination reports" on public.destination_reports;

alter table public.survey_feedback enable row level security;
drop policy if exists "Anyone submits anonymous survey feedback" on public.survey_feedback;
create policy "Anyone submits anonymous survey feedback" on public.survey_feedback
  for insert to anon, authenticated with check (true);

create or replace view public.admin_feedback_summary as
select previous_disposal, knows_collection_point, nullif(btrim(known_point), '') as known_point,
       count(*)::bigint as response_count
from public.survey_feedback
where public.is_app_admin()
group by previous_disposal, knows_collection_point, nullif(btrim(known_point), '');

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
grant select, insert, update on public.profiles, public.onboarding_responses to authenticated;
grant select, insert on public.point_suggestions, public.destination_reports to authenticated;
grant update on public.point_suggestions to authenticated;
grant select, insert, update, delete on public.collection_points, public.content_entries to authenticated;
grant select on public.app_admins to authenticated;
revoke all on public.survey_feedback from public, anon, authenticated;
grant insert on public.survey_feedback to anon, authenticated;
grant select on public.admin_feedback_summary to authenticated;

insert into public.collection_points
  (name, address, latitude, longitude, region, point_type, accepted_materials, hours, phone)
values
  ('EcoPoint Centro', 'Av. Getúlio Vargas, 1420 (Próximo à Prefeitura) - Centro', -12.2664, -38.9663, 'Centro', 'feira', array['Celulares / Tablets','Computadores / Notebooks','Cabos / Carregadores','Pilhas / Baterias'], 'Segunda a Sexta - 08:00 às 17:00', '(75) 3601-2301'),
  ('EcoPoint Kalilândia', 'Praça da Kalilândia, 48 - Kalilândia', -12.25, -38.95, 'Kalilândia', 'feira', array['Pilhas / Baterias','Celulares / Tablets','Monitores / TVs','Cabos / Carregadores'], 'Segunda a Sexta - 08:00 às 18:00', '(75) 3601-2302'),
  ('EcoPoint Avenida Nóide Cerqueira', 'Av. Nóide Cerqueira, km 3 - SIM', -12.275, -38.92, 'SIM', 'feira', array['Computadores / Notebooks','Impressoras / Scanners','Eletrodomésticos Pequenos'], 'Segunda a Sábado - 09:00 às 19:00', '(75) 3601-2303'),
  ('EcoPoint Cidade Nova', 'Av. Transnordestina, s/n (Próxima à UEFS) - Cidade Nova', -12.235, -38.955, 'Cidade Nova', 'feira', array['Computadores / Notebooks','Celulares / Tablets','Pilhas / Baterias','Monitores / TVs'], 'Segunda a Sexta - 07:30 às 17:30', '(75) 3601-2304'),
  ('EcoPoint Feira VII', 'Av. de Canal, 892 - Feira VII', -12.29, -38.97, 'Feira VII', 'feira', array['Pilhas / Baterias','Celulares / Tablets','Eletrodomésticos Pequenos','Cabos / Carregadores'], 'Segunda a Sexta - 08:00 às 17:00', '(75) 3601-2305'),
  ('EcoPoint Tomba', 'Tomba, Feira de Santana - BA', -12.285, -38.95, 'Tomba', 'feira', array['Computadores / Notebooks','Celulares / Tablets','Pilhas / Baterias'], 'Consulte o local antes de ir', '(75) 3601-2306')
on conflict (name, point_type) do nothing;

-- Create the admin account in Supabase Auth first, then run this bootstrap query:
-- insert into public.app_admins (user_id)
-- select id from auth.users where email = 'adm@uefs.ecomp.tfh'
-- on conflict (user_id) do nothing;
