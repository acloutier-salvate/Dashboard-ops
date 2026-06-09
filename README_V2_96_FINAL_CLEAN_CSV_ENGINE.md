# Dashboard OPS V2.96 — Final Clean CSV Engine

Remplace complètement le moteur de plaintes par un moteur CLEAN CSV.

Corrections:
- Ne retombe plus sur l'ancien RAW validé si le CSV live contient des données.
- Parse les dates françaises DD/MM/YYYY correctement.
- Parse les dates Excel serial correctement.
- Corrige les dates futures inversées (ex: 11/05/2026 lu comme 2026-11-05).
- Mapping SAL-0129-LA POCATIÈRE (QC) -> La Pocatière.
- Filtre Dernière semaine avec plaintes basé sur les vraies semaines mardi-lundi.
- Détail de plainte propre.
