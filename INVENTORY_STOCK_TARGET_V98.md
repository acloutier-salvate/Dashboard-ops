# Dashboard OPS - Inventaire & Commande V98

## Ajout

- Ajout d'une logique simple `Stock minimum / Stock cible`.
- Réglages par restaurant :
  - `stock_minimum`
  - `stock_cible`
  - `produit_essentiel`
  - `produit_favori`
  - `frequence_commande`
  - `ordre_affichage_commande`
- Nouvelle vue `Configuration des stocks`.
- Nouvelle vue `Commande assistée`.
- Méthodes de commande :
  - ajouter produits sous minimum;
  - compléter jusqu'au stock cible;
  - reprendre dernière commande.

## Supabase

Nouveau script à exécuter :

`SUPABASE_STOCK_SETTINGS_V98.sql`

Il ajoute la table `product_stock_settings` avec RLS par restaurant.

## Calcul

Quantité recommandée :

`stock_cible - stock_actuel`

Si le résultat est négatif, le système affiche `0`.

## Validation

- Syntaxe JavaScript OK.
- Rendu `Configuration des stocks` OK.
- Rendu `Commande assistée` OK.
