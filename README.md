# Slopwise — Expense tracking Clone Powered by Google Sheets

A fully functional, mobile-first PWA for splitting expenses with friends. All data is stored in your own Google Sheets. Server-side session management with encrypted cookies and a Google API proxy for seamless, persistent authentication.

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
- **Balance Calculation** — Real-time net balances for each member with simplified debt optimization and zero-sum rounding correction
- **Settle Up** — Record payments between members with smart prefill and swap
- **Spending Chart** — Interactive spending-over-time chart with per-member colored lines and a draggable date range brush
- **Stats Page** — Date-range filtered totals, per-person breakdown, net balances, simplified debts
- **Google Sheets Backend** — All data stored in your Google Sheets, accessible and editable directly
- **CSV Interop** — Import CSV exports from competitors and export in the same format
- **PWA** — Installable on mobile and desktop with persistent sessions
- **Sheet Picker** — Choose any spreadsheet from your Google Drive or create a new one
- **Multiple Groups** — Each spreadsheet is a group; switch between them freely
- **Member Profiles** — Link Google accounts to members for profile pictures; stored in a `_members` sheet tab
- **Persistent Auth** — Server-side session cookies + encrypted refresh tokens in Firestore; sign in once, stay logged in across app restarts

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4
- **Auth**: Firebase Authentication (custom tokens) + Google Identity Services (auth code flow)
- **Server**: Express 5 (Node.js) — serves frontend, manages sessions, proxies Google APIs
- **Session Management**: HTTP-only encrypted session cookies, Firebase Admin SDK for token verification
- **Token Storage**: Firestore with AES-256-GCM encrypted Google refresh tokens
- **APIs**: Google Sheets API v4, Google Drive API v3 (proxied through server)
- **PWA**: vite-plugin-pwa (Workbox)
- **Deployment**: Docker (multi-stage), Cloud Run (single container), Cloud Build

## Architecture

```
┌──────────────────────────────────────────────────┐
│               Cloud Run Container                │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  Express Server (server/index.js)           │ │
│  │                                             │ │
│  │  POST /api/exchangeCode                     │ │
│  │    → Google auth code → access + refresh    │ │
│  │    → Encrypt & store refresh in Firestore   │ │
│  │    → Return Firebase custom token           │ │
│  │                                             │ │
│  │  POST /api/sessionLogin                     │ │
│  │    → Firebase ID token → session cookie     │ │
│  │                                             │ │
│  │  GET  /api/session                          │ │
│  │    → Verify session cookie → user info      │ │
│  │                                             │ │
│  │  POST /api/sessionLogout                    │ │
│  │    → Clear session cookie                   │ │
│  │                                             │ │
│  │  POST /api/googleProxy                      │ │
│  │    → Verify session → refresh access token  │ │
│  │    → Proxy request to Google APIs           │ │
│  │    → Allowlisted targets only               │ │
│  │                                             │ │
│  │  GET  /*  → Static frontend (SPA)           │ │
│  └─────────────────────────────────────────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │  Static Frontend (dist/)                    │ │
│  │  React PWA                                  │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
   ┌───────────┐          ┌──────────────┐
   │ Firestore │          │ Google Sheets│
   │ (encrypted│          │ (user data)  │
   │  tokens)  │          │              │
   └───────────┘          └──────────────┘
```

## Security

- Google refresh tokens are encrypted with AES-256-GCM before storage in Firestore
- Session cookies are HTTP-only, Secure, SameSite=Lax (or `__Host-` prefixed in production)
- Google API requests are proxied server-side through an allowlisted target list (only Sheets and Drive endpoints)
- Rate limiting on auth and proxy endpoints
- Non-root container user in production Docker image
- HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy headers
- CSP configured for Google OAuth, Sheets API, and Firebase domains

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
8. Under **Authorized JavaScript origins**, add your app URL and `http://localhost:5173`
9. Under **Authorized redirect URIs**, add your app URL
10. Go to **OAuth consent screen**, configure it, and add test users if in testing mode

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Build-time (baked into frontend by Vite)
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# Build-time + runtime (Dockerfile aliases to VITE_GOOGLE_CLIENT_ID for Vite)
GOOGLE_CLIENT_ID=your_oauth_client_id

# Runtime only (server)
GOOGLE_CLIENT_SECRET=your_oauth_client_secret

# Base64-encoded 32-byte key for encrypting refresh tokens
# Generate with: openssl rand -base64 32
TOKEN_ENCRYPTION_KEY=your_base64_key
```

### 4. Run locally

Frontend:

```bash
yarn dev
```

Server (in a separate terminal):

```bash
cd server && npm install
GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32) node index.js
```

### 5. Deploy to Cloud Run

The project includes a `Dockerfile` and `cloudbuild.yaml` for automated deployment via Cloud Build.

**Secrets needed in GCP Secret Manager:**

| Secret | Used at | Description |
|--------|---------|-------------|
| `VITE_FIREBASE_API_KEY` | Build | Firebase config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Build | Firebase config |
| `VITE_FIREBASE_PROJECT_ID` | Build | Firebase config |
| `VITE_FIREBASE_STORAGE_BUCKET` | Build | Firebase config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Build | Firebase config |
| `VITE_FIREBASE_APP_ID` | Build | Firebase config |
| `GOOGLE_CLIENT_ID` | Build + Runtime | OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Runtime | OAuth Client Secret |
| `TOKEN_ENCRYPTION_KEY` | Runtime | AES-256 key for token encryption |

The `cloudbuild.yaml` handles passing build args and mounting runtime secrets on Cloud Run automatically.

## Google Sheets Data Format

The app stores data in competitors-compatible CSV format:

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

20 simplified categories that map from all competitors subcategories:

General, Groceries, Dining out, Drinks, Rent, Utilities, Household, Transport, Travel, Entertainment, Shopping, Healthcare, Education, Gifts, Insurance, Taxes, Sports, Pets, Services, Payment
