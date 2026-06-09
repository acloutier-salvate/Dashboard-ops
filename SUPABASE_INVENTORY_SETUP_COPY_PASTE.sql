-- Dashboard OPS - Setup Supabase complet pour Auth + Inventaire
-- Version copier-coller: ne supprime aucune ligne.
-- Les lignes "drop policy if exists" et "drop trigger if exists" sont normales:
-- elles remplacent seulement les anciennes regles/triggers du meme nom. Elles ne suppriment pas tes donnees.

begin;

create extension if not exists pgcrypto;

-- =========================================================
-- 1) Base Auth Dashboard OPS
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null default 'user' check (role in ('super_admin', 'user')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text not null default 'user';
alter table public.profiles add column if not exists created_at timestamptz not null default now();

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.restaurants add column if not exists name text;
alter table public.restaurants add column if not exists active boolean not null default true;
alter table public.restaurants add column if not exists created_at timestamptz not null default now();

create index if not exists restaurants_name_lookup_idx
on public.restaurants (lower(name));

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

alter table public.user_sheet_sources add column if not exists kpi_csv_url text;
alter table public.user_sheet_sources add column if not exists complaints_csv_url text;
alter table public.user_sheet_sources add column if not exists created_at timestamptz not null default now();
alter table public.user_sheet_sources add column if not exists updated_at timestamptz not null default now();

create table if not exists public.user_restaurant_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurant_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, restaurant_name)
);

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

do $$
declare
  restaurant_name text;
  restaurant_names text[] := array[
    'Lévis',
    'Beauport',
    'Jonquière',
    'Chicoutimi Nord',
    'St-Nicolas',
    'Dolbeau',
    'Alma',
    'St-Augustin',
    'Montmagny',
    'Donnacona',
    'Pont-Rouge',
    'Chicoutimi Sud',
    'Saint-Raymond',
    'Beauport Nord',
    'La Pocatière',
    'Roberval',
    'St-Lambert'
  ];
begin
  foreach restaurant_name in array restaurant_names loop
    if not exists (
      select 1
      from public.restaurants r
      where lower(r.name) = lower(restaurant_name)
    ) then
      insert into public.restaurants (name, active)
      values (restaurant_name, true);
    else
      update public.restaurants
      set active = true
      where lower(name) = lower(restaurant_name);
    end if;
  end loop;
end $$;

insert into public.profiles (id, email, role)
select id, email, 'super_admin'
from auth.users
where lower(email) = lower('a.cloutier@salvatore.com')
on conflict (id) do update
set role = 'super_admin',
    email = excluded.email;

insert into public.user_restaurants (user_id, restaurant_id)
select p.id, r.id
from public.profiles p
cross join public.restaurants r
where lower(p.email) = lower('a.cloutier@salvatore.com')
  and r.active = true
on conflict do nothing;

insert into public.user_sheet_sources (user_id, kpi_csv_url, complaints_csv_url)
select
  p.id,
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQVnbsslU6yfX4CNcXAH1cw4-7DFrZyMLt6NJmymwITALwvloEfZ9u0hhg_gNUNE8XmvgAZNO-LUG5z/pub?output=csv',
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8iD3fLPtv8V5z7ztEMqdJnCOhD32pRQsevAwXIexl6iwktRt_-eJQ1CgbXFiWSRgQQRi8ma9lvLv2/pub?gid=1258876961&single=true&output=csv'
from public.profiles p
where lower(p.email) = lower('a.cloutier@salvatore.com')
on conflict (user_id) do update
set kpi_csv_url = excluded.kpi_csv_url,
    complaints_csv_url = excluded.complaints_csv_url,
    updated_at = now();

alter table public.profiles enable row level security;
alter table public.restaurants enable row level security;
alter table public.user_restaurants enable row level security;
alter table public.user_sheet_sources enable row level security;
alter table public.user_restaurant_requests enable row level security;

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

-- =========================================================
-- 2) Inventaire & Commande
-- =========================================================

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category text,
  supplier text,
  supplier_product_code text,
  product_name text not null,
  format text,
  unit_type text,
  unit_size numeric,
  case_cost numeric,
  unit_cost numeric,
  storage_location text,
  minimum_stock numeric not null default 0,
  current_stock numeric not null default 0,
  inventory_value numeric not null default 0,
  active_status boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists category text;
alter table public.products add column if not exists supplier text;
alter table public.products add column if not exists supplier_product_code text;
alter table public.products add column if not exists product_name text;
alter table public.products add column if not exists format text;
alter table public.products add column if not exists unit_type text;
alter table public.products add column if not exists unit_size numeric;
alter table public.products add column if not exists case_cost numeric;
alter table public.products add column if not exists unit_cost numeric;
alter table public.products add column if not exists storage_location text;
alter table public.products add column if not exists minimum_stock numeric not null default 0;
alter table public.products add column if not exists current_stock numeric not null default 0;
alter table public.products add column if not exists inventory_value numeric not null default 0;
alter table public.products add column if not exists active_status boolean not null default true;
alter table public.products add column if not exists created_at timestamptz not null default now();
alter table public.products add column if not exists updated_at timestamptz not null default now();

create index if not exists products_lookup_idx
on public.products (
  lower(coalesce(supplier, '')),
  lower(coalesce(supplier_product_code, '')),
  lower(coalesce(product_name, ''))
);

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity_counted numeric not null default 0,
  counted_by uuid references auth.users(id) on delete set null,
  count_date timestamptz not null default now(),
  notes text
);

alter table public.inventory_counts add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;
alter table public.inventory_counts add column if not exists product_id uuid references public.products(id) on delete cascade;
alter table public.inventory_counts add column if not exists quantity_counted numeric not null default 0;
alter table public.inventory_counts add column if not exists counted_by uuid references auth.users(id) on delete set null;
alter table public.inventory_counts add column if not exists count_date timestamptz not null default now();
alter table public.inventory_counts add column if not exists notes text;

create index if not exists inventory_counts_restaurant_date_idx
on public.inventory_counts (restaurant_id, count_date desc);

create index if not exists inventory_counts_product_idx
on public.inventory_counts (product_id);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_date timestamptz not null default now(),
  projected_sales numeric,
  target_foodcost numeric,
  projected_food_budget numeric,
  current_inventory_value numeric,
  recommended_order_value numeric,
  status text not null default 'draft' check (status in ('draft','submitted','received','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.purchase_orders add column if not exists restaurant_id uuid references public.restaurants(id) on delete cascade;
alter table public.purchase_orders add column if not exists order_date timestamptz not null default now();
alter table public.purchase_orders add column if not exists projected_sales numeric;
alter table public.purchase_orders add column if not exists target_foodcost numeric;
alter table public.purchase_orders add column if not exists projected_food_budget numeric;
alter table public.purchase_orders add column if not exists current_inventory_value numeric;
alter table public.purchase_orders add column if not exists recommended_order_value numeric;
alter table public.purchase_orders add column if not exists status text not null default 'draft';
alter table public.purchase_orders add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.purchase_orders add column if not exists created_at timestamptz not null default now();
alter table public.purchase_orders add column if not exists updated_at timestamptz not null default now();

create index if not exists purchase_orders_restaurant_date_idx
on public.purchase_orders (restaurant_id, order_date desc);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  recommended_quantity numeric not null default 0,
  adjusted_quantity numeric not null default 0,
  estimated_cost numeric not null default 0
);

alter table public.purchase_order_items add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete cascade;
alter table public.purchase_order_items add column if not exists product_id uuid references public.products(id) on delete restrict;
alter table public.purchase_order_items add column if not exists recommended_quantity numeric not null default 0;
alter table public.purchase_order_items add column if not exists adjusted_quantity numeric not null default 0;
alter table public.purchase_order_items add column if not exists estimated_cost numeric not null default 0;

create index if not exists purchase_order_items_order_idx
on public.purchase_order_items (purchase_order_id);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  recipe_name text not null,
  category text,
  format text,
  ingredient_count integer not null default 0,
  total_cost numeric,
  source_sheet text,
  active_status boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipes add column if not exists recipe_name text;
alter table public.recipes add column if not exists category text;
alter table public.recipes add column if not exists format text;
alter table public.recipes add column if not exists ingredient_count integer not null default 0;
alter table public.recipes add column if not exists total_cost numeric;
alter table public.recipes add column if not exists source_sheet text;
alter table public.recipes add column if not exists active_status boolean not null default true;
alter table public.recipes add column if not exists created_at timestamptz not null default now();
alter table public.recipes add column if not exists updated_at timestamptz not null default now();

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  ingredient_code text,
  ingredient_name text not null,
  brand text,
  quantity numeric,
  unit_type text,
  unit_cost numeric,
  rau_cost numeric,
  preparation text
);

alter table public.recipe_ingredients add column if not exists recipe_id uuid references public.recipes(id) on delete cascade;
alter table public.recipe_ingredients add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.recipe_ingredients add column if not exists ingredient_code text;
alter table public.recipe_ingredients add column if not exists ingredient_name text;
alter table public.recipe_ingredients add column if not exists brand text;
alter table public.recipe_ingredients add column if not exists quantity numeric;
alter table public.recipe_ingredients add column if not exists unit_type text;
alter table public.recipe_ingredients add column if not exists unit_cost numeric;
alter table public.recipe_ingredients add column if not exists rau_cost numeric;
alter table public.recipe_ingredients add column if not exists preparation text;

create table if not exists public.inventory_import_logs (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid references auth.users(id) on delete set null,
  import_type text not null check (import_type in ('supplier_csv','foodcost_xlsm','manual')),
  source_name text,
  products_imported integer not null default 0,
  products_updated integer not null default 0,
  rejected_rows integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.inventory_import_logs add column if not exists imported_by uuid references auth.users(id) on delete set null;
alter table public.inventory_import_logs add column if not exists import_type text;
alter table public.inventory_import_logs add column if not exists source_name text;
alter table public.inventory_import_logs add column if not exists products_imported integer not null default 0;
alter table public.inventory_import_logs add column if not exists products_updated integer not null default 0;
alter table public.inventory_import_logs add column if not exists rejected_rows integer not null default 0;
alter table public.inventory_import_logs add column if not exists notes text;
alter table public.inventory_import_logs add column if not exists created_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.products_set_inventory_value()
returns trigger
language plpgsql
as $$
begin
  new.inventory_value = coalesce(new.current_stock, 0) * coalesce(new.case_cost, new.unit_cost, 0);
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_inventory_value_trigger on public.products;
create trigger products_inventory_value_trigger
before insert or update on public.products
for each row execute function public.products_set_inventory_value();

drop trigger if exists purchase_orders_touch_updated_at on public.purchase_orders;
create trigger purchase_orders_touch_updated_at
before update on public.purchase_orders
for each row execute function public.touch_updated_at();

drop trigger if exists recipes_touch_updated_at on public.recipes;
create trigger recipes_touch_updated_at
before update on public.recipes
for each row execute function public.touch_updated_at();

create or replace function public.can_access_restaurant(rest_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin()
    or exists (
      select 1
      from public.user_restaurants ur
      where ur.user_id = auth.uid()
        and ur.restaurant_id = rest_id
    );
$$;

alter table public.products enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.inventory_import_logs enable row level security;

drop policy if exists "products_select_authenticated" on public.products;
create policy "products_select_authenticated"
on public.products for select
to authenticated
using (active_status = true or public.is_super_admin());

drop policy if exists "products_admin_write" on public.products;
create policy "products_admin_write"
on public.products for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "inventory_counts_select_allowed_restaurant" on public.inventory_counts;
create policy "inventory_counts_select_allowed_restaurant"
on public.inventory_counts for select
to authenticated
using (public.can_access_restaurant(restaurant_id));

drop policy if exists "inventory_counts_insert_allowed_restaurant" on public.inventory_counts;
create policy "inventory_counts_insert_allowed_restaurant"
on public.inventory_counts for insert
to authenticated
with check (
  public.can_access_restaurant(restaurant_id)
  and (counted_by is null or counted_by = auth.uid() or public.is_super_admin())
);

drop policy if exists "inventory_counts_update_allowed_restaurant" on public.inventory_counts;
create policy "inventory_counts_update_allowed_restaurant"
on public.inventory_counts for update
to authenticated
using (public.can_access_restaurant(restaurant_id))
with check (public.can_access_restaurant(restaurant_id));

drop policy if exists "purchase_orders_select_allowed_restaurant" on public.purchase_orders;
create policy "purchase_orders_select_allowed_restaurant"
on public.purchase_orders for select
to authenticated
using (public.can_access_restaurant(restaurant_id));

drop policy if exists "purchase_orders_insert_allowed_restaurant" on public.purchase_orders;
create policy "purchase_orders_insert_allowed_restaurant"
on public.purchase_orders for insert
to authenticated
with check (
  public.can_access_restaurant(restaurant_id)
  and (created_by is null or created_by = auth.uid() or public.is_super_admin())
);

drop policy if exists "purchase_orders_update_allowed_restaurant" on public.purchase_orders;
create policy "purchase_orders_update_allowed_restaurant"
on public.purchase_orders for update
to authenticated
using (public.can_access_restaurant(restaurant_id))
with check (public.can_access_restaurant(restaurant_id));

drop policy if exists "purchase_order_items_select_allowed_order" on public.purchase_order_items;
create policy "purchase_order_items_select_allowed_order"
on public.purchase_order_items for select
to authenticated
using (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_id
      and public.can_access_restaurant(po.restaurant_id)
  )
);

drop policy if exists "purchase_order_items_write_allowed_order" on public.purchase_order_items;
create policy "purchase_order_items_write_allowed_order"
on public.purchase_order_items for all
to authenticated
using (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_id
      and public.can_access_restaurant(po.restaurant_id)
  )
)
with check (
  exists (
    select 1
    from public.purchase_orders po
    where po.id = purchase_order_id
      and public.can_access_restaurant(po.restaurant_id)
  )
);

drop policy if exists "recipes_select_authenticated" on public.recipes;
create policy "recipes_select_authenticated"
on public.recipes for select
to authenticated
using (active_status = true or public.is_super_admin());

drop policy if exists "recipes_admin_write" on public.recipes;
create policy "recipes_admin_write"
on public.recipes for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "recipe_ingredients_select_authenticated" on public.recipe_ingredients;
create policy "recipe_ingredients_select_authenticated"
on public.recipe_ingredients for select
to authenticated
using (true);

drop policy if exists "recipe_ingredients_admin_write" on public.recipe_ingredients;
create policy "recipe_ingredients_admin_write"
on public.recipe_ingredients for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "inventory_import_logs_select_admin" on public.inventory_import_logs;
create policy "inventory_import_logs_select_admin"
on public.inventory_import_logs for select
to authenticated
using (public.is_super_admin() or imported_by = auth.uid());

drop policy if exists "inventory_import_logs_insert_self" on public.inventory_import_logs;
create policy "inventory_import_logs_insert_self"
on public.inventory_import_logs for insert
to authenticated
with check (imported_by is null or imported_by = auth.uid() or public.is_super_admin());

commit;

notify pgrst, 'reload schema';
