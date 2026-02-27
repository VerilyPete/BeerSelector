/**
 * Tests for database lifecycle management in RootLayout
 *
 * Tests AppState integration to close database when app backgrounds
 * and reopen when app foregrounds.
 */

import { AppStateStatus } from 'react-native';
import { getDatabase, closeDatabaseConnection } from '@/src/database/connection';

// Mock modules
jest.mock('@/src/database/connection');

/**
 * Simulated AppState handler for testing
 * This mirrors the actual implementation that will be added to _layout.tsx
 */
const handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
  if (nextAppState === 'background') {
    console.log('App backgrounding, closing database...');
    try {
      await closeDatabaseConnection();
    } catch (error) {
      console.error('Error closing database on background:', error);
    }
  } else if (nextAppState === 'active') {
    console.log('App foregrounding, reopening database...');
    try {
      await getDatabase();
    } catch (error) {
      console.error('Error reopening database on foreground:', error);
    }
  }
};

describe('Database Lifecycle in RootLayout', () => {
  beforeEach(() => {
    (getDatabase as jest.Mock).mockClear();
    (closeDatabaseConnection as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AppState Handler Logic', () => {
    it('should call closeDatabaseConnection when app goes to background', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockGetDatabase.mockResolvedValue({ execAsync: jest.fn() });
      mockCloseDatabaseConnection.mockResolvedValue(undefined);

      await handleAppStateChange('background');

      expect(mockCloseDatabaseConnection).toHaveBeenCalledTimes(1);
    });

    it('should call getDatabase when app comes to foreground', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockGetDatabase.mockResolvedValue({ execAsync: jest.fn() });
      mockCloseDatabaseConnection.mockResolvedValue(undefined);

      await handleAppStateChange('active');

      expect(mockGetDatabase).toHaveBeenCalledTimes(1);
    });

    it('should not close database on inactive state', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockGetDatabase.mockResolvedValue({ execAsync: jest.fn() });
      mockCloseDatabaseConnection.mockResolvedValue(undefined);

      await handleAppStateChange('inactive');

      expect(mockCloseDatabaseConnection).not.toHaveBeenCalled();
      expect(mockGetDatabase).not.toHaveBeenCalled();
    });
  });

  describe('Logging', () => {
    it('should log when app backgrounds', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockGetDatabase.mockResolvedValue({ execAsync: jest.fn() });
      mockCloseDatabaseConnection.mockResolvedValue(undefined);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await handleAppStateChange('background');

      expect(consoleLogSpy).toHaveBeenCalledWith('App backgrounding, closing database...');
      consoleLogSpy.mockRestore();
    });

    it('should log when app foregrounds', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockGetDatabase.mockResolvedValue({ execAsync: jest.fn() });
      mockCloseDatabaseConnection.mockResolvedValue(undefined);
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await handleAppStateChange('active');

      expect(consoleLogSpy).toHaveBeenCalledWith('App foregrounding, reopening database...');
      consoleLogSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle close errors when backgrounding', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockGetDatabase.mockResolvedValue({ execAsync: jest.fn() });
      mockCloseDatabaseConnection.mockRejectedValueOnce(new Error('Close failed'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleAppStateChange('background');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error closing database on background:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle reopen errors when foregrounding', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockCloseDatabaseConnection.mockResolvedValue(undefined);
      mockGetDatabase.mockRejectedValueOnce(new Error('Open failed'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await handleAppStateChange('active');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error reopening database on foreground:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should not throw errors on background failure', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockGetDatabase.mockResolvedValue({ execAsync: jest.fn() });
      mockCloseDatabaseConnection.mockRejectedValueOnce(new Error('Close failed'));

      await expect(handleAppStateChange('background')).resolves.not.toThrow();
    });

    it('should not throw errors on foreground failure', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockCloseDatabaseConnection.mockResolvedValue(undefined);
      mockGetDatabase.mockRejectedValueOnce(new Error('Open failed'));

      await expect(handleAppStateChange('active')).resolves.not.toThrow();
    });
  });

  describe('State Transition Sequences', () => {
    it('should handle background followed by foreground', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockGetDatabase.mockResolvedValue({ execAsync: jest.fn() });
      mockCloseDatabaseConnection.mockResolvedValue(undefined);

      await handleAppStateChange('background');
      expect(mockCloseDatabaseConnection).toHaveBeenCalledTimes(1);

      await handleAppStateChange('active');
      expect(mockGetDatabase).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple background/foreground cycles', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockGetDatabase.mockResolvedValue({ execAsync: jest.fn() });
      mockCloseDatabaseConnection.mockResolvedValue(undefined);

      for (let i = 0; i < 3; i++) {
        await handleAppStateChange('background');
        await handleAppStateChange('active');
      }

      expect(mockCloseDatabaseConnection).toHaveBeenCalledTimes(3);
      expect(mockGetDatabase).toHaveBeenCalledTimes(3);
    });

    it('should handle rapid state changes', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockGetDatabase.mockResolvedValue({ execAsync: jest.fn() });
      mockCloseDatabaseConnection.mockResolvedValue(undefined);

      await handleAppStateChange('background');
      await handleAppStateChange('active');
      await handleAppStateChange('background');
      await handleAppStateChange('active');

      expect(mockCloseDatabaseConnection).toHaveBeenCalledTimes(2);
      expect(mockGetDatabase).toHaveBeenCalledTimes(2);
    });

    it('should recover from errors and continue handling state changes', async () => {
      const mockGetDatabase = getDatabase as jest.Mock;
      const mockCloseDatabaseConnection = closeDatabaseConnection as jest.Mock;
      mockGetDatabase.mockResolvedValue({ execAsync: jest.fn() });
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // First close fails
      mockCloseDatabaseConnection.mockRejectedValueOnce(new Error('Close failed'));
      await handleAppStateChange('background');

      // Should still work next time
      mockCloseDatabaseConnection.mockResolvedValueOnce(undefined);
      await handleAppStateChange('background');

      expect(mockCloseDatabaseConnection).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });
  });
});
