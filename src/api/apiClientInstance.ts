import { ApiClient } from './apiClient';

let apiClientInstance: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (!apiClientInstance) {
    apiClientInstance = ApiClient.getInstance();
  }
  return apiClientInstance;
} 