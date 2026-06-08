-- Dashboard OPS V5.13 - Admin unified control center
-- A executer dans le SQL Editor Supabase du meme projet.
-- Ce script ajoute les roles et le journal d'activite sans supprimer de donnees.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles add column if not exists last_login_at timestamptz;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_v513_check
  check (role in ('super_admin', 'co', 'franchise', 'manager', 'user'));

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'status'
  ) then
    update public.profiles
    set status = 'active'
    where status is null or status = '';
  end if;
end $$;

create table if not exists public.ops_activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  action text not null,
  module text,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  restaurant_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ops_activity_log enable row level security;

drop policy if exists "ops_activity_select_admin" on public.ops_activity_log;
create policy "ops_activity_select_admin"
on public.ops_activity_log for select
to authenticated
using (public.is_super_admin());

drop policy if exists "ops_activity_insert_authenticated" on public.ops_activity_log;
create policy "ops_activity_insert_authenticated"
on public.ops_activity_log for insert
to authenticated
with check (auth.uid() = user_id or public.is_super_admin());

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert"
on public.profiles for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete"
on public.profiles for delete
to authenticated
using (public.is_super_admin() and id <> auth.uid());

create index if not exists ops_activity_log_created_at_idx
  on public.ops_activity_log (created_at desc);

create index if not exists ops_activity_log_user_id_idx
  on public.ops_activity_log (user_id);

create index if not exists ops_activity_log_restaurant_id_idx
  on public.ops_activity_log (restaurant_id);

notify pgrst, 'reload schema';

select
  'admin_center_v513_ok' as status,
  to_regclass('public.profiles') as profiles_table,
  to_regclass('public.ops_activity_log') as activity_table;
