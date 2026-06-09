# Dashboard OPS - Correctif V96

## Alignement barre gauche

- Ancienne décoration CSS `Admin Salvatoré / Administrateur` désactivée.
- Bloc compte/déconnexion verrouillé en grille propre.
- Courriel, badge `Super admin` et bouton `Déconnexion` alignés sans chevauchement.

## Supabase Inventaire

- Message de synchronisation raccourci et orienté vers le vrai correctif.
- Ajout du fichier `SUPABASE_INVENTORY_VISIBILITY_FIX_V96.sql`.
- Ce script crée/répare les tables Inventaire visibles par l'API Supabase :
  - `products`
  - `inventory_counts`
  - `purchase_orders`
  - `purchase_order_items`
- Le script ajoute aussi les policies RLS nécessaires et force :

```sql
notify pgrst, 'reload schema';
```

## Validation

- Syntaxe JavaScript OK.
- Validation globale Dashboard OPS OK.
