import * as SecureStore from 'expo-secure-store';
import { saveSessionData, getSessionData, clearSessionData } from '../sessionManager';
import { SessionData } from '../../types/api';

// Mock SecureStore
jest.mock('expo-secure-store');

describe('sessionManager', () => {
  const mockSessionData: SessionData = {
    memberId: 'test-member-id',
    storeId: 'test-store-id',
    storeName: 'Test Store',
    sessionId: 'test-session-id',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    cardNum: '12345'
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('saveSessionData', () => {
    it('should save session data to secure storage', async () => {
      await saveSessionData(mockSessionData);
      
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'session_data',
        JSON.stringify(mockSessionData)
      );
    });
    
    it('should handle errors when saving session data', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('Storage error'));
      
      await expect(saveSessionData(mockSessionData)).resolves.not.toThrow();
      expect(console.error).toHaveBeenCalled();
    });
  });
  
  describe('getSessionData', () => {
    it('should retrieve session data from secure storage', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(mockSessionData));
      
      const result = await getSessionData();
      
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('session_data');
      expect(result).toEqual(mockSessionData);
    });
    
    it('should return null if no session data exists', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      
      const result = await getSessionData();
      
      expect(result).toBeNull();
    });
    
    it('should validate session data using type guard', async () => {
      // Invalid session data missing required fields
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify({
        username: 'testuser'
      }));
      
      const result = await getSessionData();
      
      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalled();
    });
    
    it('should handle JSON parsing errors', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('invalid-json');
      
      const result = await getSessionData();
      
      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });
  
  describe('clearSessionData', () => {
    it('should clear session data from secure storage', async () => {
      await clearSessionData();
      
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('session_data');
    });
    
    it('should handle errors when clearing session data', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValue(new Error('Storage error'));
      
      await expect(clearSessionData()).resolves.not.toThrow();
      expect(console.error).toHaveBeenCalled();
    });
  });
});
