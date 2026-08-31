import { ApiClient } from './apiClient';
import { invalidateSessionCache } from './sessionCacheEpoch';

let apiClientInstance: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    apiClientInstance = ApiClient.getInstance();
  }
  return apiClientInstance;
}

export function clearApiClientSessionCache(): void {
  if (apiClientInstance) {
    apiClientInstance.clearSessionCache();
  } else {
    // ApiClient.getInstance() is also used directly by beerService. Advance the
    // shared epoch even if this wrapper has not retained that singleton yet.
    invalidateSessionCache();
  }
}
