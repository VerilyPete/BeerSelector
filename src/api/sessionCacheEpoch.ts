let sessionCacheEpoch = 0;

/** Return the process-wide version of persisted authentication state. */
export const getSessionCacheEpoch = (): number => sessionCacheEpoch;

/**
 * Revoke every ApiClient session read started against the previous credentials.
 *
 * This module deliberately has no dependency on ApiClient or sessionManager so
 * both sides of the storage/client boundary can use it without an import cycle.
 */
export const invalidateSessionCache = (): number => {
  sessionCacheEpoch += 1;
  return sessionCacheEpoch;
};
