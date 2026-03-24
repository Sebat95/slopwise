import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { OAuth2Client } from 'google-auth-library';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(__dirname, 'public');
const PORT = parseInt(process.env.PORT || '8080', 10);
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 5;
const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Host-slopwise_session'
    : 'slopwise_session';
const GOOGLE_PROXY_TIMEOUT_MS = 15000;
const GOOGLE_ACCESS_TOKEN_TTL_FALLBACK_MS = 1000 * 60 * 55;
const GOOGLE_ALLOWED_TARGETS = new Map([
  ['sheets.googleapis.com', ['/v4/spreadsheets']],
  ['www.googleapis.com', ['/drive/v3/files']]
]);
const ALLOWED_PROXY_METHODS = new Set(['GET', 'POST', 'PUT']);
const TOKEN_ENCRYPTION_KEY = parseEncryptionKey(
  process.env.TOKEN_ENCRYPTION_KEY || ''
);

initializeApp();

class HttpError extends Error {
  constructor(status, code, message, cause) {
    super(message);
    this.status = status;
    this.code = code;
    this.cause = cause;
  }
}

const googleAccessTokenCache = new Map();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '5mb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }
  next();
});

function parseEncryptionKey(rawKey) {
  const trimmed = rawKey.trim();
  const decoded = Buffer.from(trimmed, 'base64');
  if (!trimmed || decoded.length !== 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte secret.'
    );
  }
  return decoded;
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }
  return new OAuth2Client(clientId, clientSecret, 'postmessage');
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DURATION_MS
  };
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  for (const segment of cookieHeader.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key =
      separatorIndex >= 0 ? trimmed.slice(0, separatorIndex) : trimmed;
    if (key !== name) continue;
    const value = separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : '';
    return decodeURIComponent(value);
  }

  return null;
}

function getRateLimitKey(req) {
  return req.ip || 'unknown';
}

function createRateLimiter({ windowMs, maxRequests, code, message }) {
  const buckets = new Map();

  return (req, _res, next) => {
    const now = Date.now();
    const key = getRateLimitKey(req);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (bucket.count >= maxRequests) {
      next(new HttpError(429, code, message));
      return;
    }

    bucket.count += 1;
    next();
  };
}

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 20,
  code: 'auth_rate_limited',
  message: 'Too many authentication attempts. Try again later.'
});

const googleProxyRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 240,
  code: 'api_rate_limited',
  message: 'Too many Google API requests. Slow down and try again shortly.'
});

function sendNoStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

function isFirebaseAuthCode(error, code) {
  return Boolean(error && typeof error === 'object' && error.code === code);
}

function mapFirebaseAuthError(error, fallbackMessage) {
  if (isFirebaseAuthCode(error, 'auth/invalid-email')) {
    return new HttpError(
      400,
      'invalid_email',
      'The Google account email address was invalid.',
      error
    );
  }
  if (isFirebaseAuthCode(error, 'auth/email-already-exists')) {
    return new HttpError(
      409,
      'account_conflict',
      'That Google account is already linked to another user.',
      error
    );
  }
  return new HttpError(502, 'firebase_auth_error', fallbackMessage, error);
}

function mapGoogleOAuthError(error) {
  const status = error?.response?.status;
  if (status === 400) {
    return new HttpError(
      400,
      'invalid_google_code',
      'Google sign-in was rejected. Please try again.',
      error
    );
  }
  if (status === 401 || status === 403) {
    return new HttpError(
      401,
      'google_auth_failed',
      'Google sign-in failed. Please try again.',
      error
    );
  }
  return new HttpError(
    502,
    'google_oauth_unavailable',
    'Google sign-in is temporarily unavailable.',
    error
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function normalizeGoogleProfile(rawProfile) {
  if (!rawProfile || typeof rawProfile !== 'object') {
    throw new HttpError(
      502,
      'invalid_google_profile',
      'Could not read your Google account details.'
    );
  }

  const email =
    typeof rawProfile.email === 'string' ? rawProfile.email.trim() : '';
  const emailVerified = rawProfile.email_verified === true;
  if (!email || !isValidEmail(email) || !emailVerified) {
    throw new HttpError(
      400,
      'invalid_google_profile',
      'Your Google account must have a verified email address.'
    );
  }

  return {
    email: email.toLowerCase(),
    name: typeof rawProfile.name === 'string' ? rawProfile.name.trim() : '',
    picture:
      typeof rawProfile.picture === 'string' ? rawProfile.picture.trim() : ''
  };
}

async function getOrCreateFirebaseUser(profile) {
  const adminAuth = getAuth();
  let userRecord;

  try {
    userRecord = await adminAuth.getUserByEmail(profile.email);
  } catch (error) {
    if (!isFirebaseAuthCode(error, 'auth/user-not-found')) {
      throw mapFirebaseAuthError(error, 'Could not look up your account.');
    }

    try {
      userRecord = await adminAuth.createUser({
        email: profile.email,
        emailVerified: true,
        displayName: profile.name || undefined,
        photoURL: profile.picture || undefined
      });
    } catch (createError) {
      if (isFirebaseAuthCode(createError, 'auth/email-already-exists')) {
        userRecord = await adminAuth.getUserByEmail(profile.email);
      } else {
        throw mapFirebaseAuthError(
          createError,
          'Could not create your account.'
        );
      }
    }
  }

  const updates = {};
  if (!userRecord.emailVerified) updates.emailVerified = true;
  if (profile.name && userRecord.displayName !== profile.name) {
    updates.displayName = profile.name;
  }
  if (profile.picture && userRecord.photoURL !== profile.picture) {
    updates.photoURL = profile.picture;
  }

  if (Object.keys(updates).length === 0) {
    return userRecord;
  }

  try {
    return await adminAuth.updateUser(userRecord.uid, updates);
  } catch (error) {
    throw mapFirebaseAuthError(error, 'Could not update your account.');
  }
}

function encryptRefreshToken(refreshToken) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', TOKEN_ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(refreshToken, 'utf8'),
    cipher.final()
  ]);
  return {
    refresh_token_ciphertext: encrypted.toString('base64'),
    refresh_token_iv: iv.toString('base64'),
    refresh_token_tag: cipher.getAuthTag().toString('base64'),
    key_version: 1,
    updated_at: new Date().toISOString()
  };
}

function decryptRefreshToken(data) {
  if (
    typeof data.refresh_token_ciphertext !== 'string' ||
    typeof data.refresh_token_iv !== 'string' ||
    typeof data.refresh_token_tag !== 'string'
  ) {
    throw new HttpError(
      401,
      'reauth_required',
      'Your Google session is incomplete. Please sign in again.'
    );
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      TOKEN_ENCRYPTION_KEY,
      Buffer.from(data.refresh_token_iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(data.refresh_token_tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(data.refresh_token_ciphertext, 'base64')),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new HttpError(
      401,
      'reauth_required',
      'Your Google session could not be restored. Please sign in again.',
      error
    );
  }
}

async function storeRefreshToken(uid, refreshToken) {
  googleAccessTokenCache.delete(uid);
  await getFirestore()
    .collection('user_tokens')
    .doc(uid)
    .set(
      {
        ...encryptRefreshToken(refreshToken),
        refresh_token: FieldValue.delete()
      },
      { merge: true }
    );
}

async function getStoredRefreshToken(uid) {
  const tokenDoc = await getFirestore()
    .collection('user_tokens')
    .doc(uid)
    .get();
  const data = tokenDoc.data();
  if (!tokenDoc.exists || !data) {
    throw new HttpError(
      401,
      'reauth_required',
      'Your Google session expired. Please sign in again.'
    );
  }

  if (typeof data.refresh_token === 'string' && data.refresh_token) {
    const legacyToken = data.refresh_token;
    await storeRefreshToken(uid, legacyToken);
    return legacyToken;
  }

  return decryptRefreshToken(data);
}

async function hasStoredRefreshToken(uid) {
  const tokenDoc = await getFirestore()
    .collection('user_tokens')
    .doc(uid)
    .get();
  const data = tokenDoc.data();
  return Boolean(
    tokenDoc.exists &&
    data &&
    (typeof data.refresh_token === 'string' ||
      (typeof data.refresh_token_ciphertext === 'string' &&
        typeof data.refresh_token_iv === 'string' &&
        typeof data.refresh_token_tag === 'string'))
  );
}

async function getGoogleAccessTokenForUser(uid) {
  const cachedToken = googleAccessTokenCache.get(uid);
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.accessToken;
  }

  const refreshToken = await getStoredRefreshToken(uid);
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  let refreshedCredentials;
  try {
    const refreshResult = await client.refreshAccessToken();
    refreshedCredentials = refreshResult.credentials;
  } catch (error) {
    googleAccessTokenCache.delete(uid);
    throw new HttpError(
      401,
      'reauth_required',
      'Your Google session expired. Please sign in again.',
      error
    );
  }

  if (!refreshedCredentials.access_token) {
    googleAccessTokenCache.delete(uid);
    throw new HttpError(
      502,
      'google_refresh_failed',
      'Could not refresh your Google access.',
      refreshedCredentials
    );
  }

  if (refreshedCredentials.refresh_token) {
    await storeRefreshToken(uid, refreshedCredentials.refresh_token);
  }

  const expiresAt =
    typeof refreshedCredentials.expiry_date === 'number'
      ? refreshedCredentials.expiry_date
      : Date.now() + GOOGLE_ACCESS_TOKEN_TTL_FALLBACK_MS;

  googleAccessTokenCache.set(uid, {
    accessToken: refreshedCredentials.access_token,
    expiresAt
  });

  return refreshedCredentials.access_token;
}

async function maybeGetSession(req, res) {
  const sessionCookie = getCookie(req, SESSION_COOKIE_NAME);
  if (!sessionCookie) return null;

  try {
    return await getAuth().verifySessionCookie(sessionCookie, true);
  } catch {
    clearSessionCookie(res);
    return null;
  }
}

async function requireSession(req, res) {
  const decodedSession = await maybeGetSession(req, res);
  if (!decodedSession?.uid) {
    throw new HttpError(
      401,
      'unauthenticated',
      'Please sign in again to continue.'
    );
  }
  return decodedSession;
}

async function getSessionUser(uid) {
  try {
    const user = await getAuth().getUser(uid);
    return {
      name: user.displayName || '',
      email: user.email || '',
      picture: user.photoURL || ''
    };
  } catch (error) {
    throw mapFirebaseAuthError(error, 'Could not read your account.');
  }
}

function parseIdToken(body) {
  const idToken = body?.idToken;
  if (typeof idToken !== 'string' || !idToken.trim()) {
    throw new HttpError(
      400,
      'missing_id_token',
      'Missing Firebase session bootstrap token.'
    );
  }
  return idToken.trim();
}

function parseAuthorizationCode(body) {
  const code = body?.code;
  if (typeof code !== 'string' || !code.trim()) {
    throw new HttpError(
      400,
      'missing_code',
      'Missing Google authorization code.'
    );
  }
  return code.trim();
}

function parseProxyRequest(body) {
  if (!body || typeof body !== 'object') {
    throw new HttpError(
      400,
      'invalid_proxy_request',
      'Invalid Google API request.'
    );
  }

  const url = body.url;
  const method =
    typeof body.method === 'string' ? body.method.toUpperCase() : 'GET';
  const requestBody = body.body;

  if (typeof url !== 'string' || !url.trim()) {
    throw new HttpError(
      400,
      'invalid_proxy_request',
      'Google API requests must include a URL.'
    );
  }

  if (!ALLOWED_PROXY_METHODS.has(method)) {
    throw new HttpError(
      400,
      'invalid_proxy_method',
      'That Google API method is not allowed.'
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new HttpError(
      400,
      'invalid_proxy_request',
      'Google API URL was malformed.'
    );
  }

  const allowedPrefixes = GOOGLE_ALLOWED_TARGETS.get(parsedUrl.host);
  if (
    !allowedPrefixes ||
    !allowedPrefixes.some((prefix) => parsedUrl.pathname.startsWith(prefix))
  ) {
    throw new HttpError(
      400,
      'invalid_proxy_target',
      'That Google API target is not allowed.'
    );
  }

  if (requestBody != null && typeof requestBody !== 'string') {
    throw new HttpError(
      400,
      'invalid_proxy_request',
      'Google API bodies must be JSON strings.'
    );
  }

  return {
    url: parsedUrl.toString(),
    method,
    body: requestBody ?? undefined
  };
}

async function mapGoogleApiError(response) {
  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (response.status === 400) {
    return new HttpError(
      400,
      'google_bad_request',
      'Google rejected that request.',
      responseBody
    );
  }
  if (response.status === 401) {
    return new HttpError(
      401,
      'reauth_required',
      'Your Google session expired. Please sign in again.',
      responseBody
    );
  }
  if (response.status === 403) {
    return new HttpError(
      403,
      'google_forbidden',
      'Google denied access to that spreadsheet operation.',
      responseBody
    );
  }
  if (response.status === 404) {
    return new HttpError(
      404,
      'google_not_found',
      'The requested Google resource was not found.',
      responseBody
    );
  }
  if (response.status === 429) {
    return new HttpError(
      429,
      'google_rate_limited',
      'Google API rate limits were exceeded. Try again shortly.',
      responseBody
    );
  }

  return new HttpError(
    502,
    'google_upstream_error',
    'Google API is temporarily unavailable.',
    responseBody
  );
}

function logServerError(error, req) {
  console.error(
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`,
    error
  );
}

function sendErrorResponse(error, req, res) {
  if (error instanceof HttpError) {
    if (error.status >= 500) {
      logServerError(error.cause || error, req);
    }
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  logServerError(error, req);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Something went wrong on the server.'
    }
  });
}

app.post('/api/exchangeCode', authRateLimiter, async (req, res) => {
  sendNoStore(res);

  try {
    const code = parseAuthorizationCode(req.body);
    const client = getOAuth2Client();

    let tokens;
    try {
      const tokenResponse = await client.getToken(code);
      tokens = tokenResponse.tokens;
    } catch (error) {
      throw mapGoogleOAuthError(error);
    }

    if (!tokens.access_token) {
      throw new HttpError(
        502,
        'google_oauth_missing_access_token',
        'Google did not return an access token.'
      );
    }

    client.setCredentials(tokens);
    const userInfoResponse = await client.request({
      url: 'https://www.googleapis.com/oauth2/v3/userinfo'
    });
    const profile = normalizeGoogleProfile(userInfoResponse.data);
    const firebaseUser = await getOrCreateFirebaseUser(profile);

    if (tokens.refresh_token) {
      await storeRefreshToken(firebaseUser.uid, tokens.refresh_token);
    } else if (!(await hasStoredRefreshToken(firebaseUser.uid))) {
      throw new HttpError(
        401,
        'reauth_required',
        'Google did not grant offline access. Please sign in again and re-approve access.'
      );
    }

    const customToken = await getAuth().createCustomToken(firebaseUser.uid);

    res.json({
      firebase_token: customToken,
      user: profile
    });
  } catch (error) {
    sendErrorResponse(error, req, res);
  }
});

app.post('/api/sessionLogin', authRateLimiter, async (req, res) => {
  sendNoStore(res);

  try {
    const idToken = parseIdToken(req.body);
    let decodedToken;

    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (error) {
      throw new HttpError(
        401,
        'invalid_id_token',
        'Could not establish a secure session.',
        error
      );
    }

    const sessionCookie = await getAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS
    });

    res.cookie(SESSION_COOKIE_NAME, sessionCookie, cookieOptions());
    res.json({
      authenticated: true,
      user: await getSessionUser(decodedToken.uid)
    });
  } catch (error) {
    clearSessionCookie(res);
    sendErrorResponse(error, req, res);
  }
});

app.get('/api/session', async (req, res) => {
  sendNoStore(res);

  try {
    const decodedSession = await maybeGetSession(req, res);
    if (!decodedSession?.uid) {
      res.json({ authenticated: false, user: null });
      return;
    }

    res.json({
      authenticated: true,
      user: await getSessionUser(decodedSession.uid)
    });
  } catch (error) {
    clearSessionCookie(res);
    sendErrorResponse(error, req, res);
  }
});

app.post('/api/sessionLogout', async (req, res) => {
  sendNoStore(res);

  try {
    const decodedSession = await maybeGetSession(req, res);
    if (decodedSession?.uid) {
      googleAccessTokenCache.delete(decodedSession.uid);
      await getAuth()
        .revokeRefreshTokens(decodedSession.uid)
        .catch(() => {});
    }
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) {
    clearSessionCookie(res);
    sendErrorResponse(error, req, res);
  }
});

app.post('/api/googleProxy', googleProxyRateLimiter, async (req, res) => {
  sendNoStore(res);

  try {
    const session = await requireSession(req, res);
    const proxyRequest = parseProxyRequest(req.body);
    const accessToken = await getGoogleAccessTokenForUser(session.uid);

    const upstreamResponse = await fetch(proxyRequest.url, {
      method: proxyRequest.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: proxyRequest.body,
      signal: AbortSignal.timeout(GOOGLE_PROXY_TIMEOUT_MS)
    });

    if (!upstreamResponse.ok) {
      throw await mapGoogleApiError(upstreamResponse);
    }

    const responseText = await upstreamResponse.text();
    if (!responseText) {
      res.status(upstreamResponse.status).end();
      return;
    }

    res
      .status(upstreamResponse.status)
      .type(
        upstreamResponse.headers.get('content-type') ||
          'application/json; charset=utf-8'
      )
      .send(responseText);
  } catch (error) {
    if (error instanceof HttpError && error.code === 'reauth_required') {
      clearSessionCookie(res);
    }
    sendErrorResponse(error, req, res);
  }
});

app.use(
  express.static(STATIC_DIR, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  })
);

function setSecurityHeaders(res) {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://accounts.google.com https://apis.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://accounts.google.com https://www.gstatic.com",
      "img-src 'self' blob: data: https://*.googleusercontent.com",
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://*.googleusercontent.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
      'frame-src https://accounts.google.com https://*.firebaseapp.com',
      "worker-src 'self' blob:"
    ].join('; ')
  );
}

app.get('{*path}', (_req, res) => {
  setSecurityHeaders(res);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

app.use((error, req, res, _next) => {
  sendNoStore(res);
  sendErrorResponse(error, req, res);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
