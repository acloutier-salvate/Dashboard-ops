# Dashboard OPS V5.13 - Centre de controle Admin unifie

## Objectif

Transformer l'onglet Admin en centre de controle reseau sans ajouter de nouveaux elements dans la barre laterale.

## Changements appliques

- Retrait du raccourci lateral separe `Utilisateurs`.
- Conservation d'un seul item lateral : `Admin`.
- Ajout d'une navigation interne dans Admin :
  - Utilisateurs
  - Permissions
  - Activite
- Creation d'un nouveau controleur isole : `admin-center-v513.js`.
- Ajout d'un tableau utilisateurs avec recherche, filtre par role, restaurants assignes, derniere connexion et statut.
- Ajout de modales pour modifier un utilisateur, changer son role, modifier ses restaurants, reinitialiser son mot de passe, desactiver/reactiver et supprimer de facon securisee.
- Ajout d'une matrice visuelle des permissions par role.
- Ajout d'une section d'affectation multiple des restaurants.
- Ajout d'un journal d'activite reseau avec filtres et recherche.
- Ajout d'un bloc haut de page avec les statistiques Admin reseau.
- Mise a jour du service worker pour forcer le nouveau cache V5.13.

## SQL ajoute

Fichier : `SUPABASE_ADMIN_CENTER_V513.sql`

Il ajoute :

- champs optionnels sur `profiles` : `full_name`, `status`, `last_login_at`;
- roles etendus : `super_admin`, `co`, `franchise`, `manager`, `user`;
- table `ops_activity_log`;
- politiques RLS pour le journal d'activite;
- politique d'insertion Admin pour les profils.

## Ce qui n'a pas ete modifie

- URL Supabase.
- Cle Supabase.
- Authentification existante.
- Tables existantes autres que les ajouts Admin V5.13.
- Imports CSV.
- Calculs KPI.
- Inventaire.
- Plaintes.
- Calendrier.
- Rapports.
- Dashboard.

## Validation effectuee

- Verification syntaxe : `admin-center-v513.js`, `ops-auth.js`, `app.js`, `sw.js`.
- Validation globale Dashboard OPS : OK.
- CSV plaintes live : 4827 lignes lues.
- Plaintes importees : 1403.
- Moteur plaintes actif : OK.
- Moteur calendrier actif : OK.
- Navigation : OK.
- Verification locale type Netlify : OK.
- Sidebar : un seul item Admin.
- Onglets internes Admin : Utilisateurs, Permissions, Activite.

## Note importante

Pour activer les nouveaux roles, le statut utilisateur et le journal d'activite complet, executer `SUPABASE_ADMIN_CENTER_V513.sql` dans le SQL Editor Supabase du meme projet.
