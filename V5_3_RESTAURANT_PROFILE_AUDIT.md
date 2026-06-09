# Dashboard OPS V5.3 - page Restaurant premium

## Portee

Cette livraison ajoute une couche visuelle isolee pour l'onglet Restaurant.
Les calculs KPI existants restent geres par `app.js` sans modification.
Les liens CSV, l'authentification, l'inventaire et les rapports ne sont pas modifies.

## Ajouts

- `restaurant-profile-v53.js`
  - lit les informations restaurant dans Supabase;
  - sauvegarde les modifications Franchisé, Gérant et Téléphone;
  - reutilise OPS AI et les KPI existants;
  - ajoute les sections Analyse OPS AI, Ce qui va bien, Intervention requise,
    Comparatif avec le reseau, Tendances operationnelles et Activite recente.
- `v5-3-restaurant.css`
  - styles limites a l'onglet Restaurant;
  - responsive mobile et desktop;
  - aucun debordement horizontal detecte.
- `SUPABASE_RESTAURANT_PROFILES_V109.sql`
  - cree `public.restaurant_profiles`;
  - ajoute les policies RLS pour les restaurants autorises;
  - initialise uniquement les profils absents avec les valeurs fournies;
  - conserve les profils deja modifies grace a `on conflict do nothing`.

## Regles d'affichage

- aucune photo restaurant;
- aucune date d'ouverture affichee dans l'interface;
- le champ Supabase `opening_date` demeure nullable pour une utilisation future;
- les informations restaurant proviennent uniquement de Supabase dans l'interface.

## Validation executee

- syntaxe JavaScript valide;
- rendu desktop verifie;
- rendu iPhone 390 x 844 verifie;
- formulaire de modification ouvert et sauvegarde validee;
- aucune erreur console dans les pages de validation;
- 41 ressources PWA verifiees, aucune manquante;
- CSV plaintes: 4 804 lignes lues, 1 380 importees, 3 424 rejetees;
- moteur plaintes actif;
- moteur calendrier actif;
- aucune page de navigation manquante;
- fichiers sensibles compares a V5.03: aucun changement.

## Installation

1. Executer une seule fois `SUPABASE_RESTAURANT_PROFILES_V109.sql` dans le SQL Editor
   du projet Supabase actuel.
2. Publier le ZIP Netlify.
3. Actualiser l'application. La nouvelle version du service worker supprimera les vieux caches.
