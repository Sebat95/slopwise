import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  getAuth,
  setPersistence
} from 'firebase/auth';

/** Keys inside the VITE_FIREBASE_CONFIG JSON secret / .env value. */
const ENV_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
  measurementId: 'VITE_MEASUREMENT_ID'
} as const;

type FirebaseWebConfig = FirebaseOptions & {
  measurementId?: string;
};

function loadFirebaseConfig(): FirebaseWebConfig {
  const raw = import.meta.env.VITE_FIREBASE_CONFIG;
  if (!raw) {
    throw new Error(
      'Missing VITE_FIREBASE_CONFIG (JSON with VITE_FIREBASE_* keys from .env or build args)'
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid VITE_FIREBASE_CONFIG: expected JSON object');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid VITE_FIREBASE_CONFIG: expected JSON object');
  }
  const config = parsed as Record<string, unknown>;

  const required = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId'
  ] as const;

  const out: Record<string, string> = {};
  for (const firebaseKey of required) {
    const envKey = ENV_KEYS[firebaseKey];
    const value = config[envKey];
    if (typeof value !== 'string' || !value) {
      throw new Error(
        `Invalid VITE_FIREBASE_CONFIG: missing or empty "${envKey}"`
      );
    }
    out[firebaseKey] = value;
  }

  const measurementId = config[ENV_KEYS.measurementId];
  if (typeof measurementId === 'string' && measurementId) {
    out.measurementId = measurementId;
  }

  return out as FirebaseWebConfig;
}

const firebaseConfig = loadFirebaseConfig();
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

/** Await before sign-in / session renewal so persistence is applied reliably. */
export const authPersistenceReady = setPersistence(
  auth,
  browserLocalPersistence
).catch(() => {});
