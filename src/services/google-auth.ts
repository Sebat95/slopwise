import {
  signInWithCustomToken,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth } from './firebase';
import type { GoogleUserProfile } from '../types';

const API_BASE = '/api';
export const AUTH_EXPIRED_EVENT = 'slopwise:auth-expired';

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
            state?: string;
            access_type?: string;
            prompt?: string;
            callback: (response: {
              code?: string;
              state?: string;
              error?: string;
            }) => void;
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

function requestAuthCode(
  clientId: string,
  oauthState: string
): Promise<{ code: string }> {
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
      state: oauthState,
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
        if (response.state !== oauthState) {
          reject(new Error('OAuth state mismatch'));
          return;
        }
        resolve({ code: response.code });
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

export async function signIn(): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Missing VITE_GOOGLE_CLIENT_ID');

  const prepareRes = await fetch(`${API_BASE}/oauthPrepare`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!prepareRes.ok) {
    throw new Error(await readApiError(prepareRes, 'Could not start sign-in'));
  }
  const prepareData = (await prepareRes.json()) as { state?: string };
  const oauthState = prepareData.state;
  if (typeof oauthState !== 'string' || !oauthState) {
    throw new Error('Could not start sign-in');
  }

  await waitForGsi();
  const { code } = await requestAuthCode(clientId, oauthState);

  const res = await fetch(`${API_BASE}/exchangeCode`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({ code, state: oauthState })
  });

  if (!res.ok) {
    throw new Error(await readApiError(res, 'Sign-in failed'));
  }

  const data = (await res.json()) as ExchangeCodeResponse;

  try {
    await signInWithCustomToken(auth, data.firebase_token);
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      throw new Error('Could not establish a secure session');
    }

    const sessionRes = await fetch(`${API_BASE}/sessionLogin`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });

    if (!sessionRes.ok) {
      throw new Error(
        await readApiError(sessionRes, 'Could not establish a secure session')
      );
    }
  } finally {
    await firebaseSignOut(auth).catch(() => {});
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
  notifySessionExpired();
}
