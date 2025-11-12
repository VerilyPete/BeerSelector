/**
 * Tests for database initialization state machine
 *
 * Tests that state transitions work correctly and invalid transitions are prevented.
 */

import { DatabaseInitializationState, DatabaseInitializer } from '../initializationState';

describe('DatabaseInitializer', () => {
  let initializer: DatabaseInitializer;

  beforeEach(() => {
    initializer = new DatabaseInitializer();
  });

  describe('Initial state', () => {
    it('should start in UNINITIALIZED state', () => {
      expect(initializer.getState()).toBe(DatabaseInitializationState.UNINITIALIZED);
    });

    it('should not be ready initially', () => {
      expect(initializer.isReady()).toBe(false);
    });

    it('should not be initializing initially', () => {
      expect(initializer.isInitializing()).toBe(false);
    });

    it('should not be in error state initially', () => {
      expect(initializer.isError()).toBe(false);
    });
  });

  describe('State transitions', () => {
    it('should transition from UNINITIALIZED to INITIALIZING', () => {
      initializer.setInitializing();
      expect(initializer.getState()).toBe(DatabaseInitializationState.INITIALIZING);
      expect(initializer.isInitializing()).toBe(true);
    });

    it('should transition from INITIALIZING to READY', () => {
      initializer.setInitializing();
      initializer.setReady();
      expect(initializer.getState()).toBe(DatabaseInitializationState.READY);
      expect(initializer.isReady()).toBe(true);
    });

    it('should transition from UNINITIALIZED to ERROR', () => {
      initializer.setError('Test error');
      expect(initializer.getState()).toBe(DatabaseInitializationState.ERROR);
      expect(initializer.isError()).toBe(true);
    });

    it('should transition from INITIALIZING to ERROR', () => {
      initializer.setInitializing();
      initializer.setError('Initialization failed');
      expect(initializer.getState()).toBe(DatabaseInitializationState.ERROR);
      expect(initializer.isError()).toBe(true);
    });

    it('should allow re-initialization from ERROR state', () => {
      initializer.setInitializing();
      initializer.setError('Failed');
      initializer.setInitializing(); // Retry
      expect(initializer.getState()).toBe(DatabaseInitializationState.INITIALIZING);
    });

    it('should transition from ERROR to READY on successful retry', () => {
      initializer.setInitializing();
      initializer.setError('Failed');
      initializer.setInitializing();
      initializer.setReady();
      expect(initializer.getState()).toBe(DatabaseInitializationState.READY);
    });
  });

  describe('Invalid state transitions', () => {
    it('should not allow setting READY without INITIALIZING first', () => {
      expect(() => {
        initializer.setReady();
      }).toThrow('Cannot transition to READY from UNINITIALIZED');
    });

    it('should not allow re-initializing when already READY', () => {
      initializer.setInitializing();
      initializer.setReady();

      expect(() => {
        initializer.setInitializing();
      }).toThrow('Cannot transition to INITIALIZING from READY');
    });

    it('should not allow setting READY when in ERROR state', () => {
      initializer.setInitializing();
      initializer.setError('Failed');

      expect(() => {
        initializer.setReady();
      }).toThrow('Cannot transition to READY from ERROR');
    });

    it('should not allow re-initializing when already INITIALIZING', () => {
      initializer.setInitializing();

      expect(() => {
        initializer.setInitializing();
      }).toThrow('Cannot transition to INITIALIZING from INITIALIZING (already initializing)');
    });
  });

  describe('Error messages', () => {
    it('should store error message when transitioning to ERROR', () => {
      const errorMsg = 'Database connection failed';
      initializer.setError(errorMsg);
      expect(initializer.getErrorMessage()).toBe(errorMsg);
    });

    it('should clear error message when successfully initializing', () => {
      initializer.setInitializing();
      initializer.setError('Failed');
      expect(initializer.getErrorMessage()).toBe('Failed');

      initializer.setInitializing();
      expect(initializer.getErrorMessage()).toBeNull();
    });

    it('should return null for error message when not in ERROR state', () => {
      expect(initializer.getErrorMessage()).toBeNull();
      initializer.setInitializing();
      expect(initializer.getErrorMessage()).toBeNull();
      initializer.setReady();
      expect(initializer.getErrorMessage()).toBeNull();
    });
  });

  describe('State queries', () => {
    it('should correctly report INITIALIZING state', () => {
      expect(initializer.isInitializing()).toBe(false);
      initializer.setInitializing();
      expect(initializer.isInitializing()).toBe(true);
      initializer.setReady();
      expect(initializer.isInitializing()).toBe(false);
    });

    it('should correctly report READY state', () => {
      expect(initializer.isReady()).toBe(false);
      initializer.setInitializing();
      expect(initializer.isReady()).toBe(false);
      initializer.setReady();
      expect(initializer.isReady()).toBe(true);
    });

    it('should correctly report ERROR state', () => {
      expect(initializer.isError()).toBe(false);
      initializer.setInitializing();
      expect(initializer.isError()).toBe(false);
      initializer.setError('Failed');
      expect(initializer.isError()).toBe(true);
    });
  });

  describe('State transitions logging', () => {
    it('should log state transitions', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      initializer.setInitializing();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Database state: UNINITIALIZED -> INITIALIZING')
      );

      initializer.setReady();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Database state: INITIALIZING -> READY')
      );

      consoleSpy.mockRestore();
    });

    it('should log errors when transitioning to ERROR state', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      initializer.setInitializing();
      initializer.setError('Test error');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Database initialization error: Test error')
      );

      consoleSpy.mockRestore();
    });
  });
});
