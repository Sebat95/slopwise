import type { GoogleTokenInfo, GoogleUserProfile } from '../types';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

const SESSION_KEY = 'splitsheet_token';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token: string;
              expires_in: number;
              token_type: string;
              scope: string;
              error?: string;
            }) => void;
            error_callback?: (error: { type: string; message: string }) => void;
          }) => {
            requestAccessToken: (overrides?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

function isValidToken(obj: unknown): obj is GoogleTokenInfo {
  if (!obj || typeof obj !== 'object') return false;
  const t = obj as Record<string, unknown>;
  return (
    typeof t.access_token === 'string' &&
    typeof t.expiry_time === 'number' &&
    typeof t.token_type === 'string'
  );
}

function getStoredToken(): GoogleTokenInfo | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidToken(parsed)) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (Date.now() >= parsed.expiry_time) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function storeToken(token: GoogleTokenInfo): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(token));
}

export function clearToken(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function getAccessToken(): string | null {
  return getStoredToken()?.access_token ?? null;
}

export function isTokenValid(): boolean {
  return getStoredToken() !== null;
}

export function waitForGoogleScript(): Promise<void> {
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
      } else if (++attempts > 50) {
        clearInterval(interval);
        reject(new Error('Google Identity Services script failed to load'));
      }
    }, 200);
  });
}

export async function signIn(clientId: string): Promise<GoogleTokenInfo> {
  await waitForGoogleScript();

  const gsi = window.google?.accounts?.oauth2;
  if (!gsi) throw new Error('Google Identity Services not available');

  return new Promise((resolve, reject) => {
    const tokenClient = gsi.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        const tokenInfo: GoogleTokenInfo = {
          access_token: response.access_token,
          expires_in: response.expires_in,
          token_type: response.token_type,
          scope: response.scope,
          expiry_time: Date.now() + response.expires_in * 1000 - 60000
        };
        storeToken(tokenInfo);
        resolve(tokenInfo);
      },
      error_callback: (error) => {
        reject(new Error(error.message || 'Sign-in failed'));
      }
    });

    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export async function refreshToken(
  clientId: string
): Promise<GoogleTokenInfo> {
  const existing = getStoredToken();
  if (existing) return existing;
  return signIn(clientId);
}

export async function fetchUserProfile(): Promise<GoogleUserProfile | null> {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data: Record<string, unknown> = await res.json();
    return {
      name: typeof data.name === 'string' ? data.name : '',
      email: typeof data.email === 'string' ? data.email : '',
      picture: typeof data.picture === 'string' ? data.picture : ''
    };
  } catch {
    return null;
  }
}

export function signOut(): void {
  const token = getAccessToken();
  if (token) {
    fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`
    }).catch(() => {});
  }
  clearToken();
}
