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

This app is a training timer with general educational information. It isn't a
medical device and doesn't provide medical advice.
