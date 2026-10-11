# Core Timer

A private, offline-first interval timer PWA for pelvic floor training, built
with Vue 3, WeUI and Vite, and deployed as Cloudflare Workers static assets.

- All data stays on the device (IndexedDB). No accounts, analytics or
  third-party requests.
- Discreet by default: neutral name, icon, page title and calendar reminders.
- Works offline after the first visit and installs to the home screen.

```sh
npm install
npm run dev          # develop
npm test             # unit tests
npm run build        # typecheck + build to dist/
npx wrangler dev     # serve dist/ like production
npm run test:e2e     # Playwright smoke tests (against wrangler dev)
```

See `CLAUDE.md` for conventions and architecture.

## Push reminders

No setup needed. On first use the Worker generates its own VAPID key pair and
stores it in its D1 database (`vapid_keys`); the private key never appears in
the repo or the dashboard. The D1 database itself is created automatically on
the first deploy.

Don't delete that database or the `vapid_keys` row: new keys invalidate every
existing subscription, and users would have to turn push reminders on again.

Optional: to manage the keys yourself, run `npm run vapid` and set
`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` as Worker secrets. Secrets take
precedence over the stored pair (switching also invalidates subscriptions).
`VAPID_SUBJECT` in `wrangler.jsonc` is the contact URL push services see.

This app is a training timer with general educational information. It isn't a
medical device and doesn't provide medical advice.
