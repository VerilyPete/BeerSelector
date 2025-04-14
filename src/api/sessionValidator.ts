import { SessionData, getSessionData } from './sessionManager';

export async function validateSession(sessionData: SessionData | null): Promise<SessionData | null> {
  if (!sessionData || !sessionData.memberId || !sessionData.storeId || !sessionData.storeName || !sessionData.sessionId) {
    return null;
  }
  return sessionData;
}

export async function getCurrentSession(): Promise<SessionData | null> {
  try {
    const sessionData = await getSessionData();
    return await validateSession(sessionData);
  } catch (error) {
    console.error('Error getting current session:', error);
    return null;
  }
} 