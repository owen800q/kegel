# Core Timer: conventions

Mobile-first PWA for guided pelvic floor training. Full brief: the requirements
doc in the original task. Phase 1 only; **ask before starting Phase 2** (push,
D1, sync) and **before adding any dependency** not already in `package.json`.

## Commands
- `npm run dev`: Vite dev server
- `npm run build`: typecheck (vue-tsc) + production build to `dist/`
- `npm test`: Vitest unit tests (`src/**/*.test.ts`)
- `npm run test:e2e`: Playwright against `wrangler dev` (builds first). In the
  cloud container set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- `npx wrangler dev`: serve `dist/` exactly as Workers will (headers, SPA fallback)
- `npm run icons`: regenerate PNG icons from the SVG in `scripts/gen-icons.mjs`

## Architecture
- `src/engine/`: pure TS session state machine. Every method takes `now`; time
  is derived from timestamps (start, paused total, segment start), never from
  counted ticks. Keep it framework-free and fully unit-tested.
- `src/db/`: IndexedDB via `idb`. Schema changes = add a step to
  `dbMigrations` (never edit a released one) **and** a matching
  `exportMigrations` step so old backups import. Values pass through `plain()`
  because Vue proxies can't be structured-cloned.
- `src/stores/`: Pinia: `settings`, `session` (history + routines), `program`
  (current program + progress suggestion), `ui` (promise-based dialog, toast,
  actionsheet rendered by `components/UiHost.vue`).
- `src/lib/`: pure helpers (stats, ICS, PIN hashing, dates) are unit-tested;
  `cues.ts` wraps vibration, Web Audio tones, on-device speech and wake lock.
- `src/data/programs.ts`: built-in programs, in progression order. Names and
  descriptions live in i18n under `programs.<id>`.

## UI rules
- WeUI only (`weui` CSS). Use WeUI markup/classes; thin Vue wrappers live in
  `src/components/`. No other UI library.
- Colours: WeUI CSS variables only, or tokens derived from them in
  `src/styles/app.css` (`--app-brand-solid`, `--app-brand-text`,
  `--app-warn-text`, which exist because WeUI's green/red/grey fail 4.5:1).
  WeUI defines its variables on `body`, so derived tokens must be too.
- Theme: `body[data-weui-theme]` is `light`/`dark`, absent for "system".
- Every user-visible string goes through `vue-i18n` (`src/i18n/zh-HK.json` and
  `en.json`; a unit test enforces matching keys). Default locale `zh-HK`.
- Touch targets ≥ 44 px. Respect safe areas and `prefers-reduced-motion`.
  Colour is never the only cue (labels, borders, counts).

## Privacy and discretion
- No network requests to any other origin: no analytics, CDN fonts or
  third-party scripts. Speech uses `localService` voices only.
- Discreet mode (default on): page `<title>`, manifest, icon and `.ics` titles
  never contain "Kegel", "pelvic floor" or 盆底. The manifest is static and
  always neutral ("Core Timer"). Those words may appear inside app screens.
- PIN lock is a privacy screen (salted SHA-256), not security.

## Deployment
- Cloudflare Workers static assets (`wrangler.jsonc`, assets-only, SPA
  fallback). Push to `main` deploys; other branches get preview URLs.
- Headers live in `public/_headers`: strict CSP (no inline scripts or styles,
  so keep `assetsInlineLimit: 0` and never add inline `<script>`/`<style>` to
  `index.html`), `Referrer-Policy: no-referrer`, minimal `Permissions-Policy`,
  `no-cache` for `sw.js`, `manifest.webmanifest` and HTML, immutable for
  `/assets/*`.
- Service worker: `vite-plugin-pwa` `generateSW` with `registerType: 'prompt'`
  so a waiting worker triggers the in-app "Update now" dialog (`App.vue`).
