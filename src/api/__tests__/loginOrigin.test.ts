import { describe, it, expect, vi } from 'vitest';
import { getLoginOrigin, isTrustedLoginUrl, matchesExactPath } from '../loginOrigin';

// The login flow (kiosk, member-dash, visitor) all resolve under
// `config.api.baseUrl` — see `src/config/config.ts`'s `getFullUrl`, which
// builds every one of those endpoints from the same base. Mocking it here
// pins the "trusted" origin to a value distinct from any real Flying Saucer
// host, so a test that forgets to use it fails loudly instead of silently
// matching the real default.
vi.mock('@/src/config', () => ({
  config: {
    api: {
      baseUrl: 'https://login.example.test',
      endpoints: {
        memberDashboard: '/member-dash.php',
        visitor: '/visitor.php',
        kiosk: '/kiosk.php',
      },
    },
  },
}));

describe('getLoginOrigin', () => {
  it('returns the scheme+host of the configured login base URL', () => {
    expect(getLoginOrigin()).toBe('https://login.example.test');
  });
});

describe('isTrustedLoginUrl', () => {
  it('trusts a URL on the configured login origin', () => {
    expect(isTrustedLoginUrl('https://login.example.test/member-dash.php')).toBe(true);
  });

  it('trusts any path on the configured origin, not just known endpoints', () => {
    expect(isTrustedLoginUrl('https://login.example.test/some/redirect/step')).toBe(true);
  });

  it('rejects a different host entirely', () => {
    expect(isTrustedLoginUrl('https://evil.example/member-dash.php')).toBe(false);
  });

  it('rejects a subdomain of the trusted host', () => {
    // The origin whitelist used to be a wildcard (`https://*.beerknurd.com`);
    // the app-side check must not repeat that mistake by treating subdomains
    // as trusted by default.
    expect(isTrustedLoginUrl('https://evil.login.example.test/member-dash.php')).toBe(false);
  });

  it('rejects a host that merely starts with the trusted origin as a string', () => {
    expect(isTrustedLoginUrl('https://login.example.test.evil.example/member-dash.php')).toBe(
      false
    );
  });

  it('rejects http where the trusted origin is https', () => {
    expect(isTrustedLoginUrl('http://login.example.test/member-dash.php')).toBe(false);
  });

  it('rejects a mismatched port', () => {
    expect(isTrustedLoginUrl('https://login.example.test:8443/member-dash.php')).toBe(false);
  });

  it('rejects malformed URLs instead of throwing', () => {
    expect(isTrustedLoginUrl('not a url')).toBe(false);
  });

  it('rejects empty, null, and undefined', () => {
    expect(isTrustedLoginUrl('')).toBe(false);
    expect(isTrustedLoginUrl(null)).toBe(false);
    expect(isTrustedLoginUrl(undefined)).toBe(false);
  });
});

describe('matchesExactPath', () => {
  it('matches the trusted origin with the exact path', () => {
    expect(matchesExactPath('https://login.example.test/member-dash.php', '/member-dash.php')).toBe(
      true
    );
  });

  it('rejects the substring-bypass shape: the path only appears in the query string', () => {
    // This is the vulnerability the exact-path check replaces: the previous
    // gate was `url.includes('member-dash.php')`, which a URL like this
    // would satisfy.
    expect(
      matchesExactPath('https://login.example.test/x?q=member-dash.php', '/member-dash.php')
    ).toBe(false);
  });

  it('rejects a path that is merely prefixed by the expected path', () => {
    expect(
      matchesExactPath('https://login.example.test/member-dash.php-evil', '/member-dash.php')
    ).toBe(false);
  });

  it('rejects the exact path on an untrusted origin', () => {
    expect(matchesExactPath('https://evil.example/member-dash.php', '/member-dash.php')).toBe(
      false
    );
  });

  it('rejects malformed URLs instead of throwing', () => {
    expect(matchesExactPath('not a url', '/member-dash.php')).toBe(false);
  });
});
