import {
  signInWithCustomToken,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth, authPersistenceReady } from './firebase';
import type { GoogleUserProfile } from '../types';

const API_BASE = '/api';
const AUTH_EXPIRED_EVENT = 'slopwise:auth-expired';

interface SessionResponse {
  authenticated: boolean;
  user: GoogleUserProfile | null;
}

interface ExchangeCodeResponse {
  firebase_token: string;
}

// --- Google Identity Services code flow ---

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initCodeClient: (config: {
            client_id: string;
            scope: string;
            ux_mode: string;
            access_type?: string;
            prompt?: string;
            callback: (response: { code?: string; error?: string }) => void;
          }) => { requestCode: () => void };
        };
      };
    };
  }
}

function waitForGsi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    let attempts = 0;
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve();
      } else if (++attempts > 100) {
        clearInterval(interval);
        reject(new Error('Google sign-in script failed to load.'));
      }
    }, 200);
  });
}

function requestAuthCode(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const codeClient = window.google!.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.metadata.readonly',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'
      ].join(' '),
      ux_mode: 'popup',
      access_type: 'offline',
      prompt: 'consent',
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        if (!response.code) {
          reject(new Error('No auth code returned'));
          return;
        }
        resolve(response.code);
      }
    });
    codeClient.requestCode();
  });
}

async function readApiError(
  res: Response,
  fallbackMessage: string
): Promise<string> {
  const payload = await res.json().catch(() => null);
  const message =
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    (typeof payload.error === 'string' ||
      (typeof payload.error === 'object' &&
        payload.error !== null &&
        'message' in payload.error &&
        typeof payload.error.message === 'string'))
      ? typeof payload.error === 'string'
        ? payload.error
        : payload.error.message
      : null;
  return message || fallbackMessage;
}

export function notifySessionExpired(): void {
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

export function onSessionExpired(listener: () => void): () => void {
  window.addEventListener(AUTH_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, listener);
}

/**
 * Mint a new HTTP-only session cookie from the current Firebase ID token.
 * Used after Google sign-in and on debounced token refresh for sliding sessions.
 */
export async function renewServerSession(): Promise<void> {
  await authPersistenceReady;
  const user = auth.currentUser;
  if (!user) return;

  const idToken = await user.getIdToken();
  const sessionRes = await fetch(`${API_BASE}/sessionLogin`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });

  if (!sessionRes.ok) {
    throw new Error(
      await readApiError(sessionRes, 'Could not refresh secure session')
    );
  }
}

export async function signIn(): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Missing VITE_GOOGLE_CLIENT_ID');

  await waitForGsi();
  const code = await requestAuthCode(clientId);

  const res = await fetch(`${API_BASE}/exchangeCode`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });

  if (!res.ok) {
    throw new Error(await readApiError(res, 'Sign-in failed'));
  }

  const data = (await res.json()) as ExchangeCodeResponse;

  try {
    await authPersistenceReady;
    await signInWithCustomToken(auth, data.firebase_token);
    await renewServerSession();
  } catch (err) {
    await firebaseSignOut(auth).catch(() => {});
    throw err instanceof Error ? err : new Error('Sign-in failed');
  }
}

export async function getSession(): Promise<SessionResponse> {
  const res = await fetch(`${API_BASE}/session`, {
    credentials: 'include',
    cache: 'no-store'
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, 'Failed to restore session'));
  }
  const data = (await res.json()) as SessionResponse;
  return {
    authenticated: Boolean(data.authenticated),
    user: data.user ?? null
  };
}

export async function fetchUserProfile(): Promise<GoogleUserProfile | null> {
  const session = await getSession();
  return session.user;
}

export async function signOut(): Promise<void> {
  await fetch(`${API_BASE}/sessionLogout`, {
    method: 'POST',
    credentials: 'include'
  }).catch(() => {});
  await firebaseSignOut(auth);
}
