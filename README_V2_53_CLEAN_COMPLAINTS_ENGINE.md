# Dashboard OPS V2.53 — Clean Complaints Engine

Refonte propre du module Plaintes:
- Ignore les anciennes fonctions Plaintes.
- Un seul moteur de synchronisation.
- Un seul filtre Restaurant/Semaine/Type.
- Un seul calcul des semaines mardi-lundi.
- Un seul rendu du tableau et des KPI.
- Validation intégrée:
  - 2026-05-05 au 2026-05-11
  - Beauport Nord = 8 plaintes
- Si Google CSV ne passe pas la validation, fallback sur RAW validé inclus.

Attendu:
- Tous / Tous / 2026-05-05 au 2026-05-11 = 65 plaintes.
- Beauport Nord / Tous / 2026-05-05 au 2026-05-11 = 8 plaintes.
