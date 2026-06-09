# Dashboard OPS V5.5 - lecture ventes Restaurant

## Correction

Dans la fiche Restaurant, la lecture OPS utilise maintenant le champ existant
`growth` affiche par la carte `Augmentation ventes`.

- valeur positive: ajout dans `Ce qui va bien`;
- valeur negative: ajout dans `Intervention requise`;
- analyse OPS AI Restaurant: affiche l'indicateur d'augmentation des ventes;
- reponse conversationnelle ventes Restaurant: utilise le meme indicateur.

La comparaison historique `salesDelta` demeure disponible pour les analyses reseau.

## Protection

- aucun changement des liens CSV;
- aucun changement Supabase;
- aucun nouveau script SQL requis;
- aucun changement des calculs KPI existants;
- aucun changement inventaire, plaintes, calendrier ou rapports.

## Validation

- scenario `growth +6,2 %` avec comparaison historique negative:
  classe dans `Ce qui va bien`;
- scenario `growth -4,5 %` avec comparaison historique positive:
  classe dans `Intervention requise`;
- analyse reseau encore fonctionnelle;
- syntaxe JavaScript valide;
- validation CSV/plaintes/calendrier valide.
