# Dashboard OPS V2.86 — Live CSV Merge

Correction:
- Le logiciel garde le RAW validé comme base stable.
- Il relit ensuite le Google CSV live.
- Toute nouvelle plainte présente dans le CSV mais absente du RAW inclus est ajoutée automatiquement.
- Les doublons sont évités par ticket VIP.
- Ajout d’un statut visible si VIP-13052 est détectée.

But:
- Corriger le cas où la plainte VIP-13052 est dans le CSV live mais ne rentre pas dans le logiciel.
