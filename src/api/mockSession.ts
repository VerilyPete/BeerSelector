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
    memberId: '999999',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    cardNum: '0000',
    sessionId: 'mocksession00000000000000'
  };

  // Save the mock session
  await saveSessionData(mockSession);
  console.log('Mock session created and saved');
}; 