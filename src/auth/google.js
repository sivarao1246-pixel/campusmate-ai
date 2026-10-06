// Google Identity Services (GIS) OAuth helper.
// Tokens are kept only in sessionStorage and are never written to localStorage.
let tokenClient = null;
let tokenClientScopes = [];
let accessToken = null;
let grantedScopes = new Set();
let tokenExpiresAt = 0;

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GIS_TIMEOUT_MS = 15000;

function normalizeScopes(scopes) {
  return [...new Set((Array.isArray(scopes) ? scopes : [scopes]).filter(Boolean))];
}

function readSavedAuth() {
  try {
    const savedScopes = JSON.parse(sessionStorage.getItem('google_scopes') || '[]');
    grantedScopes = new Set(Array.isArray(savedScopes) ? savedScopes : []);
  } catch {
    grantedScopes = new Set();
  }

  accessToken = sessionStorage.getItem('google_access_token') || null;
  tokenExpiresAt = Number(sessionStorage.getItem('google_token_expires_at') || 0);
}

function persistAuth(token, scopes, expiresIn) {
  accessToken = token;
  scopes.forEach(scope => grantedScopes.add(scope));
  const expiresAt = Date.now() + Math.max(0, Number(expiresIn || 3600) - 60) * 1000;

  sessionStorage.setItem('google_access_token', token);
  sessionStorage.setItem('google_scopes', JSON.stringify([...grantedScopes]));
  sessionStorage.setItem('google_token_expires_at', String(expiresAt));
  tokenExpiresAt = expiresAt;
}

function clearSavedAuth() {
  accessToken = null;
  tokenExpiresAt = 0;
  grantedScopes = new Set();
  tokenClient = null;
  tokenClientScopes = [];
  sessionStorage.removeItem('google_access_token');
  sessionStorage.removeItem('google_scopes');
  sessionStorage.removeItem('google_token_expires_at');
}

function initTokenClient(scopes) {
  if (!CLIENT_ID || CLIENT_ID === 'YOUR_CLIENT_ID.apps.googleusercontent.com') {
    throw new Error('Google Client ID is not configured. Add VITE_GOOGLE_CLIENT_ID to your .env file.');
  }

  if (!window.google?.accounts?.oauth2) return null;

  tokenClientScopes = normalizeScopes(scopes);
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: tokenClientScopes.join(' '),
    prompt: '',
    callback: () => {},
  });
  return tokenClient;
}

async function waitForGIS() {
  if (window.google?.accounts?.oauth2) return;

  const started = Date.now();
  await new Promise((resolve, reject) => {
    const check = () => {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - started >= GIS_TIMEOUT_MS) {
        reject(new Error('Google Sign-In could not be loaded. Check your internet connection and try again.'));
        return;
      }
      window.setTimeout(check, 100);
    };
    check();
  });
}

export async function ensureToken(scopes) {
  const needed = normalizeScopes(scopes);
  if (!needed.length) throw new Error('No Google OAuth scopes were requested.');

  readSavedAuth();

  const validSavedToken = accessToken && tokenExpiresAt > Date.now() && needed.every(scope => grantedScopes.has(scope));
  if (validSavedToken) return accessToken;

  await waitForGIS();

  const sameClient = tokenClient && needed.every(scope => tokenClientScopes.includes(scope));
  if (!sameClient) initTokenClient(needed);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const timeout = window.setTimeout(() => {
      finish(reject, new Error('Google Sign-In timed out. Please try again.'));
    }, GIS_TIMEOUT_MS);

    tokenClient.callback = response => {
      window.clearTimeout(timeout);
      if (!response || response.error) {
        finish(reject, new Error(response?.error_description || response?.error || 'Google authorization failed.'));
        return;
      }
      persistAuth(response.access_token, needed, response.expires_in);
      finish(resolve, accessToken);
    };

    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (error) {
      window.clearTimeout(timeout);
      finish(reject, error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export function getAccessTokenSync() {
  readSavedAuth();
  return accessToken && tokenExpiresAt > Date.now() ? accessToken : null;
}

export function revokeToken() {
  const token = getAccessTokenSync();
  if (!token) {
    clearSavedAuth();
    return;
  }

  if (window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => clearSavedAuth());
  } else {
    clearSavedAuth();
  }
}

export const SCOPES = {
  calendar: [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly'
  ],
  gmail: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send'
  ],
  tasks: ['https://www.googleapis.com/auth/tasks']
};
