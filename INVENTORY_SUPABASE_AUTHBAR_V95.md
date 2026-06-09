# Dashboard OPS - Correctif V95

## Corrigé

- Bloc compte/déconnexion ré-aligné dans la barre de gauche.
- Cache bust V95 pour `styles.css`, `ops-auth.js` et les modules Inventaire.
- Diagnostic `Synchroniser Supabase` plus précis :
  - affiche le projet Supabase testé;
  - distingue les tables Auth disponibles des tables Inventaire non exposées;
  - indique clairement quand exécuter `SUPABASE_INVENTORY_SETUP_SANS_DROP.sql`;
  - indique explicitement le rechargement du cache API `notify pgrst, 'reload schema';`.

## SQL

Les scripts Supabase Inventaire terminent maintenant avec :

```sql
notify pgrst, 'reload schema';
```

Cela force Supabase/PostgREST à revoir les nouvelles tables après création.

## Validation

- Syntaxe JavaScript OK.
- Rendu Historique/Détail inventaire OK.
- Validation globale Dashboard OPS OK.
