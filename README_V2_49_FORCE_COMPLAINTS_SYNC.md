# Dashboard OPS V2.49 — Force Complaints Sync

Correction:
- Réinitialise l’ancien cache plaintes automatiquement.
- Force la resynchronisation avec le CSV RAW au chargement.
- Utilise le lien CSV plaintes directement dans le code.
- Recalcule les semaines à partir du RAW Plaintes.
- Recalcule les restaurants normalisés.
- Affiche un statut clair:
  - Plaintes chargées RAW
  - Plaintes affichées avec les filtres

À vérifier:
Pour la semaine 2026-05-05 au 2026-05-11, Restaurant = Tous, Type = Tous,
le logiciel doit afficher 65 plaintes selon le fichier RAW validé.
