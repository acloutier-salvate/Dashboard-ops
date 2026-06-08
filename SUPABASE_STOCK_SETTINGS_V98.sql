-- Dashboard OPS - Stock minimum / stock cible V98
-- À exécuter dans Supabase SQL Editor après la V97.
-- Ce script ne supprime aucune donnée.

create table if not exists public.product_stock_settings (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stock_minimum numeric not null default 0,
  stock_cible numeric not null default 0,
  produit_essentiel boolean not null default false,
  produit_favori boolean not null default false,
  frequence_commande text not null default 'hebdomadaire'
    check (frequence_commande in ('hebdomadaire','bihebdomadaire','occasionnel')),
  ordre_affichage_commande integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, product_id)
);

create index if not exists product_stock_settings_restaurant_order_idx
on public.product_stock_settings (restaurant_id, ordre_affichage_commande, product_id);

alter table public.product_stock_settings enable row level security;

grant select, insert, update, delete on public.product_stock_settings to authenticated;

drop policy if exists "product_stock_settings_select_allowed_v98" on public.product_stock_settings;
create policy "product_stock_settings_select_allowed_v98"
on public.product_stock_settings for select
to authenticated
using (public.can_access_restaurant(restaurant_id));

drop policy if exists "product_stock_settings_write_allowed_v98" on public.product_stock_settings;
create policy "product_stock_settings_write_allowed_v98"
on public.product_stock_settings for all
to authenticated
using (public.can_access_restaurant(restaurant_id))
with check (
  public.can_access_restaurant(restaurant_id)
  and (updated_by is null or updated_by = auth.uid() or public.is_super_admin())
);

select pg_notify('pgrst', 'reload schema');

select
  'stock_settings_v98_ok' as status,
  to_regclass('public.product_stock_settings') as product_stock_settings_table,
  has_table_privilege('authenticated', 'public.product_stock_settings', 'insert') as authenticated_can_insert_settings;
