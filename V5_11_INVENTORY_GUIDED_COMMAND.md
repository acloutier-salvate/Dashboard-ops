# Dashboard OPS V5.11 - Inventaire guide + commande integree

## Objectif

Transformer l'onglet Inventaire en parcours guide, sans changer Supabase, les tables, l'historique, les produits, les permissions ni les calculs existants.

## Changements principaux

- Inventaire principal reorganise en checklist par categorie.
- Inventaire rapide par defaut avec produits prioritaires et bouton "Voir tous les produits".
- Barre de progression "Inventaire complete" basee sur les produits visibles.
- Panneau resume inventaire visible en haut sur mobile et a droite sur desktop.
- Statut couleur simple par produit selon le niveau vs standing: vert, jaune, rouge.
- Calcul direct "A commander = Standing - Stock actuel", minimum 0.
- Section "Commande automatique" integree sous la checklist.
- Ajustement manuel des quantites de commande sans changer de page.
- Autosave local des quantites d'inventaire et des ajustements de commande.
- Historique enrichi localement avec valeur commande, produits critiques et variation.
- Option "Essentiel" retiree de l'interface; "Favori" demeure visible et modifiable.

## Fichiers modifies

- `inventory-calculations.js`
- `inventory-render.js`
- `inventory-command.js`
- `inventory-orders.js`
- `styles.css`
- `index.html`
- `sw.js`

## Validation

- Syntaxe JS valide pour `inventory-calculations.js`, `inventory-render.js`, `inventory-command.js`, `inventory-orders.js`, `app.js`, `sw.js`, `ops-auth.js`, `complaints-isolated-v31.js`.
- Validation globale `tools/validate-v41.js` OK.
- CSV plaintes live lu: 4827 lignes.
- Plaintes importees: 1403.
- Plaintes corrigees: 1403.
- Plaintes rejetees visibles: 3424.
- Calendrier OPS intact.
- Navigation sans page manquante.
- QA mobile inventaire: progression presente, commande automatique presente, aucun overflow horizontal, aucun controle masque, aucune mention "Essentiel" visible.

## Notes

La logique Supabase et les structures existantes sont conservees. Les champs `produit_essentiel` restent compatibles en arriere-plan, mais ne sont plus exposes dans l'interface de configuration stock.
