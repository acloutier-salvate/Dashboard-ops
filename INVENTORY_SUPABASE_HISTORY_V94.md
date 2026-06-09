# Dashboard OPS - Inventaire V94

## Corrections principales

- Le bouton `Synchroniser Supabase` ne retourne plus un message vague. Il vérifie la session, la configuration, les tables inventaire et les erreurs RLS, puis affiche la cause précise du blocage.
- L'historique des inventaires ouvre maintenant une vraie page `Historique des inventaires`.
- Le détail d'un inventaire ouvre une vraie page `Détail de l'inventaire`, avec correction des quantités, note, valeur recalculée, sauvegarde et duplication.
- Un bouton `Historique` est visible près du haut du module Inventaire, utile surtout sur iPhone.

## Supabase

- Ajout de la policy SQL `inventory_counts_update_allowed_restaurant_v94` dans les scripts Supabase pour permettre la correction des inventaires sauvegardés.
- Le fichier recommandé pour mettre à jour Supabase sans effacer les données est `SUPABASE_INVENTORY_SETUP_SANS_DROP.sql`.

## Validation

- Syntaxe JavaScript validée.
- Rendu des pages Historique et Détail testé.
- Validation globale Dashboard OPS exécutée avec succès.
