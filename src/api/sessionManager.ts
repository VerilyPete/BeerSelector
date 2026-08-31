import * as SecureStore from 'expo-secure-store';
import { SessionData, isSessionData } from '../types/api';
import { invalidateSessionCache } from './sessionCacheEpoch';

// Session storage key
const SESSION_STORAGE_KEY = 'beerknurd_session';

// Auth cookie values can exceed SecureStore's practical per-value limit, so
// they are encoded and split across immutable, generation-specific chunks.
// The active marker is switched only after every chunk is present. A separate
// registry records both committed and interrupted generations because
// SecureStore cannot enumerate keys during logout.
const AUTH_COOKIES_STORAGE_KEY = 'beerknurd_auth_cookies';
const AUTH_COOKIES_META_KEY = 'beerknurd_auth_cookies_meta';
const AUTH_COOKIES_GENERATIONS_KEY = 'beerknurd_auth_cookies_generations';
const AUTH_COOKIES_CHUNK_CHARS = 1500;
const AUTH_COOKIES_MAX_CHUNKS = 1000;
const AUTH_COOKIES_REGISTRY_MAX_CHARS = 1500;

type AuthCookieGeneration = {
  generation: string;
  count: number;
  /** True when this generation atomically commits its matching session too. */
  hasSession?: boolean;
};

export type StoredAuthCredentials = {
  cookiesJson: string | null;
  sessionJson: string | null;
};

type ParsedGenerationRegistry =
  | { status: 'missing'; entries: AuthCookieGeneration[] }
  | { status: 'valid'; entries: AuthCookieGeneration[] }
  | { status: 'malformed' };

let generationSequence = 0;
let authCookieMutation: Promise<void> = Promise.resolve();

const toBase64 = (value: string): string => btoa(unescape(encodeURIComponent(value)));

const fromBase64 = (encoded: string): string => decodeURIComponent(escape(atob(encoded)));

const chunkString = (value: string, size: number): string[] => {
  if (value.length === 0) return [''];
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.substring(i, i + size));
  }
  return chunks;
};

const isGeneration = (value: unknown): value is AuthCookieGeneration => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuthCookieGeneration>;
  return (
    typeof candidate.generation === 'string' &&
    /^[A-Za-z0-9_-]+$/.test(candidate.generation) &&
    Number.isInteger(candidate.count) &&
    (candidate.count ?? 0) > 0 &&
    (candidate.count ?? 0) <= AUTH_COOKIES_MAX_CHUNKS &&
    (candidate.hasSession === undefined || typeof candidate.hasSession === 'boolean')
  );
};

const parseGeneration = (value: string | null): AuthCookieGeneration | null => {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isGeneration(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const parseGenerationRegistry = (value: string | null): ParsedGenerationRegistry => {
  if (value === null) return { status: 'missing', entries: [] };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(isGeneration)) {
      return { status: 'malformed' };
    }

    const entries = parsed as AuthCookieGeneration[];
    if (new Set(entries.map(entry => entry.generation)).size !== entries.length) {
      return { status: 'malformed' };
    }
    return { status: 'valid', entries };
  } catch {
    return { status: 'malformed' };
  }
};

const generationKey = (generation: string, index: number): string =>
  `${AUTH_COOKIES_STORAGE_KEY}_${generation}_${index}`;

const generationSessionKey = (generation: string): string =>
  `${AUTH_COOKIES_STORAGE_KEY}_${generation}_session`;

const createGeneration = (): string => {
  generationSequence += 1;
  return `${Date.now().toString(36)}_${generationSequence.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

const enqueueAuthCookieMutation = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = authCookieMutation.then(operation, operation);
  authCookieMutation = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};

const deleteGeneration = async (entry: AuthCookieGeneration): Promise<Error[]> => {
  const errors: Error[] = [];
  for (let index = 0; index < entry.count; index += 1) {
    try {
      await SecureStore.deleteItemAsync(generationKey(entry.generation, index));
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  try {
    await SecureStore.deleteItemAsync(generationSessionKey(entry.generation));
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }
  return errors;
};

const saveAuthCookieGeneration = async (cookiesJson: string, sessionJson?: string): Promise<void> =>
  enqueueAuthCookieMutation(async () => {
    const chunks = chunkString(toBase64(cookiesJson), AUTH_COOKIES_CHUNK_CHARS);
    if (chunks.length > AUTH_COOKIES_MAX_CHUNKS) {
      throw new Error('Auth cookie payload exceeds the supported SecureStore chunk count');
    }

    try {
      const parsedRegistry = parseGenerationRegistry(
        await SecureStore.getItemAsync(AUTH_COOKIES_GENERATIONS_KEY)
      );
      if (parsedRegistry.status === 'malformed') {
        throw new Error('Auth cookie generation registry is malformed; refusing to overwrite it');
      }
      const registry = parsedRegistry.entries;
      const active = parseGeneration(await SecureStore.getItemAsync(AUTH_COOKIES_META_KEY));
      if (active && !registry.some(entry => entry.generation === active.generation)) {
        registry.push(active);
      }

      const knownIds = new Set(registry.map(entry => entry.generation));
      let nextGeneration = createGeneration();
      while (knownIds.has(nextGeneration)) nextGeneration = createGeneration();
      const next: AuthCookieGeneration = {
        generation: nextGeneration,
        count: chunks.length,
        ...(sessionJson === undefined ? {} : { hasSession: true }),
      };
      const known = [...registry, next];
      const serializedRegistry = JSON.stringify(known);
      if (serializedRegistry.length > AUTH_COOKIES_REGISTRY_MAX_CHARS) {
        throw new Error('Auth cookie generation registry is full; clear stored cookies and retry');
      }

      // Register before writing chunks so logout can clean an interrupted save.
      await SecureStore.setItemAsync(AUTH_COOKIES_GENERATIONS_KEY, serializedRegistry);

      for (let index = 0; index < chunks.length; index += 1) {
        await SecureStore.setItemAsync(generationKey(next.generation, index), chunks[index]);
      }

      if (sessionJson !== undefined) {
        await SecureStore.setItemAsync(generationSessionKey(next.generation), sessionJson);
      }

      // This single SecureStore value is the commit point. Readers continue to
      // use the previous cookie/session generation until this write succeeds.
      await SecureStore.setItemAsync(AUTH_COOKIES_META_KEY, JSON.stringify(next));

      if (sessionJson !== undefined) {
        // The marker made a different credential pair visible. Revoke cached
        // and in-flight reads before any post-login refresh can start.
        invalidateSessionCache();
      }

      if (sessionJson !== undefined) {
        try {
          await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
        } catch (error) {
          // Readers now follow the committed generation, so this stale
          // compatibility value is unreachable and logout will retry it.
          console.error('Failed to remove superseded standalone session value:', error);
        }
      }

      const failedCleanup: AuthCookieGeneration[] = [];
      for (const previous of known) {
        if (previous.generation === next.generation) continue;
        const errors = await deleteGeneration(previous);
        if (errors.length > 0) failedCleanup.push(previous);
      }

      try {
        await SecureStore.deleteItemAsync(AUTH_COOKIES_STORAGE_KEY);
      } catch (error) {
        console.error('Failed to remove legacy auth cookie value after commit:', error);
      }

      // Failed deletions remain registered so a later save or logout retries.
      try {
        await SecureStore.setItemAsync(
          AUTH_COOKIES_GENERATIONS_KEY,
          JSON.stringify([...failedCleanup, next])
        );
      } catch (error) {
        // The pre-commit registry still contains every generation, including
        // the new one, so cleanup knowledge is preserved for logout.
        console.error('Failed to compact auth cookie generation registry:', error);
      }
    } catch (error) {
      console.error('Error saving auth cookies:', error);
      throw error;
    }
  });

/** Save captured authentication cookies in atomically committed chunks. */
export const saveAuthCookies = async (cookiesJson: string): Promise<void> =>
  saveAuthCookieGeneration(cookiesJson);

/** Commit member cookies and their matching session behind one marker. */
export const saveAuthCredentials = async (
  cookiesJson: string,
  sessionData: SessionData
): Promise<void> => saveAuthCookieGeneration(cookiesJson, JSON.stringify(sessionData));

const readAuthCookies = async (strict = false): Promise<string | null> => {
  const marker = await SecureStore.getItemAsync(AUTH_COOKIES_META_KEY);
  if (marker === null) return null;
  const active = parseGeneration(marker);
  if (!active) {
    if (strict) throw new Error('Auth cookie commit marker is malformed');
    return null;
  }

  const chunks: string[] = [];
  for (let index = 0; index < active.count; index += 1) {
    const chunk = await SecureStore.getItemAsync(generationKey(active.generation, index));
    // Empty strings are valid stored values. SecureStore uses null—not an
    // empty string—to report a missing key.
    if (chunk === null) {
      if (strict) throw new Error('Auth cookie generation is incomplete');
      return null;
    }
    chunks.push(chunk);
  }
  return fromBase64(chunks.join(''));
};

/** Read only the generation named by the committed marker. */
export const getAuthCookies = async (
  options: { throwOnError?: boolean } = {}
): Promise<string | null> =>
  enqueueAuthCookieMutation(async () => {
    try {
      return await readAuthCookies(options.throwOnError);
    } catch (error) {
      console.error('Error getting auth cookies:', error);
      if (options.throwOnError) throw error;
      return null;
    }
  });

/** Remove every registered cookie generation, without short-circuiting. */
export const clearAuthCookies = async (): Promise<void> =>
  enqueueAuthCookieMutation(async () => {
    // A committed cookie generation may own the active session as well. Revoke
    // the process cache before deleting its marker or session value.
    invalidateSessionCache();
    const errors: Error[] = [];
    let registry: AuthCookieGeneration[] = [];
    let registryReadSucceeded = false;

    try {
      const parsedRegistry = parseGenerationRegistry(
        await SecureStore.getItemAsync(AUTH_COOKIES_GENERATIONS_KEY)
      );
      if (parsedRegistry.status === 'malformed') {
        // An unreadable registry cannot support a future cleanup retry. Record
        // the incomplete cleanup, but remove/replace the poisoned value below
        // so subsequent logout and login attempts can recover.
        registryReadSucceeded = true;
        errors.push(new Error('Auth cookie generation registry was malformed and has been reset'));
      } else {
        registry = parsedRegistry.entries;
        registryReadSucceeded = true;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    try {
      const active = parseGeneration(await SecureStore.getItemAsync(AUTH_COOKIES_META_KEY));
      if (active && !registry.some(entry => entry.generation === active.generation)) {
        registry.push(active);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    // Remove the commit marker first so no credential remains readable while
    // best-effort deletion continues.
    for (const key of [AUTH_COOKIES_META_KEY, AUTH_COOKIES_STORAGE_KEY]) {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    const failedGenerations: AuthCookieGeneration[] = [];
    for (const entry of registry) {
      const generationErrors = await deleteGeneration(entry);
      errors.push(...generationErrors);
      if (generationErrors.length > 0) failedGenerations.push(entry);
    }

    try {
      if (registryReadSucceeded) {
        if (failedGenerations.length > 0) {
          await SecureStore.setItemAsync(
            AUTH_COOKIES_GENERATIONS_KEY,
            JSON.stringify(failedGenerations)
          );
        } else {
          await SecureStore.deleteItemAsync(AUTH_COOKIES_GENERATIONS_KEY);
        }
      }
      // Otherwise preserve an unreadable registry: a transient keychain read
      // failure may succeed on retry. A successfully read but malformed value
      // is reset above because preserving it would permanently block all saves.
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }

    if (errors.length > 0) {
      console.error('Error clearing auth cookies:', errors[0]);
      throw errors[0];
    }
  });

/** Capture the exact credential pair so a multi-step login can roll it back. */
export const captureStoredAuthCredentials = async (): Promise<StoredAuthCredentials> => {
  return enqueueAuthCookieMutation(async () => {
    const cookiesJson = await readAuthCookies(true);
    const active = parseGeneration(await SecureStore.getItemAsync(AUTH_COOKIES_META_KEY));
    const sessionJson = active?.hasSession
      ? await SecureStore.getItemAsync(generationSessionKey(active.generation))
      : await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
    if (active?.hasSession && sessionJson === null) {
      throw new Error('Committed auth credential generation is missing its session');
    }
    return { cookiesJson, sessionJson };
  });
};

/** Restore both halves of a previously captured credential pair. */
export const restoreStoredAuthCredentials = async (
  snapshot: StoredAuthCredentials
): Promise<void> => {
  const errors: Error[] = [];

  try {
    if (snapshot.cookiesJson !== null && snapshot.sessionJson !== null) {
      await saveAuthCookieGeneration(snapshot.cookiesJson, snapshot.sessionJson);
    } else if (snapshot.cookiesJson === null) {
      await clearAuthCookies();
    } else {
      await saveAuthCookies(snapshot.cookiesJson);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }

  try {
    if (snapshot.cookiesJson !== null && snapshot.sessionJson !== null) {
      // The pair was already committed together above.
    } else if (snapshot.sessionJson === null) {
      await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    } else {
      await SecureStore.setItemAsync(SESSION_STORAGE_KEY, snapshot.sessionJson);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }

  if (errors.length > 0) {
    throw errors[0];
  }
};

/**
 * Saves session data to secure storage
 * @param sessionData The session data to save
 */
export const saveSessionData = async (sessionData: SessionData): Promise<void> => {
  try {
    await enqueueAuthCookieMutation(async () => {
      const serialized = JSON.stringify(sessionData);
      const active = parseGeneration(await SecureStore.getItemAsync(AUTH_COOKIES_META_KEY));
      if (active?.hasSession) {
        await SecureStore.setItemAsync(generationSessionKey(active.generation), serialized);
      } else {
        await SecureStore.setItemAsync(SESSION_STORAGE_KEY, serialized);
      }
    });
    invalidateSessionCache();
    console.log('Session data saved successfully');
  } catch (error) {
    console.error('Error saving session data:', error);
    throw error;
  }
};

/**
 * Gets session data from secure storage
 * @returns The session data if it exists, otherwise null
 */
export const getSessionData = async (): Promise<SessionData | null> => {
  try {
    const sessionDataStr = await enqueueAuthCookieMutation(async () => {
      const active = parseGeneration(await SecureStore.getItemAsync(AUTH_COOKIES_META_KEY));
      if (active?.hasSession) {
        return SecureStore.getItemAsync(generationSessionKey(active.generation));
      }
      return SecureStore.getItemAsync(SESSION_STORAGE_KEY);
    });
    if (!sessionDataStr) {
      return null;
    }

    const parsedData = JSON.parse(sessionDataStr);

    // Validate the session data using the type guard
    if (isSessionData(parsedData)) {
      return parsedData;
    } else {
      console.warn('Invalid session data format in storage');
      return null;
    }
  } catch (error) {
    // Handle locked device case gracefully - this is expected when app launches
    // from lock screen (e.g., via Live Activity tap) before device is unlocked
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('User interaction is not allowed')) {
      console.log('[SessionManager] Device locked, cannot access secure storage');
      return null;
    }
    console.error('Error getting session data:', error);
    return null;
  }
};

/**
 * Clears session data from secure storage
 */
export const clearSessionData = async (): Promise<void> => {
  try {
    // Revoke immediately, before waiting behind another SecureStore mutation.
    invalidateSessionCache();
    await enqueueAuthCookieMutation(async () => {
      const errors: Error[] = [];
      const active = parseGeneration(await SecureStore.getItemAsync(AUTH_COOKIES_META_KEY));
      for (const key of [
        SESSION_STORAGE_KEY,
        ...(active?.hasSession ? [generationSessionKey(active.generation)] : []),
      ]) {
        try {
          await SecureStore.deleteItemAsync(key);
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
      if (errors.length > 0) throw errors[0];
    });
    console.log('Session data cleared successfully');
  } catch (error) {
    console.error('Error clearing session data:', error);
    throw error;
  }
};

/**
 * Checks if a session exists
 * @returns True if a session exists, otherwise false
 */
export const hasSession = async (): Promise<boolean> => {
  try {
    const sessionData = await getSessionData();
    return !!sessionData;
  } catch (error) {
    console.error('Error checking session:', error);
    return false;
  }
};

/**
 * Parses cookies from set-cookie header
 * @param setCookieHeader The set-cookie header to parse
 * @returns An object with cookie name-value pairs
 */
export const parseCookies = (setCookieHeader: string): Record<string, string> => {
  const cookies: Record<string, string> = {};

  try {
    if (!setCookieHeader) {
      return cookies;
    }

    const cookieList = setCookieHeader.split(';');
    const mainCookie = cookieList[0];

    if (mainCookie) {
      const equalsIndex = mainCookie.indexOf('=');
      if (equalsIndex > 0) {
        const name = mainCookie.substring(0, equalsIndex).trim();
        const value = mainCookie.substring(equalsIndex + 1).trim();
        if (name && value) {
          cookies[name] = value;
        }
      }
    }

    // Also parse additional cookies in the header
    for (let i = 1; i < cookieList.length; i++) {
      const cookie = cookieList[i];
      const equalsIndex = cookie.indexOf('=');
      if (equalsIndex > 0) {
        const name = cookie.substring(0, equalsIndex).trim();
        const value = cookie.substring(equalsIndex + 1).trim();
        if (name && value) {
          cookies[name] = value;
        }
      }
    }
  } catch (error) {
    console.error('Error parsing cookies:', error);
  }

  return cookies;
};

/**
 * Extracts session data from response headers and cookies
 * @param headers The response headers
 * @param cookies The cookies from the response
 * @returns The extracted session data
 */
export const extractSessionDataFromResponse = (
  _headers: Headers,
  cookies: Record<string, string>
): Partial<SessionData> => {
  const sessionData: Partial<SessionData> = {};

  try {
    // Extract PHPSESSID
    if (cookies.PHPSESSID) {
      sessionData.sessionId = cookies.PHPSESSID;
    }

    // Extract other cookie values if they exist
    if (cookies.store__id) sessionData.storeId = cookies.store__id;

    // Safely decode URI components with error handling
    if (cookies.store_name) {
      try {
        sessionData.storeName = decodeURIComponent(cookies.store_name);
      } catch (e) {
        sessionData.storeName = cookies.store_name;
        console.warn('Failed to decode store_name cookie:', e);
      }
    }

    if (cookies.member_id) sessionData.memberId = cookies.member_id;

    if (cookies.username) {
      try {
        sessionData.username = decodeURIComponent(cookies.username);
      } catch (e) {
        sessionData.username = cookies.username;
        console.warn('Failed to decode username cookie:', e);
      }
    }

    if (cookies.first_name) {
      try {
        sessionData.firstName = decodeURIComponent(cookies.first_name);
      } catch (e) {
        sessionData.firstName = cookies.first_name;
        console.warn('Failed to decode first_name cookie:', e);
      }
    }

    if (cookies.last_name) {
      try {
        sessionData.lastName = decodeURIComponent(cookies.last_name);
      } catch (e) {
        sessionData.lastName = cookies.last_name;
        console.warn('Failed to decode last_name cookie:', e);
      }
    }

    if (cookies.email) {
      try {
        sessionData.email = decodeURIComponent(cookies.email);
      } catch (e) {
        sessionData.email = cookies.email;
        console.warn('Failed to decode email cookie:', e);
      }
    }

    if (cookies.cardNum) sessionData.cardNum = cookies.cardNum;
  } catch (error) {
    console.error('Error extracting session data from cookies:', error);
  }

  return sessionData;
};
