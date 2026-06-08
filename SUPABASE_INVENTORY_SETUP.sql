create extension if not exists pgcrypto;

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

create unique index if not exists products_supplier_code_name_idx
on public.products (
  lower(coalesce(supplier, '')),
  lower(coalesce(supplier_product_code, '')),
  lower(product_name)
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

create index if not exists purchase_order_items_order_idx
on public.purchase_order_items (purchase_order_id);

-- Future-ready FoodCost structure. The app can already import from the XLSM into the front-end;
-- these tables make recipe/POS/AI forecasting possible later without changing the core model.
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
  and (counted_by = auth.uid() or public.is_super_admin())
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
  and (created_by = auth.uid() or public.is_super_admin())
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
with check (imported_by = auth.uid() or public.is_super_admin());

notify pgrst, 'reload schema';
