# V5.18 - Architecture IA abstraite

## Ce qui a été ajouté

- `src/config/aiConfig.js` centralise le fournisseur IA actif, les références OPS Salvatoré et le format d'analyse attendu.
- `src/services/aiProvider.js` devient l'unique point d'entrée frontend pour les fonctions IA.
- `netlify/functions/ai-provider.js` isole les appels fournisseur côté Netlify.
- `SUPABASE_AI_PROVIDER_USAGE_V518.sql` ajoute une journalisation IA neutre, prête pour OpenAI, Gemini, Claude ou un autre fournisseur.

## Fournisseur par défaut

OpenAI est le fournisseur par défaut via `OPENAI_API_KEY`.
La fonction Netlify utilise le SDK officiel `openai`, installé par `package.json` au build Netlify.

Variables Netlify recommandées :

- `OPENAI_API_KEY`
- `AI_PROVIDER=openai`
- `OPENAI_MODEL=gpt-4o-mini`

Variables optionnelles futures :

- `GEMINI_API_KEY`
- `CLAUDE_API_KEY`

## Fonctions standardisées

Tous les modules doivent passer par `window.OPS_AI_PROVIDER` :

- `analyzeRestaurant()`
- `generateOpsMessage()`
- `analyzeRequest()`
- `generateFoodOrderFromStock()`
- `generateFoodOrderFromHistory()`
- `generateFoodOrderHybrid()`
- `generateFranchiseeReport()`

## Sécurité

Le navigateur ne reçoit jamais la clé OpenAI/Gemini/Claude. Les appels passent par Netlify et valident la session Supabase avant analyse.

## Dossier OPS complet

OPS AI reçoit maintenant un contexte complet filtré par permissions :

- KPI réseau et restaurants autorisés
- restaurant et période sélectionnés
- CSI, plaintes, délai livraison, food cost et labor cost disponibles
- plaintes, top causes et derniers détails utiles
- derniers audits sauvegardés
- inventaire actif et historique local disponible
- 6 dernières commandes disponibles pour la commande intelligente
- événements calendrier visibles
- santé des sources CSV chargées

Le dossier est résumé avant envoi pour garder l'application rapide et éviter d'envoyer des milliers de lignes brutes à chaque question.
