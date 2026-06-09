# Dashboard OPS - Stabilisation architecture et performance V91

## Audit rapide

- `app.js` reste le plus gros fichier historique du projet. Il contient encore le socle de navigation et des modules anciens. Il n'a pas ete touche pour eviter une regression globale.
- `inventory-command.js` contenait inventaire, commande, imports, calculs et Supabase dans un seul fichier. C'etait la zone la plus utile a stabiliser maintenant.
- Les modules actifs principaux sont conserves: `executive-dashboard.js`, `complaints-isolated-v31.js`, `tools-hub.js`, `premium-reports.js`, `ops-auth.js`, `ops-intelligence.js`, `pwa.js`.
- Les donnees inventaire chargees depuis `inventory-data.json` contiennent 524 produits, 227 recettes et 1922 ingredients.

## Changements effectues

- Ajout de `inventory-utils.js` pour isoler les utilitaires et calculs purs:
  - normalisation texte;
  - formats nombres / dollars;
  - valeur inventaire;
  - ecart sous minimum;
  - cle produit anti-doublon;
  - parsing quantites/couts;
  - detection emplacement;
  - generation stable d'ID produit.
- `inventory-command.js` utilise maintenant ce module au lieu de garder ces fonctions directement dans le gros fichier.
- Les cartes produits utilisent maintenant une delegation d'evenements sur la liste au lieu d'ajouter plusieurs listeners sur chaque produit. C'est plus fluide avec 500+ produits.
- Les sauvegardes `localStorage` pendant la saisie sont debouncees pour eviter les micro-saccades desktop.
- Le resume KPI/commande est mis a jour via `requestAnimationFrame` pour regrouper les recalculs visuels.
- Le rendu de liste longue garde un affichage par lot de 180 produits avec bouton "Afficher jusqu'a..." pour conserver la fluidite tout en permettant d'acceder a la suite.
- CSS inventaire optimise:
  - `content-visibility:auto`;
  - containment layout/paint;
  - bouton "Actualiser" non compressible;
  - zone "Afficher plus" propre.
- Cache PWA mis a jour en V91 et ajout de `inventory-utils.js` dans le service worker.

## Donnees

- Produits: 524
- Doublons detectes par code/nom/fournisseur: 0
- Couts manquants: 0
- Couts negatifs: 0
- Recettes: 227
- Ingredients recettes: 1922

## Supabase

- La structure SQL disponible reste:
  - `SUPABASE_INVENTORY_SETUP_SANS_DROP.sql` pour une installation sans lignes destructives.
  - `SUPABASE_INVENTORY_SETUP_COPY_PASTE.sql` pour une version complete avec remplacement propre des policies.
- Les tables prevues couvrent produits, comptages inventaire, commandes, items de commande, recettes, ingredients et logs d'import.
- Les policies RLS restent basees sur `profiles`, `restaurants`, `user_restaurants` et `is_super_admin()`.

## Risques restants

- `app.js` reste volumineux. Le reduire davantage demande une extraction progressive par module historique, onglet par onglet.
- Les fonctions Supabase inventaire sont encore dans `inventory-command.js`. Prochaine passe recommandee: extraire `inventory-supabase.js`.
- Les imports XLSM sont encore dans `inventory-command.js`. Prochaine passe recommandee: extraire `inventory-recipes.js`.

## Validation

- Syntaxe verifiee pour `inventory-utils.js`.
- Syntaxe verifiee pour `inventory-command.js`.
- Syntaxe verifiee pour `sw.js`.
- Syntaxe verifiee pour `app.js`.
- Validation globale Dashboard OPS effectuee avec le validateur local.
- Le navigateur integre a refuse l'ouverture locale dans cette session (`ERR_BLOCKED_BY_CLIENT`), donc la validation visuelle locale n'a pas ete forcee.
