# Dashboard OPS V5.10 - Lisibilite et superpositions

## Objectif

Verifier les contrastes texte/fond, les boutons visibles et les risques de superposition sur desktop et iPhone, avec une attention speciale a l'onglet Inventaire mobile.

## Corrections appliquees

- Ajout de `ops-readability-v510.css`.
- Ajout de `ops-readability-v510.js`.
- Mise a jour de `index.html` pour charger ces deux fichiers.
- Mise a jour du service worker : `v510-readability-overlap`.

## Inventaire mobile

Corrections ciblees :

- placeholders de recherche plus lisibles;
- textes secondaires Inventaire legerement renforces;
- controles Inventaire proteges contre les superpositions locales;
- onglet actif du menu mobile recentre automatiquement, afin que `Inventaire` ne reste pas coupe dans la barre horizontale.

Validation iPhone :

- Prise d'inventaire : aucun bouton cache, aucun champ sous une carte, aucun debordement horizontal.
- Configuration stocks : aucun bouton cache, aucun champ sous une carte, aucun debordement horizontal.
- Commande assistee : aucun bouton cache, aucun champ sous une carte, aucun debordement horizontal.
- Cibles tactiles visibles : aucune cible sous 36 px.

## Calendrier mobile

Correction appliquee :

- la grille mensuelle rentre maintenant dans la carte mobile;
- les 7 colonnes sont visibles sans couper la colonne de droite;
- les evenements sont abrégés dans les petites cases pour eviter les chevauchements.

Validation iPhone :

- carte calendrier : 345 px;
- grille calendrier : 343 px;
- aucun debordement horizontal;
- aucun bouton visible recouvert.

## Plaintes

Correction appliquee :

- bouton `Exporter rapport PDF` avec fond explicite et texte fonce, pour eviter tout risque de lecture blanc/blanc ou noir/noir.

## Modales / fermeture

Corrections appliquees :

- boutons de fermeture principaux positionnes au-dessus du contenu de leur modale;
- z-index local ajoute pour les boutons de fermeture calendrier, restaurant et OPS AI.

## Validation technique

- `sw.js`, `ops-readability-v510.js`, `app.js` et `inventory-command.js` : syntaxe valide.
- Service worker : 46 assets declares, 0 fichier manquant.
- Aucun changement aux connexions Supabase.
- Aucun changement aux liens CSV.
- Aucun changement aux calculs KPI.
