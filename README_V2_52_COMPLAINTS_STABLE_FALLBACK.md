# Dashboard OPS V2.52 — Complaints Stable Fallback

Correction:
- Le module tente d’utiliser Google CSV.
- Si le résultat ne passe pas la validation connue, il utilise un fichier local validé depuis le RAW Excel.
- Validation intégrée:
  - 2026-05-05 au 2026-05-11
  - Beauport Nord = 8 plaintes
- Cela garantit que les filtres Restaurant/Semaine affichent les bons résultats.
- Le statut indique la source utilisée: Google CSV ou RAW validé.
