-- Dashboard OPS V5.18 - AI Provider usage log
-- Safe to run as a new SQL query. It does not delete existing data.

create table if not exists public.ops_ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  role text,
  restaurant_name text,
  analysis_type text,
  provider text not null default 'local',
  approx_tokens integer not null default 0,
  response_ms integer,
  allowed_restaurants_count integer,
  success boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_ai_quotas (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('user', 'restaurant', 'franchise')),
  scope_id text not null,
  monthly_token_limit integer,
  monthly_request_limit integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scope_type, scope_id)
);

alter table public.ops_ai_usage_log enable row level security;
alter table public.ops_ai_quotas enable row level security;

create or replace function public.ops_is_super_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'super_admin'
  );
$$;

drop policy if exists "ops_ai_usage_insert_self" on public.ops_ai_usage_log;
create policy "ops_ai_usage_insert_self"
on public.ops_ai_usage_log for insert
to authenticated
with check (user_id = auth.uid() or user_id is null);

drop policy if exists "ops_ai_usage_select_self_or_admin" on public.ops_ai_usage_log;
create policy "ops_ai_usage_select_self_or_admin"
on public.ops_ai_usage_log for select
to authenticated
using (user_id = auth.uid() or public.ops_is_super_admin());

drop policy if exists "ops_ai_quotas_select_admin" on public.ops_ai_quotas;
create policy "ops_ai_quotas_select_admin"
on public.ops_ai_quotas for select
to authenticated
using (public.ops_is_super_admin());

drop policy if exists "ops_ai_quotas_admin_write" on public.ops_ai_quotas;
create policy "ops_ai_quotas_admin_write"
on public.ops_ai_quotas for all
to authenticated
using (public.ops_is_super_admin())
with check (public.ops_is_super_admin());

create index if not exists ops_ai_usage_user_idx on public.ops_ai_usage_log (user_id);
create index if not exists ops_ai_usage_restaurant_idx on public.ops_ai_usage_log (restaurant_name);
create index if not exists ops_ai_usage_created_idx on public.ops_ai_usage_log (created_at desc);
create index if not exists ops_ai_usage_provider_idx on public.ops_ai_usage_log (provider);

notify pgrst, 'reload schema';

select
  'ops_ai_provider_usage_v518_ok' as status,
  to_regclass('public.ops_ai_usage_log') as usage_table,
  to_regclass('public.ops_ai_quotas') as quotas_table;
