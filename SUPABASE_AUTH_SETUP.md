# Dashboard OPS - Supabase Auth Setup

Ce fichier documente les tables et politiques RLS nécessaires au login Dashboard OPS.

## 1. Tables

Exécuter dans le SQL Editor Supabase.

```sql
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null default 'user' check (role in ('super_admin', 'user')),
  created_at timestamptz not null default now()
);

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_restaurants (
  user_id uuid not null references public.profiles(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  primary key (user_id, restaurant_id)
);

create table if not exists public.user_sheet_sources (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  kpi_csv_url text,
  complaints_csv_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_restaurant_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, restaurant_name)
);
```

## 2. Fonction helper super admin

```sql
create or replace function public.is_super_admin(uid uuid default auth.uid())
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
```

## 3. Seed restaurants

```sql
insert into public.restaurants (name, active) values
('Lévis', true),
('Beauport', true),
('Jonquière', true),
('Chicoutimi Nord', true),
('St-Nicolas', true),
('Dolbeau', true),
('Alma', true),
('St-Augustin', true),
('Montmagny', true),
('Donnacona', true),
('Pont-Rouge', true),
('Chicoutimi Sud', true),
('Saint-Raymond', true),
('Beauport Nord', true),
('La Pocatière', true),
('Roberval', true),
('St-Lambert', true)
on conflict (name) do update set active = excluded.active;
```

## 4. Créer le profil super admin

Créer d'abord le compte dans Supabase Auth avec l'email `a.cloutier@salvatore.com`.

Ensuite:

```sql
insert into public.profiles (id, email, role)
select id, email, 'super_admin'
from auth.users
where lower(email) = lower('a.cloutier@salvatore.com')
on conflict (id) do update set role = 'super_admin', email = excluded.email;

insert into public.user_restaurants (user_id, restaurant_id)
select p.id, r.id
from public.profiles p
cross join public.restaurants r
where lower(p.email) = lower('a.cloutier@salvatore.com')
on conflict do nothing;

insert into public.user_sheet_sources (user_id, kpi_csv_url, complaints_csv_url)
select
  p.id,
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQVnbsslU6yfX4CNcXAH1cw4-7DFrZyMLt6NJmymwITALwvloEfZ9u0hhg_gNUNE8XmvgAZNO-LUG5z/pub?output=csv',
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8iD3fLPtv8V5z7ztEMqdJnCOhD32pRQsevAwXIexl6iwktRt_-eJQ1CgbXFiWSRgQQRi8ma9lvLv2/pub?gid=1258876961&single=true&output=csv'
from public.profiles p
where lower(p.email) = lower('a.cloutier@salvatore.com')
on conflict (user_id) do update set
  kpi_csv_url = excluded.kpi_csv_url,
  complaints_csv_url = excluded.complaints_csv_url,
  updated_at = now();
```

## 5. Activer RLS

```sql
alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.user_restaurants enable row level security;
alter table public.user_sheet_sources enable row level security;
alter table public.user_restaurant_requests enable row level security;
```

## 6. Policies

```sql
drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_super_admin());

drop policy if exists "profiles_insert_self_user" on public.profiles;
create policy "profiles_insert_self_user"
on public.profiles for insert
to authenticated
with check (id = auth.uid() and role = 'user');

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
on public.profiles for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "restaurants_select_authenticated" on public.restaurants;
create policy "restaurants_select_authenticated"
on public.restaurants for select
to authenticated
using (active = true or public.is_super_admin());

drop policy if exists "restaurants_admin_write" on public.restaurants;
create policy "restaurants_admin_write"
on public.restaurants for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "user_restaurants_select_self_or_admin" on public.user_restaurants;
create policy "user_restaurants_select_self_or_admin"
on public.user_restaurants for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "user_restaurants_admin_write" on public.user_restaurants;
create policy "user_restaurants_admin_write"
on public.user_restaurants for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "sheet_sources_select_self_or_admin" on public.user_sheet_sources;
create policy "sheet_sources_select_self_or_admin"
on public.user_sheet_sources for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "sheet_sources_admin_write" on public.user_sheet_sources;
create policy "sheet_sources_admin_write"
on public.user_sheet_sources for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "restaurant_requests_insert_self" on public.user_restaurant_requests;
create policy "restaurant_requests_insert_self"
on public.user_restaurant_requests for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "restaurant_requests_select_self_or_admin" on public.user_restaurant_requests;
create policy "restaurant_requests_select_self_or_admin"
on public.user_restaurant_requests for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

drop policy if exists "restaurant_requests_delete_self_or_admin" on public.user_restaurant_requests;
create policy "restaurant_requests_delete_self_or_admin"
on public.user_restaurant_requests for delete
to authenticated
using (user_id = auth.uid() or public.is_super_admin());
```

## Notes importantes

- Le mot de passe du super admin ne doit pas être dans le frontend.
- Le frontend affiche/masque les outils admin pour l'expérience utilisateur, mais la vraie sécurité doit venir des policies RLS.
- Les liens CSV historiques sont attribués uniquement à `a.cloutier@salvatore.com` via `user_sheet_sources`.
- Les autres utilisateurs ne reçoivent aucun lien CSV par défaut.
