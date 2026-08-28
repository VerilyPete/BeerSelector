import { saveSessionData } from './sessionManager';
import { SessionData } from '../types/api';

/**
 * Creates and saves a mock session for testing
 * Note: This is for development purposes only and should be removed in production
 *
 * All values are fake. Never put real credentials or personal data here —
 * this file is committed to the repository.
 */
export const createMockSession = async (): Promise<void> => {
  const mockSession: SessionData = {
    storeId: '13879',
    storeName: 'Sugar Land',
    memberId: '999999',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    cardNum: '0000',
    sessionId: 'mocksession000000000000000000'
  };

  // Save the mock session
  await saveSessionData(mockSession);
  console.log('Mock session created and saved');
};
