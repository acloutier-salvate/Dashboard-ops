create table if not exists public.ops_calendar_events (
  id uuid primary key default gen_random_uuid(),
  event_key text unique not null,
  title text not null,
  category text not null default 'promo',
  start_date date not null,
  end_date date,
  description text,
  pdf_name text,
  restaurants text[] not null default '{}',
  event_data jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ops_calendar_events enable row level security;

drop policy if exists "calendar_events_select_authenticated" on public.ops_calendar_events;
create policy "calendar_events_select_authenticated"
on public.ops_calendar_events for select
to authenticated
using (active = true);

drop policy if exists "calendar_events_super_admin_insert" on public.ops_calendar_events;
create policy "calendar_events_super_admin_insert"
on public.ops_calendar_events for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists "calendar_events_super_admin_update" on public.ops_calendar_events;
create policy "calendar_events_super_admin_update"
on public.ops_calendar_events for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "calendar_events_super_admin_delete" on public.ops_calendar_events;
create policy "calendar_events_super_admin_delete"
on public.ops_calendar_events for delete
to authenticated
using (public.is_super_admin());

create index if not exists ops_calendar_events_start_date_idx
on public.ops_calendar_events (start_date);

create index if not exists ops_calendar_events_active_idx
on public.ops_calendar_events (active);

notify pgrst, 'reload schema';

select
  'calendar_events_v532_ok' as status,
  to_regclass('public.ops_calendar_events') as calendar_table;
