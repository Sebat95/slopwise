import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { OAuth2Client } from 'google-auth-library';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = path.join(__dirname, 'public');
const PORT = parseInt(process.env.PORT || '8080', 10);

// Firebase Admin init — on Cloud Run, default credentials are auto-detected
initializeApp();

function getOAuth2Client() {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.VITE_GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_CLIENT_SECRET');
  }
  return new OAuth2Client(clientId, clientSecret, 'postmessage');
}

const app = express();
app.use(express.json());

// --- API: Exchange Google auth code for tokens ---
app.post('/api/exchangeCode', async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      return res.status(500).json({ error: 'No access token from Google' });
    }

    client.setCredentials(tokens);
    const userInfoRes = await client.request({
      url: 'https://www.googleapis.com/oauth2/v3/userinfo'
    });
    const userInfo = userInfoRes.data;

    let firebaseUser;
    try {
      firebaseUser = await getAuth().getUserByEmail(userInfo.email);
    } catch {
      firebaseUser = await getAuth().createUser({
        email: userInfo.email,
        displayName: userInfo.name,
        photoURL: userInfo.picture
      });
    }

    if (tokens.refresh_token) {
      await getFirestore().collection('user_tokens').doc(firebaseUser.uid).set(
        { refresh_token: tokens.refresh_token, updated_at: new Date().toISOString() },
        { merge: true }
      );
    }

    const customToken = await getAuth().createCustomToken(firebaseUser.uid);

    res.json({
      access_token: tokens.access_token,
      expires_in: tokens.expiry_date
        ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
        : 3600,
      firebase_token: customToken,
      user: {
        name: userInfo.name || '',
        email: userInfo.email || '',
        picture: userInfo.picture || ''
      }
    });
  } catch (err) {
    console.error('exchangeCode error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Exchange failed' });
  }
});

// --- API: Refresh Google access token silently ---
app.post('/api/refreshGoogleToken', async (req, res) => {
  const idToken = req.headers.authorization?.replace('Bearer ', '');
  if (!idToken) return res.status(401).json({ error: 'Missing authorization' });

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    const doc = await getFirestore().collection('user_tokens').doc(decoded.uid).get();

    if (!doc.exists || !doc.data()?.refresh_token) {
      return res.status(404).json({ error: 'no_refresh_token', message: 'Please sign in again.' });
    }

    const client = getOAuth2Client();
    client.setCredentials({ refresh_token: doc.data().refresh_token });
    const { credentials } = await client.refreshAccessToken();

    if (!credentials.access_token) {
      return res.status(500).json({ error: 'Failed to refresh' });
    }

    if (credentials.refresh_token) {
      await getFirestore().collection('user_tokens').doc(decoded.uid).set(
        { refresh_token: credentials.refresh_token, updated_at: new Date().toISOString() },
        { merge: true }
      );
    }

    res.json({
      access_token: credentials.access_token,
      expires_in: credentials.expiry_date
        ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
        : 3600
    });
  } catch (err) {
    console.error('refreshGoogleToken error:', err);
    res.status(401).json({ error: err instanceof Error ? err.message : 'Refresh failed' });
  }
});

// --- Static file serving (SPA) ---
app.use(express.static(STATIC_DIR, {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));

// CSP and security headers for HTML responses
function setSecurityHeaders(res) {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://accounts.google.com https://apis.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://accounts.google.com https://www.gstatic.com",
      "img-src 'self' blob: data: https://*.googleusercontent.com",
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://sheets.googleapis.com https://*.googleusercontent.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
      "frame-src https://accounts.google.com https://*.firebaseapp.com",
      "worker-src 'self' blob:"
    ].join('; ')
  );
}

app.get('*', (_req, res) => {
  setSecurityHeaders(res);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
