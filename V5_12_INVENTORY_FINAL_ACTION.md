# Dashboard OPS V5.12 - Simplification Inventaire/Commande

## Objectif

Simplifier le module Inventaire & Commande sans changer les calculs, Supabase, l'historique ou les sections principales.

## Changements appliques

- Ajout d'un bouton principal unique : `Terminer l'inventaire et generer la commande`.
- Le bouton effectue la sauvegarde de l'inventaire, met a jour la commande, sauvegarde la commande et rafraichit l'historique.
- Confirmation affichee : `Inventaire termine. La commande a ete generee avec succes.`
- Le bouton de synchronisation reste separe et secondaire visuellement.
- Retrait des boutons visibles separes `Sauvegarder inventaire` et `Sauvegarder commande`.
- Simplification des textes visibles pour les gerants.
- Correction des cartes produits mobiles pour eviter les textes coupes ou superposes.
- Correction des blocs `Standing`, `A commander` et `Valeur` pour une lecture propre.

## Ce qui n'a pas ete modifie

- Connexions Supabase.
- Tables et requetes Supabase.
- Calculs inventaire et commande.
- Historique inventaire.
- Donnees existantes.
- Structure principale de la page.

## Validation effectuee

- Verification syntaxe : `inventory-render.js`, `inventory-command.js`, `sw.js`, `app.js`.
- Validation globale Dashboard OPS : OK.
- CSV plaintes live : 4827 lignes lues.
- Plaintes importees : 1403.
- Moteur plaintes actif : OK.
- Moteur calendrier actif : OK.
- Pages navigation : OK.
- Aucun ancien script plaintes detecte.

## Notes

Le module garde la logique actuelle, mais l'action finale est maintenant plus simple pour un gerant : compter le stock, verifier les besoins et terminer l'inventaire avec une commande generee.
