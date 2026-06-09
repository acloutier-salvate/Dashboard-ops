# Dashboard OPS - Professional Cleanup & Performance Pass V74

Date: 2026-05-25

## Audit rapide

Fichiers runtime réellement chargés:
- `index.html`
- `styles.css`
- `app.js`
- `executive-dashboard.js`
- `complaints-isolated-v31.js`
- `premium-reports.js`
- `ops-intelligence.js`
- `tools-hub.js`
- `tools-config.json`
- `pwa.js`
- `sw.js`
- `manifest.json`
- assets PWA/logo/vendor PDF

## Retiré sécuritairement

- Anciens moteurs plaintes non chargés:
  - `complaints-final.js`
  - `complaints-final-v28.js`
  - `complaints-final-v29.js`
  - `complaints-final-v30.js`
- Ancien fallback lourd non utilisé:
  - `complaints-fallback.json`
- Anciennes icônes PWA dans `icons/` qui pouvaient créer de la confusion avec iOS:
  - `icons/apple-touch-icon.png`
  - `icons/icon-192.png`
  - `icons/icon-512.png`
  - `icons/icon-maskable-512.png`
- CSS mort de l'ancienne version "cartes Intelligence OPS":
  - styles `.opsIntelPanel`
  - styles `.opsIntelMetricGrid`
  - styles `.opsIntelMetric`
  - styles `.opsIntelHead`
  - animation `opsIntelIn`

## Conservé intact

- Moteur plaintes actif: `complaints-isolated-v31.js`
- Dashboard exécutif: `executive-dashboard.js`
- Outils: `tools-hub.js` + `tools-config.json`
- Rapports PDF: `premium-reports.js`
- PWA: `manifest.json`, `pwa.js`, `sw.js`
- Intelligence OPS: `ops-intelligence.js`
- Calendrier et import PDF calendrier

## Optimisations appliquées

- `styles.css` passe de ~184 KB à ~179 KB.
- Environ 1 MB de fichiers morts retirés du dossier courant.
- Service worker monté en `v74-cleanup-performance`.
- Cache CSS monté en `styles.css?v=74`.
- Icônes PWA actives gardées avec noms uniques `salvatore-v73` pour éviter le vieux cache iPhone.

## Zones risquées laissées intactes

- `app.js` contient encore des sections historiques V2.xx et des fonctions dupliquées.
- Ces sections touchent surtout Messages, Audit, compatibilité mobile et anciens wrappers. Les retirer sans tests UI exhaustifs serait plus risqué qu'utile dans cette passe.
- Les anciennes sections CSS V2.xx restent en place parce que plusieurs classes sont encore liées aux modules actifs ou aux compatibilités visuelles.

## Validation

- Syntaxe JS validée sur les modules actifs.
- `manifest.json` valide.
- `sw.js` ne référence aucun asset manquant.
- Validateur principal V41 OK:
  - CSV live lu: 4707 lignes
  - plaintes importées: 1283
  - semaine 2026-05-12 au 2026-05-18: 97 plaintes
  - moteurs Plaintes et Calendrier actifs
  - navigation sans page manquante
