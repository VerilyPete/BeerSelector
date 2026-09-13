import { config } from '@/src/config';

/**
 * Origin trust for the Flying Saucer login WebView.
 *
 * `kiosk`, `member-dash` and `visitor` all resolve under `config.api.baseUrl`
 * (see `getFullUrl` in `src/config/config.ts`), so that base URL's origin is
 * the one host the login flow ever legitimately navigates. This module is
 * the single place that origin is derived and compared, so the WebView's
 * `originWhitelist` and the message handler's trust decision cannot drift
 * apart from each other or from config.
 *
 * Deliberately uses the `URL` API for every comparison rather than string
 * matching: `URL#origin` normalises scheme, host and port and compares them
 * exactly, which is what closes both the subdomain gap in the old
 * `https://*.beerknurd.com` whitelist and the substring gap in the old
 * `url.includes('member-dash.php')` checks (a prefix or suffix match, or an
 * occurrence inside a query string, is not an equal `URL#origin` or
 * `URL#pathname`).
 */

export function getLoginOrigin(): string {
  return new URL(config.api.baseUrl).origin;
}

/**
 * True when `url` is on the trusted login origin (scheme + host + port).
 *
 * This is the check that belongs on `event.nativeEvent.url` — the URL the
 * WebView itself reports the message's frame as being on — never on a
 * page-supplied `data.url`, which a hostile page can set to anything.
 */
export function isTrustedLoginUrl(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    return new URL(url).origin === getLoginOrigin();
  } catch {
    return false;
  }
}

/**
 * True when `url` is on the trusted login origin AND its path is exactly
 * `path` (not merely containing it, prefixed by it, or suffixed by it).
 */
export function matchesExactPath(url: string, path: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === getLoginOrigin() && parsed.pathname === path;
  } catch {
    return false;
  }
}
