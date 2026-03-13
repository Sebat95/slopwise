# Slopwise — Expense tracking Clone Powered by Google Sheets
A fully functional, mobile-first PWA for splitting expenses with friends. All data is stored in your own Google Sheets — no server, no database, fully stateless.

<span style="color: green">

## Preface

I have always wanted to try "vibecoding" an app from scratch, so here I am! I used Cursor to test several competing models:
- **GPT-5.3-Codex**
- **Composer-1.5**
- **Claude-4.6-Opus-High-Thinking**
- **Gemini-3.1-Pro**
- **Kimi-K2.5**

Each one was tasked with building a clone of a major expense-tracking app, plus everything had to be saved to a Google Sheet with seamless interoperability for CSVs from the original app.

After burning through some tokens, I had Claude 4.6 shortlist the three best versions, and I picked the one that felt right to iterate on.
From there, I stuck with Claude to refine the product and add features since it was the fastest way to ship.
I have since deployed it to Cloud Run and ironed out a few minor bugs.

I am pretty proud of the result! It is now my daily driver for expense tracking, and I will be "vibing out" any new feature or fix as they come up.

Well, I leave you now to the rest of the generated README.md

</span>


## Features

- **Expense Tracking** — Add, view, and delete expenses with descriptions, categories, amounts, and dates
- **Flexible Splitting** — Split equally, by exact amounts, by percentage, or by shares
- **Balance Calculation** — Real-time net balances for each member with simplified debt optimization
- **Settle Up** — Record payments between members to settle debts
- **Google Sheets Backend** — All data stored in your Google Sheets, accessible and editable directly
- **CSV Interop** — Import CSV exports from major competitor and export in the same format
- **PWA** — Installable on mobile and desktop, works offline for cached data
- **Sheet Picker** — Choose any spreadsheet from your Google Drive or create a new one
- **Multiple Groups** — Each spreadsheet is a group; switch between them freely

## Tech Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- Google Identity Services (OAuth 2.0)
- Google Sheets API v4 + Google Drive API v3
- vite-plugin-pwa (Workbox)

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd slopwise
yarn install
```

### 2. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API** and **Google Drive API**
4. Go to **APIs & Services → Credentials**
5. Click **Create Credentials → OAuth client ID**
6. Application type: **Web application**
7. Under **Authorized JavaScript origins**, add:
   - `http://localhost:5173` (for development)
   - Your production domain (for deployment)
8. Copy the **Client ID**
9. Go to **OAuth consent screen**, configure it, and add test users if in testing mode

### 3. Configure the client ID

Either create a `.env` file:

```bash
cp .env.example .env
# Edit .env and set your client ID
```

Or enter it directly on the login page — it will be saved in localStorage.

### 4. Run

```bash
yarn dev
```

Open http://localhost:5173

## Google Sheets Data Format

The app stores data in competitor-compatible CSV format:

| Date       | Description | Category       | Cost  | Currency | Alice  | Bob    | Charlie |
| ---------- | ----------- | -------------- | ----- | -------- | ------ | ------ | ------- |
| 2024-01-15 | Dinner      | Food & Drink   | 60.00 | USD      | 40.00  | -20.00 | -20.00  |
| 2024-01-16 | Taxi        | Transportation | 30.00 | USD      | -15.00 | 15.00  | 0.00    |

Each member column shows their **net** for that expense:

- **Positive** = they are owed money (paid more than their share)
- **Negative** = they owe money
- **Zero** = not involved or fully settled

This format is directly compatible with competitor CSV exports/imports.

## Building for Production

```bash
yarn build
```

The output will be in the `dist/` folder, ready for static hosting (Netlify, Vercel, GitHub Pages, etc.).
