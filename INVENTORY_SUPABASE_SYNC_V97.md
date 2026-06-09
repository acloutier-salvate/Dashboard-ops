# Dashboard OPS - Correctif V97 Supabase Inventaire

## Problème corrigé

L'inventaire créait son propre client Supabase. Dans certains cas, la requête pouvait être traitée comme une requête API sans la même session que le login principal, ce qui pouvait faire apparaître `products` comme introuvable.

## Changements

- Le module Inventaire réutilise maintenant le client Supabase principal de l'authentification.
- Ajout du script `SUPABASE_INVENTORY_API_FIX_V97.sql`.
- Le script V97 :
  - crée/répare `products`, `inventory_counts`, `purchase_orders`, `purchase_order_items`;
  - ajoute les droits API nécessaires;
  - ajoute les policies RLS;
  - recharge le cache API Supabase.

## À faire

1. Publier le ZIP V97 sur Netlify.
2. Exécuter `SUPABASE_INVENTORY_API_FIX_V97.sql` une seule fois dans Supabase.
3. Recharger l'application.
4. Cliquer `Synchroniser Supabase`.

## Validation

- Syntaxe JavaScript OK.
- Validation globale Dashboard OPS OK.
