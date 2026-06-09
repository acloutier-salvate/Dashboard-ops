# Dashboard OPS V2.50 — Complaints Final Logic

Correction finale du module Plaintes:
- Remplace la logique précédente par une logique unique finale.
- Restaurant = Tous affiche vraiment toutes les plaintes de la semaine.
- Beauport Nord est normalisé correctement.
- Les semaines sont générées à partir des vraies dates RAW.
- Les dates utilisent Plaintes déposées le.
- Force la synchro au chargement.
- Affiche un statut clair:
  - plaintes RAW chargées
  - plaintes affichées avec filtres

Validation attendue selon le RAW:
Semaine 2026-05-05 au 2026-05-11:
- Tous = 65 plaintes
- Beauport Nord = 8 plaintes
- Beauport = 3 plaintes
