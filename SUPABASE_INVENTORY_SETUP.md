# Dashboard OPS — Inventaire & Commande

## À exécuter dans Supabase

Pré-requis : le fichier `SUPABASE_AUTH_SETUP.sql` doit déjà avoir été exécuté, parce que le module Inventaire réutilise les tables `restaurants`, `user_restaurants` et le rôle `super_admin`.

1. Ouvrir Supabase.
2. Aller dans SQL Editor.
3. Coller le contenu complet de `SUPABASE_INVENTORY_SETUP.sql`.
4. Exécuter.
5. Recharger l'application Dashboard OPS.

Si les tables existent déjà, utiliser plutôt `SUPABASE_INVENTORY_SETUP_SANS_DROP.sql`. Cette version ajoute les colonnes/policies manquantes sans effacer les données, incluant la policy de correction `inventory_counts_update_allowed_restaurant_v94` et le rechargement du cache API Supabase `notify pgrst, 'reload schema';`.

Si l'application affiche encore `Table products introuvable dans l'API`, exécuter `SUPABASE_INVENTORY_VISIBILITY_FIX_V96.sql`. Ce correctif ciblé recrée seulement les tables/policies Inventaire manquantes et force le rechargement du cache API, sans supprimer les données existantes.

À partir de V97, le correctif recommandé est `SUPABASE_INVENTORY_API_FIX_V97.sql`. Il répare aussi les droits API pour éviter que l'inventaire utilise une session Supabase anonyme au lieu de la session connectée.

Ce script ajoute les tables :

- `products`
- `inventory_counts`
- `purchase_orders`
- `purchase_order_items`
- `recipes`
- `recipe_ingredients`
- `inventory_import_logs`

## Sécurité RLS

Les produits et recettes sont lisibles par les utilisateurs connectés.

Les écritures globales produits/recettes sont réservées au `super_admin`.

Les prises d'inventaire et commandes sont limitées aux restaurants attribués à l'utilisateur via `user_restaurants`.

## Mise à jour des fichiers

Dans l'onglet `Inventaire`, utiliser la section `Importer / Mettre à jour`.

- Feuille fournisseur : importer le CSV fournisseur.
- FoodCost : importer le XLSM/XLSX FoodCost.

Le module déduplique les produits et conserve les stocks/minimums déjà inscrits localement.

## Notes Phase 1

Le module fonctionne localement même si Supabase Inventaire n'est pas encore créé.

Après création des tables, le bouton `Synchroniser Supabase` envoie les produits vers Supabase.

Si Supabase bloque la synchronisation, le module affiche maintenant la raison précise : mauvais projet Supabase, table manquante, cache API à rafraîchir, colonne manquante, session expirée, problème réseau ou policy RLS à corriger.

La prise d'inventaire reste manuelle et très simple :

- champ direct pour inscrire le stock exact;
- boutons `+` et `−` comme raccourcis;
- minimum configurable par produit;
- sauvegarde locale immédiate;
- sauvegarde Supabase disponible par restaurant.
