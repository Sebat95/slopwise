import {
  signInWithCustomToken,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth } from './firebase';
import type { GoogleTokenInfo, GoogleUserProfile } from '../types';

const API_BASE = import.meta.env.VITE_FUNCTIONS_URL || '';
let cachedToken: GoogleTokenInfo | null = null;

// --- Token cache ---

function isValidToken(obj: unknown): obj is GoogleTokenInfo {
  if (!obj || typeof obj !== 'object') return false;
  const t = obj as Record<string, unknown>;
  return (
    typeof t.access_token === 'string' &&
    typeof t.expiry_time === 'number' &&
    typeof t.token_type === 'string'
  );
}

function getCachedToken(): GoogleTokenInfo | null {
  if (!isValidToken(cachedToken)) {
    cachedToken = null;
    return null;
  }
  if (Date.now() >= cachedToken.expiry_time) {
    cachedToken = null;
    return null;
  }
  return cachedToken;
}

function storeToken(token: GoogleTokenInfo): void {
  cachedToken = token;
}

export function clearToken(): void {
  cachedToken = null;
}

export function getAccessToken(): string | null {
  return getCachedToken()?.access_token ?? null;
}

export function isTokenValid(): boolean {
  return getCachedToken() !== null;
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

// --- Sign in (one popup, then silent forever) ---

export async function signIn(): Promise<GoogleTokenInfo> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Missing VITE_GOOGLE_CLIENT_ID');

  await waitForGsi();

  // Get auth code from Google (popup)
  const code = await requestAuthCode(clientId);

  // Exchange code on server → access token + refresh token stored + Firebase custom token
  const res = await fetch(`${API_BASE}/api/exchangeCode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Exchange failed' }));
    throw new Error(err.error || 'Sign-in failed');
  }

  const data = await res.json();

  // Sign into Firebase with the custom token (establishes persistent session)
  await signInWithCustomToken(auth, data.firebase_token);

  const tokenInfo: GoogleTokenInfo = {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600,
    token_type: 'Bearer',
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    expiry_time: Date.now() + (data.expires_in || 3600) * 1000 - 60000
  };

  storeToken(tokenInfo);
  return tokenInfo;
}

// --- Silent refresh (no popup, no user interaction) ---

export async function refreshToken(): Promise<GoogleTokenInfo> {
  const existing = getCachedToken();
  if (existing) return existing;

  // Get Firebase ID token (persisted by Firebase via IndexedDB)
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const idToken = await user.getIdToken(true);

  const res = await fetch(`${API_BASE}/api/refreshGoogleToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Refresh failed' }));
    if (err.error === 'no_refresh_token') {
      throw new Error('no_refresh_token');
    }
    throw new Error(err.error || 'Token refresh failed');
  }

  const data = await res.json();

  const tokenInfo: GoogleTokenInfo = {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600,
    token_type: 'Bearer',
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    expiry_time: Date.now() + (data.expires_in || 3600) * 1000 - 60000
  };

  storeToken(tokenInfo);
  return tokenInfo;
}

// --- User profile ---

export async function fetchUserProfile(): Promise<GoogleUserProfile | null> {
  if (auth.currentUser) {
    return {
      name: auth.currentUser.displayName || '',
      email: auth.currentUser.email || '',
      picture: auth.currentUser.photoURL || ''
    };
  }
  return null;
}

// --- Sign out ---

export async function signOut(): Promise<void> {
  clearToken();
  await firebaseSignOut(auth);
}
