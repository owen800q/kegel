# Core Timer: conventions

Mobile-first PWA for guided pelvic floor training. Full brief: the requirements
doc in the original task. Phase 1 plus Phase 2 §4.1 (Web Push reminders) are
built; **ask before starting encrypted sync (§4.2)** and **before adding any
dependency** not already in `package.json`.

## Commands
- `npm run dev`: Vite dev server
- `npm run build`: typecheck (vue-tsc) + production build to `dist/`
- `npm test`: Vitest unit tests (`src/**/*.test.ts`)
- `npm run test:e2e`: Playwright against `wrangler dev` (which builds first via `build` in `wrangler.jsonc`). In the
  cloud container set `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- `npx wrangler dev`: serve `dist/` exactly as Workers will (headers, SPA fallback, `/api/*`)
- `npm run vapid`: print a VAPID key pair (only if overriding the auto-generated one)
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

## Push reminders (Worker)
- `worker/index.ts` handles only `/api/*` (`run_worker_first`); everything else
  is static assets. Endpoints: `GET /api/push/config`, `POST|DELETE
  /api/push/subscribe`, `POST /api/push/test`. Cron `*/5 * * * *` sends due
  reminders (`worker/schedule.ts`: due for 15 min after the time, once per local day).
- D1 (`DB`) stores only endpoint, keys, reminder times, time zone and
  last-sent days, plus the server's VAPID pair (`vapid_keys`). Never training data. The table is created by the Worker
  (`CREATE TABLE IF NOT EXISTS`); the database is auto-provisioned by Wrangler.
- `worker/webpush.ts` implements VAPID (RFC 8292) and aes128gcm (RFC 8291) on
  Web Crypto. No push library. Endpoints are restricted to known push-service hosts.
- VAPID keys: generated once by the Worker and stored in D1 (`getVapid`), so
  push needs no setup. Optional secrets `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`
  override them. Never commit a private key; changing keys invalidates all
  subscriptions.
- `public/push-sw.js` is imported into the Workbox SW. Notification text is
  always neutral; it reads locale and app name from the app's IndexedDB
  (and must never create that database itself).
- e2e `push.spec.ts` runs the real Worker against a mock push service that
  verifies VAPID and decrypts the payload; cron is triggered via
  `/cdn-cgi/handler/scheduled`.

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
- Cloudflare Workers (`wrangler.jsonc`): static assets with SPA fallback plus
  the push Worker. Push to `main` deploys; other branches get preview URLs.
- Headers live in `public/_headers`: strict CSP (no inline scripts or styles,
  so keep `assetsInlineLimit: 0` and never add inline `<script>`/`<style>` to
  `index.html`), `Referrer-Policy: no-referrer`, minimal `Permissions-Policy`,
  `no-cache` for `sw.js`, `manifest.webmanifest` and HTML, immutable for
  `/assets/*`.
- Service worker: `vite-plugin-pwa` `generateSW` with `registerType: 'prompt'`
  so a waiting worker triggers the in-app "Update now" dialog (`App.vue`).
  `stores/update.ts` checks for a new `sw.js` on start, when the app returns to
  the foreground (installed iOS apps resume rather than relaunch), hourly, and
  from Settings → 檢查更新, which also offers a dismissed update.
