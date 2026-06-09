# Dashboard OPS V2.51 — Complaints Date-Based Parser

Correction majeure:
- Le module Plaintes ne dépend plus du numéro de ligne CSV 3836.
- Il utilise maintenant la date réelle de départ de cette ligne: 2026-03-26.
- Cela évite les problèmes de décalage entre Excel et le CSV publié Google.
- Les plaintes sont ensuite filtrées par date réelle “Plaintes déposées le :”.
- Semaine OPS mardi → lundi.
- Après synchronisation, Restaurant et Type reviennent à Tous.

Validation attendue:
Semaine 2026-05-05 au 2026-05-11:
- Tous = 65 plaintes
- Beauport Nord = 8 plaintes
- Beauport = 3 plaintes
