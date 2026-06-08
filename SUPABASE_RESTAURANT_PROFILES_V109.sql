-- Dashboard OPS V109 - profils restaurants modifiables.
-- À exécuter une seule fois dans le SQL Editor Supabase du même projet.
-- Les valeurs ci-dessous servent uniquement à initialiser les profils absents.

create table if not exists public.restaurant_profiles (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  franchisee text,
  manager_name text,
  phone text,
  opening_date date,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create or replace function public.touch_restaurant_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists restaurant_profiles_touch_updated_at on public.restaurant_profiles;
create trigger restaurant_profiles_touch_updated_at
before insert or update on public.restaurant_profiles
for each row execute function public.touch_restaurant_profile();

alter table public.restaurant_profiles enable row level security;

grant select, insert, update on public.restaurant_profiles to authenticated;

drop policy if exists "restaurant_profiles_select_allowed" on public.restaurant_profiles;
create policy "restaurant_profiles_select_allowed"
on public.restaurant_profiles for select
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.user_restaurants ur
    where ur.user_id = auth.uid()
      and ur.restaurant_id = restaurant_profiles.restaurant_id
  )
);

drop policy if exists "restaurant_profiles_insert_allowed" on public.restaurant_profiles;
create policy "restaurant_profiles_insert_allowed"
on public.restaurant_profiles for insert
to authenticated
with check (
  public.is_super_admin()
  or exists (
    select 1
    from public.user_restaurants ur
    where ur.user_id = auth.uid()
      and ur.restaurant_id = restaurant_profiles.restaurant_id
  )
);

drop policy if exists "restaurant_profiles_update_allowed" on public.restaurant_profiles;
create policy "restaurant_profiles_update_allowed"
on public.restaurant_profiles for update
to authenticated
using (
  public.is_super_admin()
  or exists (
    select 1
    from public.user_restaurants ur
    where ur.user_id = auth.uid()
      and ur.restaurant_id = restaurant_profiles.restaurant_id
  )
)
with check (
  public.is_super_admin()
  or exists (
    select 1
    from public.user_restaurants ur
    where ur.user_id = auth.uid()
      and ur.restaurant_id = restaurant_profiles.restaurant_id
  )
);

with defaults(restaurant_name, franchisee, manager_name, phone) as (
  values
    ('Lévis', 'Nicolas David', 'Nicolas David', '418-931-0488'),
    ('Beauport', E'Raphaël Prévost\nMarc-Olivier Larouche\nWilliam Grange', null, '418-633-6197'),
    ('Jonquière', 'Louis Lebel', 'Gaston Boivin', '418-321-1828'),
    ('Chicoutimi Nord', 'Louis Lebel', 'Gaston Boivin', '418-321-1828'),
    ('Chicoutimi Sud', 'Louis Lebel', 'Gaston Boivin', '418-321-1828'),
    ('St-Nicolas', 'Eric Nitolo', 'Alexandre Guay', '418-473-2658'),
    ('Dolbeau', 'Viviane', 'Junior', '514-895-9599'),
    ('Alma', 'Louis Lebel', 'Julie Cauchon', '418-321-1828'),
    ('St-Augustin', E'Omar Vega\nConstanza Vega\nTommy Cloutier', 'Omar Vega', null),
    ('Montmagny', 'Eric Nitolo', null, '418-473-2658'),
    ('Donnacona', 'Francis Labonté', 'Francis Labonté', '418-803-7853'),
    ('Pont-Rouge', 'Francis Labonté', 'Francis Labonté', '418-803-7853'),
    ('Saint-Raymond', 'Francis Labonté', 'Francis Labonté', '418-803-7853'),
    ('Beauport Nord', 'Francis Labonté', 'Francis Labonté', '418-803-7853'),
    ('Roberval', 'Viviane', 'Julie', '514-895-9599'),
    ('La Pocatière', 'Maxime Bélanger', 'Maxime Bélanger', null),
    ('St-Lambert', 'Eric Nitolo', 'Mehdi', '418-473-2658')
)
insert into public.restaurant_profiles (restaurant_id, franchisee, manager_name, phone)
select r.id, d.franchisee, d.manager_name, d.phone
from defaults d
join public.restaurants r on lower(r.name) = lower(d.restaurant_name)
on conflict (restaurant_id) do nothing;

notify pgrst, 'reload schema';

