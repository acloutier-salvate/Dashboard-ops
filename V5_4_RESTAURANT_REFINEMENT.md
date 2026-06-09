# Dashboard OPS V5.4 - raffinement Restaurant

## Modification

- retrait du bouton `Poser une question` dans l'onglet Restaurant;
- conservation de l'analyse OPS AI automatique;
- ajout d'un statut discret `Lecture active`;
- raffinement des filtres, du bandeau restaurant, des cartes profil, des blocs
  d'analyse, des KPI, des comparatifs et des tendances;
- cache PWA actualise vers `v110-v5-3-restaurant-refinement`.

## Protection

- aucune modification Supabase;
- aucun nouveau script SQL requis;
- aucune modification des liens CSV;
- aucune modification des calculs KPI;
- aucune modification du moteur plaintes, calendrier, inventaire ou rapports.

## Validation

- syntaxe JavaScript valide;
- CSV plaintes: 4 804 lignes lues et 1 380 plaintes importees;
- moteurs plaintes et calendrier actifs;
- rendu desktop valide;
- rendu iPhone 390 x 844 valide;
- aucun debordement horizontal;
- aucun bouton `Poser une question` dans la page Restaurant;
- aucune erreur console pendant le test visuel.
