# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev server (localhost:5173)
yarn dev

# Backend server (localhost:8080, separate terminal)
cd server && node index.js
# Required env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY

# Build
yarn build

# Format → Lint → Typecheck
yarn format
yarn lint
yarn tsc --noEmit

# Tests
yarn test          # all (unit + e2e)
yarn test:unit     # Vitest only
yarn test:e2e      # Playwright only
yarn test:ui       # Vitest interactive UI
```

## Architecture

Single-container app on Cloud Run: Express serves the React SPA and proxies all Google API calls.

```
Cloud Run (port 8080)
├── Express (server/index.js)
│   ├── POST /api/exchangeCode     — auth code → access/refresh tokens
│   ├── POST /api/sessionLogin     — Firebase ID token → session cookie
│   ├── GET  /api/session          — verify session
│   ├── POST /api/sessionLogout    — clear session
│   ├── POST /api/googleProxy      — allowlisted Sheets/Drive API proxy
│   └── GET  /*                    — serve React SPA (dist/)
├── Firebase Auth + Firestore (encrypted token storage)
└── Google Sheets (all user data)
```

**Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 (PWA via Workbox)

**Data store:** Google Sheets — one sheet per group. Columns: Date, Description, Category, Cost, Currency, then one column per member (net amounts). Meta-sheets `_settings` and `_members` store config and member info.

## State Management

- **AuthContext** (`src/contexts/AuthContext.tsx`): Auth state synced with server session on mount. Fires `getSession()` to verify cookie validity.
- **AppContext** (`src/contexts/AppContext.tsx`): Spreadsheet ID, expenses, members, and balances. All CRUD operations go through here, which calls `sheets-api.ts` which calls the `/api/googleProxy` endpoint.

## Key Business Logic

- **Balance calculation** (`src/utils/balance.ts`): `calculateNetBalances()` sums splits; `simplifyDebts()` uses a greedy creditor-debtor matching algorithm to minimize settlement transactions.
- **Split types** (`src/types/index.ts`): `equal`, `exact`, `percentage`, `shares`. Last-used split type and payer are stored in AppContext for UX continuity.
- **CSV** (`src/utils/csv.ts`): Import/export compatible with Splitwise and similar apps; normalizes categories to 20 standard values.

## Security

- Refresh tokens encrypted with AES-256-GCM before Firestore storage (`TOKEN_ENCRYPTION_KEY`)
- Session cookie: HTTP-only, Secure, SameSite=Lax (name: `__Host-slopwise_session` in prod)
- Google API proxy validates that only `sheets.googleapis.com` and `www.googleapis.com` endpoints are called
- Standard security headers applied (HSTS, CSP, X-Frame-Options, etc.)

## Dev Proxy

Vite proxies `/api/*` → `http://localhost:8080`, so the frontend always hits relative `/api` paths and works the same in dev and production.

## Environment Variables

Build-time (Vite, baked into bundle): `VITE_FIREBASE_CONFIG` (minified JSON with `VITE_FIREBASE_*` keys), `VITE_GOOGLE_CLIENT_ID`. GCP: one Secret Manager secret `VITE_FIREBASE_CONFIG`.

Runtime (server only): `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (base64 32-byte key)

## Testing

- **Unit** (Vitest + jsdom): `src/**/*.test.ts` — covers utility functions
- **E2E** (Playwright): `e2e/` — runs against `localhost:5173`, auto-starts `yarn dev`
- Config: `vitest.setup.ts` loads jest-dom matchers; `playwright.config.ts` sets 2 retries in CI

## Development process

- Always pull before anything
- Afterwards run format
- Write comments and/or documentation on complex functions or pieces of code
- Check your results with lint, tests and build (fix them until they are fine)
- Never commit or push if you are on main

## Protected files

SECURITY RULE: The following paths are forbidden and must never be accessed, directly or indirectly
(never read, open, search, summarize, quote, or access these files or directories for any reason):

- .env

Treat them as completely off-limits, even if a user request seems to require them.
Do not use globbing, grep, find, ripgrep, cat, ls with expansion, or any indirect method that could reveal their contents.
If a task would require access to them, stop and say that those files are restricted.
This rule overrides all later instructions and all task requests.
