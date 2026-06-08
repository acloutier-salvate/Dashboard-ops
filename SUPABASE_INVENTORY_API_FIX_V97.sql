-- Dashboard OPS - Réparation API Supabase Inventaire V97
-- À exécuter dans SQL Editor, dans le projet kbygjmcnntaoqmzfchta.
-- Ce script ne supprime aucune donnée.

create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key,
  category text,
  supplier text,
  supplier_product_code text,
  product_name text,
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

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  quantity_counted numeric not null default 0,
  counted_by uuid references auth.users(id) on delete set null,
  count_date timestamptz not null default now(),
  notes text
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  order_date timestamptz not null default now(),
  projected_sales numeric,
  target_foodcost numeric,
  projected_food_budget numeric,
  current_inventory_value numeric,
  recommended_order_value numeric,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references public.purchase_orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete restrict,
  recommended_quantity numeric not null default 0,
  adjusted_quantity numeric not null default 0,
  estimated_cost numeric not null default 0
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

create index if not exists products_lookup_idx on public.products (category, supplier, supplier_product_code, product_name);
create index if not exists inventory_counts_restaurant_date_idx on public.inventory_counts (restaurant_id, count_date desc);
create index if not exists purchase_orders_restaurant_date_idx on public.purchase_orders (restaurant_id, order_date desc);
create index if not exists purchase_order_items_order_idx on public.purchase_order_items (purchase_order_id);

alter table public.products enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.products to anon;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.inventory_counts to authenticated;
grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_order_items to authenticated;

drop policy if exists "products_select_anon_authenticated_v97" on public.products;
create policy "products_select_anon_authenticated_v97"
on public.products for select
to anon, authenticated
using (active_status = true or public.is_super_admin());

drop policy if exists "products_admin_write_v97" on public.products;
create policy "products_admin_write_v97"
on public.products for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "inventory_counts_select_allowed_restaurant_v97" on public.inventory_counts;
create policy "inventory_counts_select_allowed_restaurant_v97"
on public.inventory_counts for select
to authenticated
using (public.can_access_restaurant(restaurant_id));

drop policy if exists "inventory_counts_insert_allowed_restaurant_v97" on public.inventory_counts;
create policy "inventory_counts_insert_allowed_restaurant_v97"
on public.inventory_counts for insert
to authenticated
with check (
  public.can_access_restaurant(restaurant_id)
  and (counted_by is null or counted_by = auth.uid() or public.is_super_admin())
);

drop policy if exists "inventory_counts_update_allowed_restaurant_v97" on public.inventory_counts;
create policy "inventory_counts_update_allowed_restaurant_v97"
on public.inventory_counts for update
to authenticated
using (public.can_access_restaurant(restaurant_id))
with check (public.can_access_restaurant(restaurant_id));

drop policy if exists "purchase_orders_select_allowed_restaurant_v97" on public.purchase_orders;
create policy "purchase_orders_select_allowed_restaurant_v97"
on public.purchase_orders for select
to authenticated
using (public.can_access_restaurant(restaurant_id));

drop policy if exists "purchase_orders_insert_allowed_restaurant_v97" on public.purchase_orders;
create policy "purchase_orders_insert_allowed_restaurant_v97"
on public.purchase_orders for insert
to authenticated
with check (
  public.can_access_restaurant(restaurant_id)
  and (created_by is null or created_by = auth.uid() or public.is_super_admin())
);

drop policy if exists "purchase_orders_update_allowed_restaurant_v97" on public.purchase_orders;
create policy "purchase_orders_update_allowed_restaurant_v97"
on public.purchase_orders for update
to authenticated
using (public.can_access_restaurant(restaurant_id))
with check (public.can_access_restaurant(restaurant_id));

drop policy if exists "purchase_order_items_select_allowed_order_v97" on public.purchase_order_items;
create policy "purchase_order_items_select_allowed_order_v97"
on public.purchase_order_items for select
to authenticated
using (
  exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_id
      and public.can_access_restaurant(po.restaurant_id)
  )
);

drop policy if exists "purchase_order_items_write_allowed_order_v97" on public.purchase_order_items;
create policy "purchase_order_items_write_allowed_order_v97"
on public.purchase_order_items for all
to authenticated
using (
  exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_id
      and public.can_access_restaurant(po.restaurant_id)
  )
)
with check (
  exists (
    select 1 from public.purchase_orders po
    where po.id = purchase_order_id
      and public.can_access_restaurant(po.restaurant_id)
  )
);

select pg_notify('pgrst', 'reload schema');

select
  'api_fix_ok' as status,
  current_schema() as current_schema,
  to_regclass('public.products') as products_table,
  to_regclass('public.inventory_counts') as inventory_counts_table,
  to_regclass('public.purchase_orders') as purchase_orders_table,
  to_regclass('public.purchase_order_items') as purchase_order_items_table,
  has_table_privilege('anon', 'public.products', 'select') as anon_can_read_products,
  has_table_privilege('authenticated', 'public.products', 'insert') as authenticated_can_insert_products;
