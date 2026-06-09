# Rapport nettoyage V41

## Objectif

Nettoyer le code mort de `app.js` sans changer le visuel ni retirer de fonctionnalite visible.

## Code supprime ou desactive

- Ancien bloc plaintes historique principal: retire de `app.js`.
- Deuxieme bloc plaintes historique et correctifs successifs: retire de `app.js`.
- Anciens handlers calendrier/PDF et anciens gardes plaintes tardifs: retires de `app.js`.
- Anciens scripts plaintes `complaints-final*.js` et `complaints-fallback.json`: non inclus dans le ZIP Netlify V41.
- Les multiples demarrages internes de `app.js` passent maintenant par `onOpsReady`, avec un seul `DOMContentLoaded` central dans `app.js`.

## Moteurs conserves

- Plaintes CSV: `complaints-isolated-v31.js`.
- Calendrier/Import PDF: script isole `pc409-independent-calendar-v432` dans `index.html`.
- Restaurants: logique originale dans `app.js`.
- Messages: logique existante conservee.
- Audit/Rapports: logique existante conservee.

## Verifications effectuees

- `app.js`: syntaxe JavaScript OK.
- `complaints-isolated-v31.js`: syntaxe JavaScript OK.
- `tools/validate-v41.js`: syntaxe JavaScript OK.
- CSV live Google Sheets lu avec succes.
- Lignes CSV lues: 4563.
- Plaintes importees: 609.
- Plaintes corrigees: 609.
- Plaintes rejetees: 3954.
- Semaine test `2026-05-12 au 2026-05-18`: 43 plaintes importees.
- Restaurants semaine test: Alma 3, Beauport 4, Beauport Nord 5, Chicoutimi Nord 4, Chicoutimi Sud 5, Donnacona 2, Jonquiere 3, Levis 3, Roberval 3, Saint-Raymond 1, St-Augustin 1, St-Nicolas 9.
- Navigation: aucune page manquante detectee.
- Section Restaurant presente.
- Moteur Plaintes actif.
- Moteur Calendrier actif.
- Aucun ancien script `complaints-final*` charge par `index.html`.
- Aucun fallback `complaints-fallback` charge par le moteur actif.
- Import PDF calendrier: detection test promo + SMS OK.

## Reduction

- `app.js` V40: 527959 octets.
- `app.js` V41: 257360 octets.
- Reduction approximative: 270599 octets.
- ZIP Netlify V40: 716367 octets.
- ZIP Netlify V41: 662207 octets.

## Risques restants

- Le module Messages contient encore plusieurs generations historiques. Elles ont ete conservees parce que certaines initialisations touchent encore l'interface visible.
- Le module Audit/Rapports contient encore quelques fonctions historiques remplacees plus loin. Elles sont moins urgentes que les anciens moteurs Plaintes/Calendrier.
- Une prochaine passe peut isoler Messages et Audit en modules separes, mais ce serait une modification plus sensible.
