import { describe, it, expect } from 'vitest';
import {
  constantTimeStateMatch,
  isValidPopupCsrfRequest,
  parseAuthorizationExchange
} from './oauth-csrf.js';

function mockReq(headerValue) {
  return {
    get(name) {
      if (name.toLowerCase() === 'x-requested-with') {
        return headerValue;
      }
      return undefined;
    }
  };
}

describe('isValidPopupCsrfRequest', () => {
  it('accepts XmlHttpRequest casing from Google docs', () => {
    expect(isValidPopupCsrfRequest(mockReq('XmlHttpRequest'))).toBe(true);
  });

  it('accepts lowercase', () => {
    expect(isValidPopupCsrfRequest(mockReq('xmlhttprequest'))).toBe(true);
  });

  it('rejects missing header', () => {
    expect(isValidPopupCsrfRequest(mockReq(undefined))).toBe(false);
  });

  it('rejects wrong value', () => {
    expect(isValidPopupCsrfRequest(mockReq('fetch'))).toBe(false);
  });
});

describe('parseAuthorizationExchange', () => {
  it('returns code and state when valid', () => {
    const r = parseAuthorizationExchange({ code: ' abc ', state: ' st ' });
    expect('error' in r).toBe(false);
    expect(r).toEqual({ code: 'abc', state: 'st' });
  });

  it('returns missing_code', () => {
    const r = parseAuthorizationExchange({ state: 'x' });
    expect(r).toMatchObject({ error: { code: 'missing_code' } });
  });

  it('returns missing_state', () => {
    const r = parseAuthorizationExchange({ code: 'x' });
    expect(r).toMatchObject({ error: { code: 'missing_state' } });
  });
});

describe('constantTimeStateMatch', () => {
  it('matches equal strings', () => {
    expect(constantTimeStateMatch('abc', 'abc')).toBe(true);
  });

  it('rejects length mismatch', () => {
    expect(constantTimeStateMatch('ab', 'abc')).toBe(false);
  });

  it('rejects missing cookie', () => {
    expect(constantTimeStateMatch(null, 'abc')).toBe(false);
    expect(constantTimeStateMatch('', 'abc')).toBe(false);
  });
});
