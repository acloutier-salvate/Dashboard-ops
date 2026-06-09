# Inventaire - Sauvegarde, remise a zero et correction V93

## Changements

- Apres une sauvegarde d'inventaire, une copie complete est conservee dans l'historique.
- Une fois la sauvegarde locale confirmee, la saisie active revient automatiquement a zero.
- L'inventaire sauvegarde n'est pas supprime et reste disponible dans l'historique.
- Le detail d'un inventaire sauvegarde affiche maintenant:
  - date;
  - valeur totale;
  - produits comptes;
  - note;
  - tous les produits sauvegardes;
  - quantites sauvegardees;
  - valeur par produit;
  - ecart minimum quand disponible.
- Les quantites d'un inventaire sauvegarde peuvent etre corrigees.
- Une note peut etre ajoutee a l'inventaire sauvegarde.
- Les corrections recalculent la valeur totale et le nombre de produits comptes.
- Les corrections sont sauvegardees localement et tentees dans Supabase quand les lignes Supabase existent.
- Ajout du bouton "Dupliquer cet inventaire" pour reprendre les quantites sauvegardees dans la saisie active sans modifier l'original.

## Comportement important

- Corriger un inventaire historique ne remplit pas la saisie active.
- La saisie active reste a zero apres sauvegarde.
- Seul le bouton "Dupliquer cet inventaire" remet volontairement les quantites historiques dans l'ecran actif.
- Les inventaires corriges localement sont prioritaires lors du rechargement pour ne pas perdre les corrections.

## Validation

- Syntaxe OK pour tous les modules inventaire.
- Rendu historique editeur confirme par test local de module.
- Snapshot test: 524 items sauvegardes, 2 produits comptes, valeur recalculee, bouton duplication present, ecart minimum present.
- Validateur global Dashboard OPS OK:
  - moteur plaintes actif;
  - calendrier actif;
  - navigation complete;
  - CSV plaintes live lu.
