# Inventaire & Commande - Architecture modulaire V92

## Objectif

Transformer `inventory-command.js` en controleur principal plus leger sans changer le design, les tables Supabase ou le comportement utilisateur actuel.

## Fichiers crees

- `inventory-utils.js`
  - formats texte/nombres/dollars;
  - normalisation des emplacements;
  - parsing de nombres;
  - generation d'ID produit stable.
- `inventory-calculations.js`
  - valeur inventaire;
  - produits sous minimum;
  - filtre/recherche/tri produits;
  - KPI inventaire;
  - commande recommandee;
  - alertes simples.
- `inventory-orders.js`
  - creation d'un brouillon de commande;
  - items recommandes;
  - sauvegarde locale des commandes.
- `inventory-imports.js`
  - import CSV fournisseur;
  - import FoodCost XLSM/XLSX;
  - mapping produits/recettes/ingredients;
  - lecture Excel front-end.
- `inventory-supabase.js`
  - client Supabase inventaire;
  - lecture produit distante;
  - historique inventaire;
  - synchronisation produits;
  - sauvegarde comptages;
  - structure de sauvegarde commande Supabase.
- `inventory-render.js`
  - rendu KPI;
  - rendu filtres;
  - rendu cartes produits;
  - rendu historique;
  - rendu commande intelligente;
  - rendu alertes et imports.

## Fichier allege

- `inventory-command.js`
  - initialise le module;
  - coordonne l'etat;
  - branche les evenements;
  - appelle les sous-modules;
  - conserve `window.renderInventoryCommand` pour la navigation existante.

## Performance

- La liste produits garde un affichage progressif par lots de 180 produits.
- Les inputs produits utilisent une delegation d'evenements centralisee.
- Les sauvegardes locales pendant la saisie sont debouncees.
- Les KPI dynamiques utilisent `requestAnimationFrame`.
- Les cartes produits gardent `content-visibility:auto`.

## Donnees validees

- Produits: 524
- Produits uniques: 524
- Doublons detectes: 0
- Couts manquants: 0
- Recettes: 227
- Ingredients recettes: 1922

## Validation

- Syntaxe OK:
  - `inventory-utils.js`
  - `inventory-calculations.js`
  - `inventory-orders.js`
  - `inventory-imports.js`
  - `inventory-supabase.js`
  - `inventory-render.js`
  - `inventory-command.js`
  - `sw.js`
  - `app.js`
  - `complaints-isolated-v31.js`
  - `ops-auth.js`
  - `pwa.js`
- Import module controleur verifie avec environnement DOM minimal.
- Rendu HTML inventaire verifie par test local de module.
- Validateur global Dashboard OPS OK:
  - navigation complete;
  - moteur plaintes actif;
  - calendrier actif;
  - CSV plaintes live lu;
  - aucun ancien script plainte runtime.

## Risques restants

- La validation visuelle locale reste limitee parce que le navigateur integre refuse l'URL locale dans cette session.
- `app.js` reste volumineux et devra etre reduit par extraction progressive d'autres onglets.
- Les commandes Supabase sont structurees cote module, mais l'interface historique commandes detaillee reste une prochaine etape.

## Prochaine etape recommandee

Extraire ensuite un module `inventory-history.js` ou ajouter une vraie vue "Historique commandes" en reutilisant `inventory-orders.js` et `inventory-supabase.js`, sans toucher au rendu principal.
