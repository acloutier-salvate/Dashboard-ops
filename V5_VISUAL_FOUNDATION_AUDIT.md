# Dashboard OPS V5 - Audit de protection

## Perimetre de la premiere passe

Cette livraison ajoute uniquement une fondation visuelle isolee dans `v5-ui.css`.
Les moteurs de donnees, les calculs et les integrations restent inchanges.

## Integrations protegees

- Authentification et roles: `ops-auth.js`
- Client et synchronisation Inventaire Supabase: `inventory-supabase.js`
- Calculs inventaire et commandes: `inventory-calculations.js`, `inventory-orders.js`
- Import inventaire: `inventory-imports.js`
- Moteur CSV plaintes: `complaints-isolated-v31.js`
- Source KPI CSV: conservee dans `app.js` et `ops-auth.js`
- Sources plaintes CSV: conservees dans `complaints-isolated-v31.js` et `ops-auth.js`
- PDF et rapports: `premium-reports.js`
- Calendrier et import PDF: moteur existant conserve dans `index.html`
- PWA: cache mis a jour uniquement pour charger la nouvelle feuille visuelle

## Modules actifs confirmes

- Dashboard: `executive-dashboard.js`
- Outils: `tools-hub.js`
- Inventaire: modules `inventory-*.js`
- Restaurant, Audit, Rapports et Messages: `app.js`
- Plaintes: `complaints-isolated-v31.js`
- Intelligence OPS existante: `ops-intelligence.js`
- Auth et Admin: `ops-auth.js`
- PWA: `pwa.js`, `sw.js`, `manifest.json`

## Choix de stabilite

Les nouvelles fonctions demandees qui exigent des donnees absentes ou un service
dedie ne sont pas simulees dans cette passe: IA conversationnelle, previsions,
journal d'activite complet, sessions actives et nouvelles statistiques metier.
Elles doivent etre ajoutees par petites phases avec un contrat de donnees explicite.
