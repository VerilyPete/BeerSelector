import { saveSessionData, SessionData } from './sessionManager';

/**
 * Creates and saves a mock session for testing
 * Note: This is for development purposes only and should be removed in production
 */
export const createMockSession = async (): Promise<void> => {
  // Mock session data based on the cURL example
  const mockSession: SessionData = {
    storeId: '13879',
    storeName: 'Sugar Land',
    memberId: '484587',
    username: 'Petro',
    firstName: 'Peter',
    lastName: 'Hollmer',
    email: 'pete@verily.org',
    cardNum: '4239',
    sessionId: 'mefvcm585nkqj9rr99eiupobj4'
  };

  // Save the mock session
  await saveSessionData(mockSession);
  console.log('Mock session created and saved');
}; 