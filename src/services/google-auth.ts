import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import type { GoogleTokenInfo, GoogleUserProfile } from '../types';

const SESSION_KEY = 'slopwise_token';

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
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidToken(parsed)) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (Date.now() >= parsed.expiry_time) {
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function storeToken(token: GoogleTokenInfo): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(token));
}

export function clearToken(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function getAccessToken(): string | null {
  return getStoredToken()?.access_token ?? null;
}

export function isTokenValid(): boolean {
  return getStoredToken() !== null;
}

export function hasStoredToken(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    return isValidToken(parsed);
  } catch {
    return false;
  }
}

export async function signIn(): Promise<GoogleTokenInfo> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential || !credential.accessToken) {
      throw new Error('No access token returned from Google');
    }

    const tokenInfo: GoogleTokenInfo = {
      access_token: credential.accessToken,
      expires_in: 3600, // Google access tokens typically expire in 1 hour
      token_type: 'Bearer',
      scope:
        'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly',
      expiry_time: Date.now() + 3600 * 1000 - 60000 // 1 hour minus 1 min buffer
    };

    storeToken(tokenInfo);
    return tokenInfo;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message || 'Sign-in failed');
    }
    throw new Error('Sign-in failed');
  }
}

export async function refreshToken(): Promise<GoogleTokenInfo> {
  const existing = getStoredToken();
  if (existing) return existing;

  // With Firebase in a PWA, silent refresh of Google OAuth scopes is often blocked
  // by third-party cookie restrictions. If the token is expired, we must prompt the user again.
  // We use signInWithPopup to re-authenticate and get a fresh Google Access Token.
  return signIn();
}

export async function fetchUserProfile(): Promise<GoogleUserProfile | null> {
  // We can use Firebase's current user if available
  if (auth.currentUser) {
    return {
      name: auth.currentUser.displayName || '',
      email: auth.currentUser.email || '',
      picture: auth.currentUser.photoURL || ''
    };
  }

  // Fallback to Google API
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

export async function signOut(): Promise<void> {
  const token = getAccessToken();
  if (token) {
    fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`
    }).catch(() => {});
  }
  clearToken();
  await firebaseSignOut(auth);
}
