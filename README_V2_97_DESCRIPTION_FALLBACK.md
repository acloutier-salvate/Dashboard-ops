# Dashboard OPS V2.97 — Description Fallback Fix

Correction:
- Récupère la description même si Monday l’exporte sous une colonne différente.
- Recherche aussi dans le texte complet de la ligne si la colonne Description est vide.
- Priorise les champs:
  - Description du problème
  - Message du client
  - Raison de la non-conformité
  - Commentaire / note client
- Nettoie les métadonnées, liens, emails et coordonnées autour du message.
