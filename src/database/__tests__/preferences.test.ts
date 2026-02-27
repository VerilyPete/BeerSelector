import { getPreference, setPreference, getAllPreferences } from '../preferences';
import { Preference } from '../../types/database';
import * as connection from '../connection';

// Mock the connection module
jest.mock('../connection');

type MockDatabase = {
  runAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  getAllAsync: jest.Mock;
};

function createMockPreferencesDb() {
  const mockRunAsync = jest.fn().mockResolvedValue({ rowsAffected: 1 });
  const mockGetFirstAsync = jest.fn();
  const mockGetAllAsync = jest.fn();
  const mockDatabase: MockDatabase = {
    runAsync: mockRunAsync,
    getFirstAsync: mockGetFirstAsync,
    getAllAsync: mockGetAllAsync,
  };
  return { mockDatabase, mockRunAsync, mockGetFirstAsync, mockGetAllAsync };
}

describe('Preference Functions', () => {
  describe('getPreference', () => {
    it('should return preference value when it exists', async () => {
      const { mockDatabase, mockGetFirstAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockGetFirstAsync.mockResolvedValue({ value: 'test_value' });

      const result = await getPreference('test_key');

      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT value FROM preferences WHERE key = ?',
        ['test_key']
      );
      expect(result).toBe('test_value');
    });

    it('should return null when preference does not exist', async () => {
      const { mockDatabase, mockGetFirstAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockGetFirstAsync.mockResolvedValue(null);

      const result = await getPreference('nonexistent_key');

      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT value FROM preferences WHERE key = ?',
        ['nonexistent_key']
      );
      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      const { mockDatabase, mockGetFirstAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockGetFirstAsync.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await getPreference('error_key');

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error getting preference error_key:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });

    it('should handle empty string key', async () => {
      const { mockDatabase, mockGetFirstAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockGetFirstAsync.mockResolvedValue({ value: 'empty_key_value' });

      const result = await getPreference('');

      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT value FROM preferences WHERE key = ?',
        ['']
      );
      expect(result).toBe('empty_key_value');
    });

    it('should handle special characters in key', async () => {
      const { mockDatabase, mockGetFirstAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const specialKey = "test'key\"with\\special";
      mockGetFirstAsync.mockResolvedValue({ value: 'special_value' });

      const result = await getPreference(specialKey);

      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT value FROM preferences WHERE key = ?',
        [specialKey]
      );
      expect(result).toBe('special_value');
    });
  });

  describe('setPreference', () => {
    it('should insert new preference with description', async () => {
      const { mockDatabase } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

      await setPreference('new_key', 'new_value', 'Test description');

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['new_key', 'new_value', 'Test description']
      );
    });

    it('should update existing preference value and preserve description', async () => {
      const { mockDatabase, mockGetFirstAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockGetFirstAsync.mockResolvedValue({ description: 'Existing description' });

      await setPreference('existing_key', 'updated_value');

      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT description FROM preferences WHERE key = ?',
        ['existing_key']
      );
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['existing_key', 'updated_value', 'Existing description']
      );
    });

    it('should set empty description when updating non-existent preference without description', async () => {
      const { mockDatabase, mockGetFirstAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockGetFirstAsync.mockResolvedValue(null);

      await setPreference('new_key', 'new_value');

      expect(mockDatabase.getFirstAsync).toHaveBeenCalledWith(
        'SELECT description FROM preferences WHERE key = ?',
        ['new_key']
      );
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['new_key', 'new_value', '']
      );
    });

    it('should handle empty string value', async () => {
      const { mockDatabase } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

      await setPreference('empty_key', '', 'Empty value');

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['empty_key', '', 'Empty value']
      );
    });

    it('should handle special characters in value', async () => {
      const { mockDatabase } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const specialValue = "value'with\"special\\chars";

      await setPreference('special_key', specialValue, 'Special chars test');

      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['special_key', specialValue, 'Special chars test']
      );
    });

    it('should throw error when database operation fails', async () => {
      const { mockDatabase, mockRunAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const dbError = new Error('Database write error');
      mockRunAsync.mockRejectedValue(dbError);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      await expect(setPreference('error_key', 'error_value', 'Error test')).rejects.toThrow(
        'Database write error'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error setting preference error_key:',
        dbError
      );
      consoleErrorSpy.mockRestore();
    });

    it('should handle description update when providing new description', async () => {
      const { mockDatabase } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

      // When description is provided, should not query existing description
      await setPreference('key', 'value', 'New description');

      expect(mockDatabase.getFirstAsync).not.toHaveBeenCalled();
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['key', 'value', 'New description']
      );
    });

    it('should handle undefined description parameter', async () => {
      const { mockDatabase, mockGetFirstAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockGetFirstAsync.mockResolvedValue({ description: 'Preserved description' });

      await setPreference('key', 'value', undefined);

      expect(mockDatabase.getFirstAsync).toHaveBeenCalled();
      expect(mockDatabase.runAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO preferences (key, value, description) VALUES (?, ?, ?)',
        ['key', 'value', 'Preserved description']
      );
    });
  });

  describe('getAllPreferences', () => {
    it('should return all preferences ordered by key', async () => {
      const { mockDatabase, mockGetAllAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const mockPreferences: Preference[] = [
        { key: 'key1', value: 'value1', description: 'desc1' },
        { key: 'key2', value: 'value2', description: 'desc2' },
      ];
      mockGetAllAsync.mockResolvedValue(mockPreferences);

      const result = await getAllPreferences();

      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        'SELECT key, value, description FROM preferences ORDER BY key'
      );
      expect(result).toEqual(mockPreferences);
    });

    it('should return empty array when no preferences exist', async () => {
      const { mockDatabase, mockGetAllAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockGetAllAsync.mockResolvedValue([]);

      const result = await getAllPreferences();

      expect(mockDatabase.getAllAsync).toHaveBeenCalledWith(
        'SELECT key, value, description FROM preferences ORDER BY key'
      );
      expect(result).toEqual([]);
    });

    it('should return empty array on database error', async () => {
      const { mockDatabase, mockGetAllAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockGetAllAsync.mockRejectedValue(new Error('Database error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await getAllPreferences();

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error getting all preferences:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });

    it('should handle null return from database', async () => {
      const { mockDatabase, mockGetAllAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockGetAllAsync.mockResolvedValue(null);

      const result = await getAllPreferences();

      expect(result).toEqual([]);
    });

    it('should return preferences with empty descriptions', async () => {
      const { mockDatabase, mockGetAllAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const mockPreferences: Preference[] = [
        { key: 'key1', value: 'value1', description: '' },
        { key: 'key2', value: 'value2', description: '' },
      ];
      mockGetAllAsync.mockResolvedValue(mockPreferences);

      const result = await getAllPreferences();

      expect(result).toEqual(mockPreferences);
      expect(result[0].description).toBe('');
    });

    it('should preserve preference ordering by key', async () => {
      const { mockDatabase, mockGetAllAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      const mockPreferences: Preference[] = [
        { key: 'a_key', value: 'value1', description: 'desc1' },
        { key: 'b_key', value: 'value2', description: 'desc2' },
        { key: 'z_key', value: 'value3', description: 'desc3' },
      ];
      mockGetAllAsync.mockResolvedValue(mockPreferences);

      const result = await getAllPreferences();

      expect(result[0].key).toBe('a_key');
      expect(result[1].key).toBe('b_key');
      expect(result[2].key).toBe('z_key');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle set and get preference workflow', async () => {
      const { mockDatabase, mockGetFirstAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);

      // Set a preference
      await setPreference('workflow_key', 'workflow_value', 'Workflow test');

      // Mock the get to return what we just set
      mockGetFirstAsync.mockResolvedValue({ value: 'workflow_value' });

      const result = await getPreference('workflow_key');

      expect(result).toBe('workflow_value');
    });

    it('should handle multiple preference updates', async () => {
      const { mockDatabase, mockGetFirstAsync } = createMockPreferencesDb();
      (connection.getDatabase as jest.Mock).mockResolvedValue(mockDatabase);
      mockGetFirstAsync.mockResolvedValue({ description: 'Original description' });

      await setPreference('multi_key', 'value1');
      await setPreference('multi_key', 'value2');
      await setPreference('multi_key', 'value3');

      expect(mockDatabase.runAsync).toHaveBeenCalledTimes(3);
    });
  });
});
