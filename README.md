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

## Push reminders: one-time setup

The push API needs a VAPID key pair stored as Worker secrets. The D1 database
is created automatically on the first deploy.

```sh
npm run vapid                               # prints VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_PUBLIC_KEY    # paste the public key
npx wrangler secret put VAPID_PRIVATE_KEY   # paste the private key
```

(Or add both under the Worker's *Settings → Variables and Secrets* in the
Cloudflare dashboard.) `VAPID_SUBJECT` in `wrangler.jsonc` is the contact URL
push services see. Keep the keys stable: changing them invalidates every
existing subscription.

For local development put the same keys in `.dev.vars` (git-ignored).

This app is a training timer with general educational information. It isn't a
medical device and doesn't provide medical advice.
