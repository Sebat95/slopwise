# Slopwise

Mobile-first PWA for splitting expenses; **data lives in your Google Sheets**. Express handles sessions, encrypts refresh tokens in Firestore, and proxies Google APIs.

> [!IMPORTANT]
> I have always wanted to try "vibecoding" an app from scratch, so here I am! I used Cursor to test several competing models:
>
> - **GPT-5.3-Codex**
> - **Composer-1.5**
> - **Claude-4.6-Opus-High-Thinking**
> - **Gemini-3.1-Pro**
> - **Kimi-K2.5**
>
> Each one was tasked with building a clone of a major expense-tracking app, plus everything had to be saved to a Google Sheet with seamless interoperability for CSVs from the original app.
>
> After burning through some tokens, I had Claude 4.6 shortlist the three best versions, and I picked the one that felt right to iterate on.
> From there, I stuck with Claude to refine the product and add features since it was the fastest way to ship.
> I have since deployed it to Cloud Run and I ironed out a few minor bugs.
>
> I am pretty proud of the result! It is now my daily driver for expense tracking, and I will be "vibing out" any new features or fixes as they come up.
>
> Well, I leave you now to the rest of the generated README.md

## Features

Splits (equal, exact, %, shares), balances and simplified debts, settle-up, spending chart and stats, CSV import/export, multi-group via spreadsheets, PWA, Google sign-in with persistent server sessions.

## Stack

React 19, TypeScript, Vite, Tailwind v4, Firebase Auth + Admin, Google Identity Services (code flow), Express 5, Sheets + Drive APIs (server proxy), Workbox PWA. Deployed as one Docker image on Cloud Run (see `Dockerfile`, `cloudbuild.yaml`).

**Runtime shape:** browser → Vite dev server or static `dist/` → `/api/*` on Express (8080) → Firestore (encrypted tokens) + Google Sheets (expenses). In production the same container serves the SPA and API.

**Security (summary):** encrypted refresh tokens, HTTP-only session cookies, allowlisted proxy targets, rate limits on sensitive routes, hardened headers and CSP in production.

## Local setup

1. **Firebase / GCP (same project):** enable Auth (Google), create Firestore, add a Web app and copy `firebaseConfig`. In Google Cloud: enable Sheets + Drive APIs, create an **OAuth Web client**, copy Client ID and secret.
2. **OAuth client:** under **Authorized JavaScript origins**, add `http://localhost:5173` and your production origin when you have one. Redirect URIs are usually unnecessary for this GIS popup + `postmessage` flow unless the console asks for them.
3. **Env:** `cp .env.example .env` and fill values (see `.env.example`). Use the **same** OAuth client ID for `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID`. Vite loads `VITE_*` from the repo root `.env`; the **server does not read `.env`**—export `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY` in the server shell or pass them inline below.
4. **Firebase Admin locally:** run `gcloud auth application-default login` (user with Firestore access) or set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON. Server needs **Node ≥ 22** (`server/package.json` `engines`).

```bash
corepack enable && yarn install
yarn dev   # app http://localhost:5173 — proxies /api to http://localhost:8080
```

```bash
cd server && npm install
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)" node index.js
```

**Docker / Cloud Build:** the `GOOGLE_CLIENT_ID` secret is passed as the `VITE_GOOGLE_CLIENT_ID` build arg at image build; runtime secrets are wired in `cloudbuild.yaml` (Firebase `VITE_*`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` in Secret Manager).

## Development

`yarn format` · `yarn lint` · `yarn tsc --noEmit` · `yarn test` (unit + e2e; e2e starts `yarn dev`) · `yarn test:unit` · `yarn test:e2e` · `yarn build`

Contributor-oriented detail: [CLAUDE.md](CLAUDE.md).

## Sheet layout

Tabular expenses: **Date, Description, Category, Cost, Currency**, then one column per member (**net** per row: positive = owed, negative = owes). Meta tabs **`_settings`** (defaults) and **`_members`** (names, linked email, photo URL). Twenty normalized categories (`CATEGORIES` in [src/types/index.ts](src/types/index.ts)) for CSV interop with tools like Splitwise.
