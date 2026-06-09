# Dashboard OPS V4.20 — Complaints Real CSV Fix

Correction:
- Désactive la validation cachée Beauport Nord = 8 qui pouvait forcer le fallback.
- Utilise le CSV live comme source principale.
- Fallback utilisé seulement si le CSV live retourne zéro ligne exploitable.
- Corrige le parsing des dates dd/mm/yyyy.
- Force les boutons sync plaintes vers le CSV live.
