import crypto from 'crypto';

/**
 * Popup-mode GIS OAuth: Google recommends verifying X-Requested-With on the
 * request that posts the authorization code to the backend.
 * @param {import('express').Request} req
 */
export function isValidPopupCsrfRequest(req) {
  const raw = req.get('x-requested-with');
  return Boolean(raw && raw.toLowerCase() === 'xmlhttprequest');
}

/**
 * @param {unknown} body
 * @returns {{ code: string; state: string } | { error: { status: number; code: string; message: string } }}
 */
export function parseAuthorizationExchange(body) {
  const code = body?.code;
  if (typeof code !== 'string' || !code.trim()) {
    return {
      error: {
        status: 400,
        code: 'missing_code',
        message: 'Missing Google authorization code.'
      }
    };
  }
  const state = body?.state;
  if (typeof state !== 'string' || !state.trim()) {
    return {
      error: {
        status: 400,
        code: 'missing_state',
        message: 'Missing OAuth state. Please start sign-in again.'
      }
    };
  }
  return { code: code.trim(), state: state.trim() };
}

/**
 * @param {string | null | undefined} cookieValue
 * @param {string} bodyState
 */
export function constantTimeStateMatch(cookieValue, bodyState) {
  if (typeof cookieValue !== 'string' || !cookieValue) {
    return false;
  }
  const a = Buffer.from(cookieValue, 'utf8');
  const b = Buffer.from(bodyState, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
