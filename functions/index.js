import { onRequest } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { OAuth2Client } from 'google-auth-library';

initializeApp();

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars');
  }
  return new OAuth2Client(clientId, clientSecret, 'postmessage');
}

// Step 1: Exchange Google auth code for tokens, store refresh token, return access token + Firebase custom token
export const exchangeCode = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const { code } = req.body || {};
    if (!code) { res.status(400).json({ error: 'Missing code' }); return; }

    try {
      const client = getOAuth2Client();
      const { tokens } = await client.getToken(code);

      if (!tokens.access_token) {
        res.status(500).json({ error: 'No access token from Google' });
        return;
      }

      // Get user info from the access token
      client.setCredentials(tokens);
      const userInfoRes = await client.request({
        url: 'https://www.googleapis.com/oauth2/v3/userinfo'
      });
      const userInfo = userInfoRes.data;

      // Create or get Firebase user
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

      // Store refresh token securely in Firestore
      if (tokens.refresh_token) {
        await getFirestore().collection('user_tokens').doc(firebaseUser.uid).set(
          { refresh_token: tokens.refresh_token, updated_at: new Date().toISOString() },
          { merge: true }
        );
      }

      // Create a Firebase custom token for the client
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
      console.error('Code exchange error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Code exchange failed' });
    }
  }
);

// Step 2: Refresh — client sends Firebase ID token, gets fresh Google access token
export const refreshGoogleToken = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

    const idToken = req.headers.authorization?.replace('Bearer ', '');
    if (!idToken) { res.status(401).json({ error: 'Missing authorization' }); return; }

    try {
      const decoded = await getAuth().verifyIdToken(idToken);
      const uid = decoded.uid;

      const doc = await getFirestore().collection('user_tokens').doc(uid).get();
      if (!doc.exists || !doc.data()?.refresh_token) {
        res.status(404).json({ error: 'no_refresh_token', message: 'Please sign in again.' });
        return;
      }

      const client = getOAuth2Client();
      client.setCredentials({ refresh_token: doc.data().refresh_token });
      const { credentials } = await client.refreshAccessToken();

      if (!credentials.access_token) {
        res.status(500).json({ error: 'Failed to refresh' });
        return;
      }

      // If Google returned a new refresh token, update it
      if (credentials.refresh_token) {
        await getFirestore().collection('user_tokens').doc(uid).set(
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
      console.error('Refresh error:', err);
      res.status(401).json({ error: err instanceof Error ? err.message : 'Refresh failed' });
    }
  }
);
