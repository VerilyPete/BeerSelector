/**
 * Unit tests for liveActivityService
 *
 * Tests the Live Activity service layer which manages iOS Live Activities
 * for displaying the beer queue on the lock screen and Dynamic Island.
 *
 * Following CLAUDE.md guidelines:
 * - Jest for unit tests only (pure functions and service functions)
 * - Mock native modules properly
 * - Focus on pure logic and service function behavior
 */

import type { QueuedBeer } from '@/src/utils/htmlParser';
import type { SessionData } from '@/src/types/api';

// Import the service after mocking
import {
  stripContainerType,
  convertToLiveActivityBeers,
  isLiveActivitySupported,
  startLiveActivity,
  updateLiveActivity,
  endLiveActivity,
  endAllLiveActivities,
  getCurrentActivityId,
  updateLiveActivityWithQueue,
  syncLiveActivityOnLaunch,
  syncActivityIdFromNative,
  cleanupStaleActivityOnForeground,
  restartLiveActivity,
  debouncedRestartLiveActivity,
  cancelPendingRestart,
  flushPendingRestart,
  endAllActivitiesSync,
} from '../liveActivityService';

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Create mock functions for the native module
const mockAreActivitiesEnabled = jest.fn();
const mockStartActivity = jest.fn();
const mockUpdateActivity = jest.fn();
const mockEndActivity = jest.fn();
const mockEndAllActivities = jest.fn();
const mockRestartActivity = jest.fn();
const mockGetAllActivityIds = jest.fn();
const mockEndActivitiesOlderThan = jest.fn();
const mockEndAllActivitiesSync = jest.fn();
const mockScheduleCleanupTask = jest.fn();
const mockCancelCleanupTask = jest.fn();
const mockGetActivityStaleDate = jest.fn();

type LiveActivitiesModuleMock = {
  areActivitiesEnabled: jest.Mock;
  startActivity: jest.Mock;
  updateActivity: jest.Mock;
  endActivity: jest.Mock;
  endAllActivities: jest.Mock;
  restartActivity: jest.Mock;
  getAllActivityIds: jest.Mock;
  endActivitiesOlderThan: jest.Mock;
  endAllActivitiesSync: jest.Mock;
  scheduleCleanupTask: jest.Mock;
  cancelCleanupTask: jest.Mock;
  getActivityStaleDate: jest.Mock;
};

// Mock Platform and NativeModules from react-native
let mockPlatformOS = 'ios';
let mockLiveActivitiesModule: LiveActivitiesModuleMock | undefined = {
  areActivitiesEnabled: mockAreActivitiesEnabled,
  startActivity: mockStartActivity,
  updateActivity: mockUpdateActivity,
  endActivity: mockEndActivity,
  endAllActivities: mockEndAllActivities,
  restartActivity: mockRestartActivity,
  getAllActivityIds: mockGetAllActivityIds,
  endActivitiesOlderThan: mockEndActivitiesOlderThan,
  endAllActivitiesSync: mockEndAllActivitiesSync,
  scheduleCleanupTask: mockScheduleCleanupTask,
  cancelCleanupTask: mockCancelCleanupTask,
  getActivityStaleDate: mockGetActivityStaleDate,
};

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
  NativeModules: {
    get LiveActivities() {
      return mockLiveActivitiesModule;
    },
  },
}));

// Mock the Expo module
jest.mock('@/modules/live-activity/src', () => ({
  __esModule: true,
  default: {
    get areActivitiesEnabled() {
      return mockAreActivitiesEnabled;
    },
    get startActivity() {
      return mockStartActivity;
    },
    get updateActivity() {
      return mockUpdateActivity;
    },
    get endActivity() {
      return mockEndActivity;
    },
    get endAllActivities() {
      return mockEndAllActivities;
    },
    get restartActivity() {
      return mockRestartActivity;
    },
    get getAllActivityIds() {
      return mockGetAllActivityIds;
    },
    get endActivitiesOlderThan() {
      return mockEndActivitiesOlderThan;
    },
    get endAllActivitiesSync() {
      return mockEndAllActivitiesSync;
    },
    get scheduleCleanupTask() {
      return mockScheduleCleanupTask;
    },
    get cancelCleanupTask() {
      return mockCancelCleanupTask;
    },
    get getActivityStaleDate() {
      return mockGetActivityStaleDate;
    },
  },
}));

describe('liveActivityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Silence console output during tests
    console.log = jest.fn();
    console.error = jest.fn();

    // Reset Platform.OS to iOS for each test
    mockPlatformOS = 'ios';

    // Reset native module mocks
    mockLiveActivitiesModule = {
      areActivitiesEnabled: mockAreActivitiesEnabled,
      startActivity: mockStartActivity,
      updateActivity: mockUpdateActivity,
      endActivity: mockEndActivity,
      endAllActivities: mockEndAllActivities,
      restartActivity: mockRestartActivity,
      getAllActivityIds: mockGetAllActivityIds,
      endActivitiesOlderThan: mockEndActivitiesOlderThan,
      endAllActivitiesSync: mockEndAllActivitiesSync,
      scheduleCleanupTask: mockScheduleCleanupTask,
      cancelCleanupTask: mockCancelCleanupTask,
      getActivityStaleDate: mockGetActivityStaleDate,
    };

    // Set default mock implementations for cleanup task functions
    mockScheduleCleanupTask.mockResolvedValue(true);
    mockCancelCleanupTask.mockReturnValue(true);
    mockGetActivityStaleDate.mockResolvedValue(null);
    mockEndActivitiesOlderThan.mockResolvedValue(0);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  // ============================================
  // SECTION 1: Pure Function Tests
  // ============================================

  describe('stripContainerType', () => {
    it('should strip (Draft) suffix from beer name', () => {
      const result = stripContainerType("Bell's Hopslam (Draft)");
      expect(result).toBe("Bell's Hopslam");
    });

    it('should strip (BTL) suffix from beer name', () => {
      const result = stripContainerType('Firestone Walker Parabola (BTL)');
      expect(result).toBe('Firestone Walker Parabola');
    });

    it('should return beer name unchanged if no suffix', () => {
      const result = stripContainerType('Stone IPA');
      expect(result).toBe('Stone IPA');
    });

    it('should only remove the last parenthetical group', () => {
      const result = stripContainerType('Beer (Special Edition) (Draft)');
      expect(result).toBe('Beer (Special Edition)');
    });

    it('should handle beer names with multiple parentheses not at end', () => {
      const result = stripContainerType('Founders (2024) KBS Reserve');
      expect(result).toBe('Founders (2024) KBS Reserve');
    });

    it('should handle empty string', () => {
      const result = stripContainerType('');
      expect(result).toBe('');
    });

    it('should handle names with only parenthetical suffix', () => {
      // The regex only matches " (something)" with a space before it
      // A string like "(Draft)" alone doesn't have a space prefix, so it's unchanged
      const result = stripContainerType('(Draft)');
      expect(result).toBe('(Draft)');
    });

    it('should strip suffix when there is a space prefix', () => {
      const result = stripContainerType('Something (Draft)');
      expect(result).toBe('Something');
    });

    it('should preserve interior parentheses', () => {
      const result = stripContainerType('Dogfish Head (60 Minute) IPA (Can)');
      expect(result).toBe('Dogfish Head (60 Minute) IPA');
    });
  });

  describe('convertToLiveActivityBeers', () => {
    it('should convert QueuedBeer array to LiveActivityQueuedBeer array', () => {
      const queuedBeers: QueuedBeer[] = [
        { id: '1', name: "Bell's Hopslam (Draft)", date: 'Apr 08, 2025' },
        { id: '2', name: 'Stone IPA', date: 'Apr 09, 2025' },
      ];

      const result = convertToLiveActivityBeers(queuedBeers);

      expect(result).toEqual([
        { id: '1', name: "Bell's Hopslam" },
        { id: '2', name: 'Stone IPA' },
      ]);
    });

    it('should return empty array for empty input', () => {
      const result = convertToLiveActivityBeers([]);
      expect(result).toEqual([]);
    });

    it('should strip container types from all beer names', () => {
      const queuedBeers: QueuedBeer[] = [
        { id: '1', name: 'Beer A (Draft)', date: 'Apr 08, 2025' },
        { id: '2', name: 'Beer B (BTL)', date: 'Apr 08, 2025' },
        { id: '3', name: 'Beer C (Can)', date: 'Apr 08, 2025' },
      ];

      const result = convertToLiveActivityBeers(queuedBeers);

      expect(result).toEqual([
        { id: '1', name: 'Beer A' },
        { id: '2', name: 'Beer B' },
        { id: '3', name: 'Beer C' },
      ]);
    });
  });

  // ============================================
  // SECTION 2: Platform Detection Tests
  // ============================================

  describe('isLiveActivitySupported', () => {
    it('should return false on Android', async () => {
      mockPlatformOS = 'android';

      const result = await isLiveActivitySupported();

      expect(result).toBe(false);
      expect(console.log).toHaveBeenCalledWith('[LiveActivity] Not iOS platform');
    });

    it('should return false when native module throws', async () => {
      mockAreActivitiesEnabled.mockRejectedValueOnce(new Error('Module not available'));

      const result = await isLiveActivitySupported();

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        '[LiveActivity] Error checking support:',
        expect.any(Error)
      );
    });

    it('should return native module result when areActivitiesEnabled returns true', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);

      const result = await isLiveActivitySupported();

      expect(result).toBe(true);
      expect(mockAreActivitiesEnabled).toHaveBeenCalled();
    });

    it('should return native module result when areActivitiesEnabled returns false', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(false);

      const result = await isLiveActivitySupported();

      expect(result).toBe(false);
    });

    it('should return true when areActivitiesEnabled resolves to true', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);

      const result = await isLiveActivitySupported();

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith('[LiveActivity] Activities enabled:', true);
    });

    it('should return false and log error when native call throws', async () => {
      mockAreActivitiesEnabled.mockRejectedValueOnce(new Error('Native error'));

      const result = await isLiveActivitySupported();

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        '[LiveActivity] Error checking support:',
        expect.any(Error)
      );
    });
  });

  // ============================================
  // SECTION 3: startLiveActivity Tests
  // ============================================

  describe('startLiveActivity', () => {
    const mockQueueState = {
      beers: [
        { id: '1', name: "Bell's Hopslam" },
        { id: '2', name: 'Stone IPA' },
      ],
    };

    const mockAttributes = {
      memberId: '12345',
      storeId: '1',
    };

    it('should return null for empty queue', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);

      const result = await startLiveActivity({ beers: [] }, mockAttributes);

      expect(result).toBeNull();
      expect(console.log).toHaveBeenCalledWith('[LiveActivity] Cannot start with empty queue');
    });

    it('should return null when not supported', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(false);

      const result = await startLiveActivity(mockQueueState, mockAttributes);

      expect(result).toBeNull();
      expect(console.log).toHaveBeenCalledWith('[LiveActivity] Not supported, skipping start');
    });

    it('should call native module with correct attributes and return activity ID', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);
      mockStartActivity.mockResolvedValueOnce('activity-123');

      const result = await startLiveActivity(mockQueueState, mockAttributes);

      expect(result).toBe('activity-123');
      expect(mockStartActivity).toHaveBeenCalledWith({
        memberId: '12345',
        storeId: '1',
        beers: mockQueueState.beers,
      });
    });

    it('should handle foreground requirement error gracefully', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);
      mockStartActivity.mockRejectedValueOnce(
        new Error('The operation could not be completed because the target is not foreground')
      );

      const result = await startLiveActivity(mockQueueState, mockAttributes);

      expect(result).toBeNull();
      expect(console.log).toHaveBeenCalledWith(
        '[LiveActivity] App not in foreground, will retry when foregrounded'
      );
    });

    it('should return null and log error when native call throws', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);
      mockStartActivity.mockRejectedValueOnce(new Error('Native error'));

      const result = await startLiveActivity(mockQueueState, mockAttributes);

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        '[LiveActivity] Error starting activity:',
        expect.any(Error)
      );
    });
  });

  // ============================================
  // SECTION 4: updateLiveActivity Tests
  // ============================================

  describe('updateLiveActivity', () => {
    beforeEach(async () => {
      // Start an activity first to set currentActivityId
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);
      mockStartActivity.mockResolvedValueOnce('activity-123');
      await startLiveActivity(
        { beers: [{ id: '1', name: 'Test' }] },
        { memberId: '123', storeId: '1' }
      );
      jest.clearAllMocks();
    });

    it('should call endLiveActivity if queue becomes empty', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);

      await updateLiveActivity({ beers: [] });

      expect(mockEndActivity).toHaveBeenCalledWith('activity-123');
    });

    it('should update existing activity with new state', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);
      const newState = { beers: [{ id: '2', name: 'New Beer' }] };

      await updateLiveActivity(newState);

      expect(mockUpdateActivity).toHaveBeenCalledWith('activity-123', {
        beers: newState.beers,
      });
    });

    it('should log when no activity exists to update', async () => {
      // End the activity first
      await endLiveActivity();
      jest.clearAllMocks();

      mockAreActivitiesEnabled.mockResolvedValueOnce(true);
      await updateLiveActivity({ beers: [{ id: '1', name: 'Test' }] });

      expect(console.log).toHaveBeenCalledWith(
        '[LiveActivity] No activity to update, need to start first'
      );
      expect(mockUpdateActivity).not.toHaveBeenCalled();
    });

    it('should not throw when native call throws', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);
      mockUpdateActivity.mockRejectedValueOnce(new Error('Native error'));

      await expect(
        updateLiveActivity({ beers: [{ id: '1', name: 'Test' }] })
      ).resolves.not.toThrow();

      expect(console.error).toHaveBeenCalledWith(
        '[LiveActivity] Error updating activity:',
        expect.any(Error)
      );
    });
  });

  // ============================================
  // SECTION 5: endLiveActivity Tests
  // ============================================

  describe('endLiveActivity', () => {
    it('should log when no activity to end', async () => {
      // Make sure no activity is active
      await endAllLiveActivities();
      jest.clearAllMocks();

      await endLiveActivity();

      expect(console.log).toHaveBeenCalledWith('[LiveActivity] No activity to end');
      expect(mockEndActivity).not.toHaveBeenCalled();
    });

    it('should call native module and clear activity ID', async () => {
      // Start an activity first
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);
      mockStartActivity.mockResolvedValueOnce('activity-123');
      await startLiveActivity(
        { beers: [{ id: '1', name: 'Test' }] },
        { memberId: '123', storeId: '1' }
      );
      jest.clearAllMocks();

      await endLiveActivity();

      expect(mockEndActivity).toHaveBeenCalledWith('activity-123');
      expect(getCurrentActivityId()).toBeNull();
    });

    it('should clear activity ID even when native call throws', async () => {
      // Start an activity first
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);
      mockStartActivity.mockResolvedValueOnce('activity-123');
      await startLiveActivity(
        { beers: [{ id: '1', name: 'Test' }] },
        { memberId: '123', storeId: '1' }
      );
      jest.clearAllMocks();

      mockEndActivity.mockRejectedValueOnce(new Error('Native error'));

      await endLiveActivity();

      expect(getCurrentActivityId()).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        '[LiveActivity] Error ending activity:',
        expect.any(Error)
      );
    });

    it('should clear activity ID when native module unavailable', async () => {
      // Start an activity first
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);
      mockStartActivity.mockResolvedValueOnce('activity-123');
      await startLiveActivity(
        { beers: [{ id: '1', name: 'Test' }] },
        { memberId: '123', storeId: '1' }
      );
      jest.clearAllMocks();

      mockLiveActivitiesModule = undefined;

      await endLiveActivity();

      expect(getCurrentActivityId()).toBeNull();
    });
  });

  // ============================================
  // SECTION 6: endAllLiveActivities Tests
  // ============================================

  describe('endAllLiveActivities', () => {
    it('should do nothing on Android', async () => {
      mockPlatformOS = 'android';

      await endAllLiveActivities();

      expect(mockEndAllActivities).not.toHaveBeenCalled();
    });

    it('should call native module to end all activities', async () => {
      await endAllLiveActivities();

      expect(mockEndAllActivities).toHaveBeenCalled();
      expect(getCurrentActivityId()).toBeNull();
    });

    it('should clear activity ID when native module unavailable', async () => {
      // Start an activity first
      mockAreActivitiesEnabled.mockResolvedValueOnce(true);
      mockStartActivity.mockResolvedValueOnce('activity-123');
      await startLiveActivity(
        { beers: [{ id: '1', name: 'Test' }] },
        { memberId: '123', storeId: '1' }
      );

      mockLiveActivitiesModule = undefined;

      await endAllLiveActivities();

      expect(getCurrentActivityId()).toBeNull();
    });

    it('should clear activity ID even when native call throws', async () => {
      mockEndAllActivities.mockRejectedValueOnce(new Error('Native error'));

      await endAllLiveActivities();

      expect(getCurrentActivityId()).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        '[LiveActivity] Error ending all activities:',
        expect.any(Error)
      );
    });

    it('should succeed when called with Expo module', async () => {
      mockEndAllActivities.mockResolvedValueOnce(true);

      await endAllLiveActivities();

      expect(mockEndAllActivities).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('[LiveActivity] Ended all activities');
    });

    it('should cancel cleanup task when ending all activities', async () => {
      mockEndAllActivities.mockResolvedValueOnce(true);

      await endAllLiveActivities();

      expect(mockCancelCleanupTask).toHaveBeenCalled();
    });
  });

  // ============================================
  // SECTION 7: updateLiveActivityWithQueue Tests
  // ============================================

  describe('updateLiveActivityWithQueue', () => {
    const mockSessionData: SessionData = {
      memberId: '12345',
      storeId: '1',
      storeName: 'Test Store',
      sessionId: 'test-session-123',
    };

    const mockQueuedBeers: QueuedBeer[] = [
      { id: '1', name: "Bell's Hopslam (Draft)", date: 'Apr 08, 2025' },
      { id: '2', name: 'Stone IPA', date: 'Apr 09, 2025' },
    ];

    beforeEach(() => {
      mockAreActivitiesEnabled.mockResolvedValue(true);
    });

    it('should skip for visitor mode', async () => {
      await updateLiveActivityWithQueue(mockQueuedBeers, mockSessionData, true);

      expect(console.log).toHaveBeenCalledWith('[LiveActivity] Skipping for visitor mode');
      expect(mockStartActivity).not.toHaveBeenCalled();
    });

    it('should skip when session data is null', async () => {
      await updateLiveActivityWithQueue(mockQueuedBeers, null);

      expect(console.log).toHaveBeenCalledWith('[LiveActivity] No valid session data');
      expect(mockStartActivity).not.toHaveBeenCalled();
    });

    it('should skip when memberId is missing', async () => {
      await updateLiveActivityWithQueue(mockQueuedBeers, {
        ...mockSessionData,
        memberId: undefined,
      } as unknown as SessionData);

      expect(console.log).toHaveBeenCalledWith('[LiveActivity] No valid session data');
    });

    it('should skip when storeId is missing', async () => {
      await updateLiveActivityWithQueue(mockQueuedBeers, {
        ...mockSessionData,
        storeId: undefined,
      } as unknown as SessionData);

      expect(console.log).toHaveBeenCalledWith('[LiveActivity] No valid session data');
    });

    it('should end activity when queue is empty', async () => {
      // First start an activity
      mockStartActivity.mockResolvedValueOnce('activity-123');
      await updateLiveActivityWithQueue(mockQueuedBeers, mockSessionData);
      jest.clearAllMocks();

      await updateLiveActivityWithQueue([], mockSessionData);

      expect(mockEndActivity).toHaveBeenCalled();
    });

    it('should start new activity when none exists', async () => {
      // Make sure no activity is active
      await endAllLiveActivities();
      jest.clearAllMocks();
      mockAreActivitiesEnabled.mockResolvedValue(true);
      mockStartActivity.mockResolvedValueOnce('activity-123');

      await updateLiveActivityWithQueue(mockQueuedBeers, mockSessionData);

      expect(mockStartActivity).toHaveBeenCalledWith({
        memberId: '12345',
        storeId: '1',
        beers: [
          { id: '1', name: "Bell's Hopslam" },
          { id: '2', name: 'Stone IPA' },
        ],
      });
    });

    it('should update existing activity', async () => {
      // First start an activity
      mockStartActivity.mockResolvedValueOnce('activity-123');
      await updateLiveActivityWithQueue(mockQueuedBeers, mockSessionData);
      jest.clearAllMocks();
      mockAreActivitiesEnabled.mockResolvedValue(true);

      const newBeers: QueuedBeer[] = [{ id: '3', name: 'New Beer', date: 'Apr 10, 2025' }];
      await updateLiveActivityWithQueue(newBeers, mockSessionData);

      expect(mockUpdateActivity).toHaveBeenCalled();
      expect(mockStartActivity).not.toHaveBeenCalled();
    });

    it('should not throw when error occurs', async () => {
      // Make sure no activity is active
      await endAllLiveActivities();
      jest.clearAllMocks();
      mockAreActivitiesEnabled.mockResolvedValue(true);
      mockStartActivity.mockRejectedValueOnce(new Error('Native error'));

      await expect(
        updateLiveActivityWithQueue(mockQueuedBeers, mockSessionData)
      ).resolves.not.toThrow();
    });
  });

  // ============================================
  // SECTION 8: syncLiveActivityOnLaunch Tests
  // ============================================

  describe('syncLiveActivityOnLaunch', () => {
    const mockSessionData: SessionData = {
      memberId: '12345',
      storeId: '1',
      storeName: 'Test Store',
      sessionId: 'test-session-123',
    };

    const mockGetQueuedBeers = jest.fn();

    beforeEach(() => {
      mockAreActivitiesEnabled.mockResolvedValue(true);
      mockGetQueuedBeers.mockResolvedValue([{ id: '1', name: 'Test Beer', date: 'Apr 08, 2025' }]);
    });

    it('should skip for visitor mode', async () => {
      await syncLiveActivityOnLaunch(mockGetQueuedBeers, mockSessionData, true);

      expect(console.log).toHaveBeenCalledWith(
        '[LiveActivity] Skipping sync - visitor mode or no session'
      );
      expect(mockGetQueuedBeers).not.toHaveBeenCalled();
    });

    it('should skip when session data is null', async () => {
      await syncLiveActivityOnLaunch(mockGetQueuedBeers, null);

      expect(console.log).toHaveBeenCalledWith(
        '[LiveActivity] Skipping sync - visitor mode or no session'
      );
      expect(mockGetQueuedBeers).not.toHaveBeenCalled();
    });

    it('should skip when not supported', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(false);

      await syncLiveActivityOnLaunch(mockGetQueuedBeers, mockSessionData);

      expect(console.log).toHaveBeenCalledWith('[LiveActivity] Skipping sync - not supported');
      expect(mockGetQueuedBeers).not.toHaveBeenCalled();
    });

    it('should fetch queue and update activity', async () => {
      // Make sure no activity is active
      await endAllLiveActivities();
      jest.clearAllMocks();
      mockAreActivitiesEnabled.mockResolvedValue(true);
      mockStartActivity.mockResolvedValueOnce('activity-123');

      await syncLiveActivityOnLaunch(mockGetQueuedBeers, mockSessionData);

      expect(mockGetQueuedBeers).toHaveBeenCalled();
      expect(mockStartActivity).toHaveBeenCalled();
    });

    it('should not throw when getQueuedBeers throws', async () => {
      mockGetQueuedBeers.mockRejectedValueOnce(new Error('Fetch error'));

      await expect(
        syncLiveActivityOnLaunch(mockGetQueuedBeers, mockSessionData)
      ).resolves.not.toThrow();

      expect(console.error).toHaveBeenCalledWith(
        '[LiveActivity] Error syncing on launch:',
        expect.any(Error)
      );
    });
  });

  // ============================================
  // SECTION 9: getCurrentActivityId Tests
  // ============================================

  describe('getCurrentActivityId', () => {
    // These tests rely on module state tracking, so they need specific ordering
    // and careful state management

    it('should return activity ID after starting activity and null after ending', async () => {
      // Clear all mocks and reset module state first
      jest.clearAllMocks();
      mockAreActivitiesEnabled.mockReset();
      mockStartActivity.mockReset();
      mockEndActivity.mockReset();
      mockEndAllActivities.mockReset();

      // Set up fresh mocks
      mockLiveActivitiesModule = {
        areActivitiesEnabled: mockAreActivitiesEnabled,
        startActivity: mockStartActivity,
        updateActivity: mockUpdateActivity,
        endActivity: mockEndActivity,
        endAllActivities: mockEndAllActivities,
      };

      // First, clear any existing activity by calling endAllLiveActivities
      mockAreActivitiesEnabled.mockResolvedValue(true);
      mockEndAllActivities.mockResolvedValue(undefined);
      await endAllLiveActivities();

      // Verify state is null after clearing
      expect(getCurrentActivityId()).toBeNull();

      // Now start a new activity - use mockResolvedValueOnce to ensure this specific value is used
      const expectedActivityId = 'unique-activity-id-12345';
      mockStartActivity.mockResolvedValueOnce(expectedActivityId);

      const result = await startLiveActivity(
        { beers: [{ id: '1', name: 'Test' }] },
        { memberId: '123', storeId: '1' }
      );

      // Verify startLiveActivity returned the activity ID
      expect(result).toBe(expectedActivityId);

      // Verify the activity ID is set in module state
      expect(getCurrentActivityId()).toBe(expectedActivityId);

      // Now end the activity
      await endLiveActivity();

      // Verify the activity ID is cleared
      expect(getCurrentActivityId()).toBeNull();
    });
  });

  // ============================================
  // SECTION 10: restartLiveActivity Tests
  // ============================================

  describe('restartLiveActivity', () => {
    const mockQueueState = {
      memberId: 'M123',
      storeId: 'S456',
      beers: [{ id: '1', name: 'Test Beer' }],
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockAreActivitiesEnabled.mockResolvedValue(true);
    });

    it('should call native restartActivity with correct data', async () => {
      mockRestartActivity.mockResolvedValueOnce('new-activity-id');

      const result = await restartLiveActivity(mockQueueState);

      expect(mockRestartActivity).toHaveBeenCalledWith({
        memberId: 'M123',
        storeId: 'S456',
        beers: [{ id: '1', name: 'Test Beer' }],
      });
      expect(result.success).toBe(true);
      expect(result.activityId).toBe('new-activity-id');
      expect(result.wasDebounced).toBe(false);
    });

    it('should return success false when activities not enabled', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(false);

      const result = await restartLiveActivity(mockQueueState);

      expect(result.success).toBe(false);
      expect(result.activityId).toBeNull();
      expect(result.error).toBe('Activities not enabled');
    });

    it('should return success false when not on iOS', async () => {
      mockPlatformOS = 'android';

      const result = await restartLiveActivity(mockQueueState);

      expect(result.success).toBe(false);
      expect(result.activityId).toBeNull();
      expect(result.error).toBe('Not iOS');
    });

    it('should return null activityId when beers array is empty', async () => {
      mockRestartActivity.mockResolvedValueOnce(null);

      const emptyQueueState = {
        memberId: 'M123',
        storeId: 'S456',
        beers: [],
      };

      const result = await restartLiveActivity(emptyQueueState);

      expect(result.success).toBe(true);
      expect(result.activityId).toBeNull();
    });

    it('should handle native errors gracefully', async () => {
      mockRestartActivity.mockRejectedValueOnce(new Error('Native error'));

      const result = await restartLiveActivity(mockQueueState);

      expect(result.success).toBe(false);
      expect(result.activityId).toBeNull();
      expect(result.error).toBe('Native error');
    });

    it('should handle foreground requirement error', async () => {
      mockRestartActivity.mockRejectedValueOnce(
        new Error('The operation could not be completed because the target is not foreground')
      );

      const result = await restartLiveActivity(mockQueueState);

      expect(result.success).toBe(false);
      expect(result.activityId).toBeNull();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('not in foreground'));
    });
  });

  // ============================================
  // SECTION 11: debouncedRestartLiveActivity Tests
  // ============================================

  describe('debouncedRestartLiveActivity', () => {
    const mockQueueState = {
      memberId: 'M123',
      storeId: 'S456',
      beers: [{ id: '1', name: 'Test Beer' }],
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockAreActivitiesEnabled.mockResolvedValue(true);
      // Cancel any pending restarts from previous tests
      cancelPendingRestart();
    });

    it('should debounce rapid calls so only one native restart executes', async () => {
      jest.useFakeTimers();
      mockRestartActivity.mockResolvedValue('activity-id');

      const p1 = debouncedRestartLiveActivity(mockQueueState);
      const p2 = debouncedRestartLiveActivity(mockQueueState);

      // Flush areActivitiesEnabled microtasks for both calls
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      jest.advanceTimersByTime(500);

      // Flush the restartActivity promise
      await Promise.resolve();
      await Promise.resolve();

      const [r1, r2] = await Promise.all([p1, p2]);

      expect(mockRestartActivity).toHaveBeenCalledTimes(1);
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);

      jest.useRealTimers();
    });

    it('should not execute before the 500ms debounce window elapses', async () => {
      jest.useFakeTimers();
      mockRestartActivity.mockResolvedValue('activity-id');

      const promise = debouncedRestartLiveActivity(mockQueueState);

      await Promise.resolve();
      await Promise.resolve();

      expect(mockRestartActivity).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();

      await promise;

      expect(mockRestartActivity).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });

    it('should use the latest state when multiple calls are debounced', async () => {
      jest.useFakeTimers();
      const firstState = { ...mockQueueState, beers: [{ id: '1', name: 'First Beer' }] };
      const latestState = { ...mockQueueState, beers: [{ id: '2', name: 'Latest Beer' }] };
      mockRestartActivity.mockResolvedValue('activity-id');

      debouncedRestartLiveActivity(firstState);
      await Promise.resolve();
      await Promise.resolve();

      const p2 = debouncedRestartLiveActivity(latestState);
      await Promise.resolve();
      await Promise.resolve();

      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();

      await p2;

      expect(mockRestartActivity).toHaveBeenCalledTimes(1);
      expect(mockRestartActivity).toHaveBeenCalledWith(
        expect.objectContaining({ beers: [{ id: '2', name: 'Latest Beer' }] })
      );

      jest.useRealTimers();
    });

    it('should skip debouncing when config.enabled is false', async () => {
      mockRestartActivity.mockResolvedValue('activity-id');

      const result = await debouncedRestartLiveActivity(mockQueueState, {
        enabled: false,
      });

      // Should call immediately without waiting for debounce
      expect(mockRestartActivity).toHaveBeenCalledTimes(1);
      expect(result.wasDebounced).toBe(false);
    });

    it('should return wasDebounced true for debounced calls', async () => {
      jest.useFakeTimers();
      mockRestartActivity.mockResolvedValue('new-activity-id');

      const promise = debouncedRestartLiveActivity(mockQueueState);

      await Promise.resolve();
      await Promise.resolve();

      jest.advanceTimersByTime(500);
      await Promise.resolve();
      await Promise.resolve();

      const result = await promise;

      expect(result.wasDebounced).toBe(true);
      expect(result.success).toBe(true);

      jest.useRealTimers();
    });

    it('should return success false when not on iOS', async () => {
      mockPlatformOS = 'android';

      const result = await debouncedRestartLiveActivity(mockQueueState);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not iOS');
    });

    it('should return error when activities not enabled', async () => {
      mockAreActivitiesEnabled.mockResolvedValueOnce(false);

      // With debouncing disabled, check the immediate result
      const result = await debouncedRestartLiveActivity(mockQueueState, {
        enabled: false,
      });

      // Should return activities not enabled error from direct call
      expect(result.success).toBe(false);
      expect(result.error).toBe('Activities not enabled');
    });
  });

  // ============================================
  // SECTION 12: cancelPendingRestart Tests
  // ============================================

  describe('cancelPendingRestart', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockAreActivitiesEnabled.mockResolvedValue(true);
      cancelPendingRestart();
    });

    it('should cancel a pending debounced restart so the native call never fires', async () => {
      jest.useFakeTimers();
      mockRestartActivity.mockResolvedValue('activity-id');

      const mockQueueStateLocal = {
        memberId: 'M123',
        storeId: 'S456',
        beers: [{ id: '1', name: 'Test Beer' }],
      };

      const promise = debouncedRestartLiveActivity(mockQueueStateLocal);

      // Flush areActivitiesEnabled
      await Promise.resolve();
      await Promise.resolve();

      // Cancel before the debounce fires
      cancelPendingRestart();

      jest.advanceTimersByTime(500);
      await Promise.resolve();

      const result = await promise;

      expect(mockRestartActivity).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Cancelled');

      jest.useRealTimers();
    });

    it('should be safe to call when no pending restart', () => {
      // Should not throw
      expect(() => cancelPendingRestart()).not.toThrow();
    });
  });

  // ============================================
  // SECTION 13: flushPendingRestart Tests
  // ============================================

  describe('flushPendingRestart', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockAreActivitiesEnabled.mockResolvedValue(true);
      cancelPendingRestart();
    });

    it('should execute a pending restart immediately without waiting for the timer', async () => {
      jest.useFakeTimers();
      mockRestartActivity.mockResolvedValue('activity-id');

      const mockQueueStateLocal = {
        memberId: 'M123',
        storeId: 'S456',
        beers: [{ id: '1', name: 'Test Beer' }],
      };

      const promise = debouncedRestartLiveActivity(mockQueueStateLocal);

      // Flush areActivitiesEnabled
      await Promise.resolve();
      await Promise.resolve();

      // Flush immediately without advancing timers
      flushPendingRestart();

      // Flush the restartActivity promise
      await Promise.resolve();
      await Promise.resolve();

      const result = await promise;

      expect(mockRestartActivity).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);

      jest.useRealTimers();
    });

    it('should be safe to call when no pending restart', () => {
      // Should not throw
      expect(() => flushPendingRestart()).not.toThrow();
    });
  });

  // ============================================
  // SECTION 14: endAllActivitiesSync Tests
  // ============================================

  describe('endAllActivitiesSync', () => {
    it('should call native endAllActivitiesSync', () => {
      mockEndAllActivitiesSync.mockReturnValue(true);

      const result = endAllActivitiesSync();

      expect(mockEndAllActivitiesSync).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return true on non-iOS platforms', () => {
      mockPlatformOS = 'android';

      const result = endAllActivitiesSync();

      expect(mockEndAllActivitiesSync).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should handle native module errors gracefully', () => {
      mockEndAllActivitiesSync.mockImplementation(() => {
        throw new Error('Native error');
      });

      // Should not throw
      const result = endAllActivitiesSync();

      expect(result).toBe(false);
    });
  });

  describe('syncActivityIdFromNative', () => {
    beforeEach(() => {
      // Reset module state by ending any activity
      mockEndActivity.mockResolvedValue(true);
    });

    it('should do nothing on non-iOS platforms', async () => {
      mockPlatformOS = 'android';

      await syncActivityIdFromNative();

      expect(mockGetAllActivityIds).not.toHaveBeenCalled();
    });

    it('should sync activity ID when activities exist', async () => {
      mockPlatformOS = 'ios';
      mockGetAllActivityIds.mockResolvedValue(['test-activity-123']);
      mockGetActivityStaleDate.mockResolvedValue(null);

      await syncActivityIdFromNative();

      expect(mockGetAllActivityIds).toHaveBeenCalled();
      expect(getCurrentActivityId()).toBe('test-activity-123');
    });

    it('should restore stale timestamp when activity has stale date', async () => {
      mockPlatformOS = 'ios';
      mockGetAllActivityIds.mockResolvedValue(['test-activity-456']);
      // Unix timestamp in seconds: Dec 4, 2025 12:00:00 UTC
      const staleTimestampSeconds = 1733313600;
      mockGetActivityStaleDate.mockResolvedValue(staleTimestampSeconds);

      await syncActivityIdFromNative();

      expect(mockGetAllActivityIds).toHaveBeenCalled();
      expect(mockGetActivityStaleDate).toHaveBeenCalledWith('test-activity-456');
      expect(getCurrentActivityId()).toBe('test-activity-456');
      // Note: We can't directly test activityStaleTimestamp since it's not exported,
      // but we verify the mock was called with the correct activity ID
    });

    it('should handle no existing activities', async () => {
      mockPlatformOS = 'ios';
      mockGetAllActivityIds.mockResolvedValue([]);

      await syncActivityIdFromNative();

      expect(mockGetAllActivityIds).toHaveBeenCalled();
      expect(getCurrentActivityId()).toBe(null);
    });

    it('should handle errors gracefully', async () => {
      mockPlatformOS = 'ios';
      mockGetAllActivityIds.mockRejectedValue(new Error('Native error'));

      // Should not throw
      await syncActivityIdFromNative();

      expect(getCurrentActivityId()).toBe(null);
    });

    it('should handle getActivityStaleDate errors gracefully', async () => {
      mockPlatformOS = 'ios';
      mockGetAllActivityIds.mockResolvedValue(['test-activity-789']);
      mockGetActivityStaleDate.mockRejectedValue(new Error('Stale date error'));

      // Should not throw, activity ID should still be synced
      await syncActivityIdFromNative();

      expect(getCurrentActivityId()).toBe('test-activity-789');
    });

    it('should end stale activities before syncing', async () => {
      mockPlatformOS = 'ios';
      mockEndActivitiesOlderThan.mockResolvedValue(2); // 2 stale activities ended
      mockGetAllActivityIds.mockResolvedValue(['fresh-activity']);
      mockGetActivityStaleDate.mockResolvedValue(null);

      await syncActivityIdFromNative();

      // Should call endActivitiesOlderThan with 3 hours in seconds
      expect(mockEndActivitiesOlderThan).toHaveBeenCalledWith(10800);
      expect(mockGetAllActivityIds).toHaveBeenCalled();
      expect(getCurrentActivityId()).toBe('fresh-activity');
    });

    it('should allow cleanupStaleActivityOnForeground to use restored stale timestamp', async () => {
      mockPlatformOS = 'ios';
      mockGetAllActivityIds.mockResolvedValue(['test-activity']);
      // Set a stale timestamp in the past (1 hour ago in seconds)
      const pastTimestamp = Math.floor((Date.now() - 60 * 60 * 1000) / 1000);
      mockGetActivityStaleDate.mockResolvedValue(pastTimestamp);
      mockEndActivity.mockResolvedValue(true);

      // First sync to restore the activity and stale timestamp
      await syncActivityIdFromNative();
      expect(getCurrentActivityId()).toBe('test-activity');

      // Now cleanup should detect it as stale and end it
      await cleanupStaleActivityOnForeground();

      // Activity should have been cleaned up because it was stale
      expect(mockEndActivity).toHaveBeenCalledWith('test-activity');
      expect(getCurrentActivityId()).toBeNull();
    });
  });
});
