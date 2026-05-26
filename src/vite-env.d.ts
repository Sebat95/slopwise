/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Minified JSON with VITE_FIREBASE_* keys (see .env.example). */
  readonly VITE_FIREBASE_CONFIG: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
