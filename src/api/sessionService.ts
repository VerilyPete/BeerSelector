import { getSessionData, saveSessionData } from './sessionManager';
import { getApiClient } from './apiClientInstance';
import { validateSession } from './sessionValidator';
import { SessionData } from '../types/api';

export async function refreshSession(): Promise<SessionData | null> {
  try {
    const apiClient = getApiClient();
    const response = await apiClient.post('/auto-login.php', {});
    const data = response.data as any;
    
    if (data.success) {
      const sessionData = data.session;
      await saveSessionData(sessionData);
      return await validateSession(sessionData);
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