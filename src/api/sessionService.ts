import { getSessionData, saveSessionData } from './sessionManager';
import { getApiClient } from './apiClientInstance';
import { validateSession } from './sessionValidator';
import { SessionData } from '../types/api';

export async function refreshSession(): Promise<SessionData | null> {
  try {
    const apiClient = getApiClient();
    const response = await apiClient.post<{ success: boolean; session: SessionData }>('/auto-login.php', {});

    if (!response.success) return null;

    if (response.data.success && response.data.session) {
      await saveSessionData(response.data.session);
      return await validateSession(response.data.session);
    }
    return null;
  } catch (error) {
    console.error('Error refreshing session:', error);
    return null;
  }
}

export async function getValidSession(): Promise<SessionData | null> {
  try {
    const sessionData = await getSessionData();
    const validatedSession = await validateSession(sessionData);
    
    if (!validatedSession) {
      console.log('Session invalid or missing, attempting refresh');
      return await refreshSession();
    }
    
    return validatedSession;
  } catch (error) {
    console.error('Error getting valid session:', error);
    return null;
  }
} 