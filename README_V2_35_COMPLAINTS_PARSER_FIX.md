# Dashboard OPS V2.35 — Complaints Parser Fix

Corrections:
- Parseur CSV robuste pour gérer les champs avec virgules, guillemets et retours de ligne.
- Correction des dates de plaintes.
- Correction des catégories de plaintes.
- Diminution des plaintes “Non catégorisé” dues aux colonnes décalées.
- Inférence automatique du type si la catégorie est vide:
  - Service
  - Produit
  - Item oublié
  - Propreté
- Colonne Name / Valeur $ lue comme montant en dollars.
