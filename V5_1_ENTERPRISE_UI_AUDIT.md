# Dashboard OPS V5.1 - Enterprise UI Transformation

## Scope

This pass is intentionally visual and additive. It does not change Supabase, CSV sources,
business calculations, restaurant permissions, inventory behavior, complaints parsing,
calendar imports or PDF exports.

## Protected engines kept intact

- `app.js`
- `complaints-isolated-v31.js`
- `executive-dashboard.js`
- `inventory-calculations.js`
- `inventory-command.js`
- `inventory-imports.js`
- `inventory-orders.js`
- `inventory-render.js`
- `inventory-supabase.js`
- `inventory-utils.js`
- `ops-auth.js`
- `ops-intelligence.js`
- `premium-reports.js`
- `pwa.js`
- `tools-config.json`

All protected files were compared against the V5.0 visual foundation archive and remained
bit-for-bit identical.

## UI changes

- Added an isolated `v5-1-ui.css` visual layer loaded after the V5.0 foundation.
- Reordered and renamed existing sidebar entries to improve enterprise navigation.
- Kept all existing pages accessible, including Tools, Audit and Configuration.
- Improved sidebar hierarchy, active state, KPI surfaces, restaurant cards, complaint cards,
  charts, admin cards and motion polish.
- Kept independent desktop scrolling for the sidebar and main content.
- Kept the compact horizontal mobile navigation rail.
- Added reduced-motion handling and mobile-specific spacing.

## OPS AI assistant

- Added `ops-ai-assistant.js` as an additive module.
- No external API, paid backend or new Supabase request is used.
- The assistant answers from the existing OPS Intelligence calculations already exposed by
  `ops-intelligence.js`.
- It explicitly reports unavailable data instead of inventing values.
- It stays hidden until authentication is ready.
- It is integrated as a floating panel and does not add a navigation page.

Supported operational questions include:

- CSI variation
- complaint variation and dominant complaint category
- restaurants requiring attention
- principal operational risk
- product complaint data availability
- recommended operational actions

## Intentionally deferred

The following requested surfaces require reliable source data or new backend structures and
were not fabricated during this visual-only pass:

- franchise owner, manager, phone and opening date profile fields
- labor cost where absent from the active dataset
- active sessions and connected devices
- full audit activity journal
- product-level complaint ranking without a structured complaint product field
- generative AI responses requiring an external model

## Validation

- JavaScript syntax validation passed.
- Protected files remained identical to the stable V5.0 archive.
- CSV complaints validator passed with the same counts as before the UI transformation.
- Calendar PDF extraction validator passed with the same events.
- Desktop browser validation passed with independent sidebar and content scrolling.
- iPhone viewport validation passed without unintended horizontal overflow.
- Splash screen and login remained visible and responsive.
- OPS AI desktop and iPhone preview validation passed without console errors.
