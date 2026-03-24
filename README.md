# Slopwise — Expense tracking Clone Powered by Google Sheets

A fully functional, mobile-first PWA for splitting expenses with friends. All data is stored in your own Google Sheets. Authentication via Firebase + server-side token refresh for seamless mobile experience.

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
> I have since deployed it to Cloud Run (only opened to whitelisted emails, blame it on google strict CLIENT_ID policy) and ironed out a few minor bugs.
>
> I am pretty proud of the result! It is now my daily driver for expense tracking, and I will be "vibing out" any new feature or fix as they come up.
>
> Well, I leave you now to the rest of the generated README.md

## Features

- **Expense Tracking** — Add, edit, and delete expenses with descriptions, categories, amounts, and dates
- **Flexible Splitting** — Split equally, by exact amounts, by percentage, or by shares; last split type and payer remembered
- **Balance Calculation** — Real-time net balances for each member with simplified debt optimization
- **Settle Up** — Record payments between members with smart prefill and swap
- **Spending Chart** — Interactive spending-over-time chart with per-member lines and a draggable date range brush
- **Google Sheets Backend** — All data stored in your Google Sheets, accessible and editable directly
- **CSV Interop** — Import CSV exports from major competitor and export in the same format
- **PWA** — Installable on mobile and desktop with persistent login
- **Sheet Picker** — Choose any spreadsheet from your Google Drive or create a new one
- **Multiple Groups** — Each spreadsheet is a group; switch between them freely
- **Member Profiles** — Link Google accounts to members for profile pictures; stored in a `_members` sheet tab
- **Persistent Auth** — Firebase session + server-side Google token refresh; sign in once, stay logged in forever

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4
- **Auth**: Firebase Authentication (Google OAuth 2.0)
- **APIs**: Google Sheets API v4, Google Drive API v3
- **Server**: Express (Node.js) — serves frontend + token refresh API
- **Token Storage**: Firestore (stores Google refresh tokens for silent renewal)
- **PWA**: vite-plugin-pwa (Workbox)
- **Deployment**: Docker, Cloud Run (single container serves everything)

## Architecture

```
┌─────────────────────────────────────────────┐
│              Cloud Run Container             │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Express Server (server/index.js)      │  │
│  │                                        │  │
│  │  GET /*       → Static frontend (SPA)  │  │
│  │  POST /api/exchangeCode               │  │
│  │    → Google auth code → tokens         │  │
│  │    → Store refresh token in Firestore  │  │
│  │    → Return access token + Firebase    │  │
│  │      custom token                      │  │
│  │  POST /api/refreshGoogleToken         │  │
│  │    → Firebase ID token → verify        │  │
│  │    → Get refresh token from Firestore  │  │
│  │    → Mint fresh Google access token    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Static Frontend (dist/)               │  │
│  │  React PWA                             │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
   ┌───────────┐          ┌──────────────┐
   │ Firestore │          │ Google Sheets│
   │ (tokens)  │          │ (user data)  │
   └───────────┘          └──────────────┘
```

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd slopwise
corepack enable
yarn install
```

### 2. Set up Firebase & Google Cloud

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a new project
2. Go to **Authentication → Sign-in method** and enable **Google**
3. Go to **Project Settings → General**, add a Web App, and copy the `firebaseConfig` object
4. Go to **Firestore Database → Create database** (production mode, choose your region)
5. Go to [Google Cloud Console](https://console.cloud.google.com/) for the same project
6. Enable the **Google Sheets API** and **Google Drive API**
7. Go to **APIs & Services → Credentials** and note the **OAuth Client ID** and **Client Secret**
8. Go to **OAuth consent screen**, configure it, and add test users if in testing mode

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Build-time (baked into frontend)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Build-time + runtime
GOOGLE_CLIENT_ID=your_oauth_client_id

# Runtime only (server)
GOOGLE_CLIENT_SECRET=your_oauth_client_secret
```

### 4. Run locally

```bash
yarn dev
```

Open http://localhost:5173

For the token refresh API to work locally, you also need to run the server:

```bash
cd server && npm install && GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx node index.js
```

### 5. Deploy to Cloud Run

The project includes a `Dockerfile` and `cloudbuild.yaml` for automated deployment.

**Secrets needed in GCP Secret Manager:**

- All `VITE_FIREBASE_*` secrets (build-time)
- `GOOGLE_CLIENT_ID` (build-time + runtime)
- `GOOGLE_CLIENT_SECRET` (runtime only)

The `cloudbuild.yaml` handles passing build args and setting Cloud Run env vars automatically.

## Google Sheets Data Format

The app stores data in competitor-compatible CSV format:

| Date       | Description | Category   | Cost  | Currency | Alice  | Bob    | Charlie |
| ---------- | ----------- | ---------- | ----- | -------- | ------ | ------ | ------- |
| 2024-01-15 | Dinner      | Dining out | 60.00 | EUR      | 40.00  | -20.00 | -20.00  |
| 2024-01-16 | Taxi        | Transport  | 30.00 | EUR      | -15.00 | 15.00  | 0.00    |

Each member column shows their **net** for that expense:

- **Positive** = they are owed money (paid more than their share)
- **Negative** = they owe money
- **Zero** = not involved or fully settled

Additional sheet tabs:

- **`_settings`** — currency, last split type, last payer
- **`_members`** — member name, linked email, profile photo URL

## Categories

20 simplified categories that map from all Splitwise subcategories:

General, Groceries, Dining out, Drinks, Rent, Utilities, Household, Transport, Travel, Entertainment, Shopping, Healthcare, Education, Gifts, Insurance, Taxes, Sports, Pets, Services, Payment
