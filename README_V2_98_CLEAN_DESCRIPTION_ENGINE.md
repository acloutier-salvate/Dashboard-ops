# Dashboard OPS V2.98 — Clean Description Engine

Correction:
- Remplace le moteur des plaintes par un moteur CSV CLEAN plus stable.
- Lit explicitement la colonne Monday:
  "Description du problème (ENVOYÉ AU FRANCHISÉ) pour la centrale d'apls"
- Nettoie les descriptions:
  - enlève VIP-xxxxx //
  - garde le message du client
  - coupe avant Coordonnées / Informations de commande / Photo justificative
- Corrige dates, restaurants SAL, semaines mardi-lundi et détails.
