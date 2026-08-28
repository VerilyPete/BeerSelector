/**
 * Live Activity Module Type Tests
 *
 * These tests verify that the LiveActivityModule exports the correct
 * function signatures. The actual functionality is tested through
 * Maestro E2E tests since the native module requires iOS runtime.
 */

import { describe, it, expect, vi, type Mock } from 'vitest';

import LiveActivityModule from '../index';

// Mock expo-modules-core: there is no native runtime here, so the real
// `requireNativeModule('LiveActivity')` throws on import.
vi.mock('expo-modules-core', () => ({
  requireNativeModule: vi.fn(() => ({
    areActivitiesEnabled: vi.fn(),
    startActivity: vi.fn(),
    updateActivity: vi.fn(),
    endActivity: vi.fn(),
    endAllActivities: vi.fn(),
    endAllActivitiesSync: vi.fn(),
    restartActivity: vi.fn(),
    getAllActivityIds: vi.fn(),
    endActivitiesOlderThan: vi.fn(),
  })),
}));

describe('LiveActivityModule types', () => {
  it('should export the correct function signatures', () => {
    expect(typeof LiveActivityModule.areActivitiesEnabled).toBe('function');
    expect(typeof LiveActivityModule.startActivity).toBe('function');
    expect(typeof LiveActivityModule.updateActivity).toBe('function');
    expect(typeof LiveActivityModule.endActivity).toBe('function');
    expect(typeof LiveActivityModule.endAllActivities).toBe('function');
    expect(typeof LiveActivityModule.endAllActivitiesSync).toBe('function');
    expect(typeof LiveActivityModule.restartActivity).toBe('function');
    expect(typeof LiveActivityModule.getAllActivityIds).toBe('function');
    expect(typeof LiveActivityModule.endActivitiesOlderThan).toBe('function');
  });

  it('should have areActivitiesEnabled return a Promise<boolean>', async () => {
    const mockResult = true;
    (LiveActivityModule.areActivitiesEnabled as Mock).mockResolvedValue(mockResult);

    const result = await LiveActivityModule.areActivitiesEnabled();
    expect(result).toBe(mockResult);
  });

  it('should have startActivity accept StartActivityData and return Promise<string>', async () => {
    const mockActivityId = 'test-activity-id';
    (LiveActivityModule.startActivity as Mock).mockResolvedValue(mockActivityId);

    const result = await LiveActivityModule.startActivity({
      memberId: 'member-123',
      storeId: 'store-456',
      beers: [{ id: 'beer-1', name: 'Test IPA' }],
    });

    expect(result).toBe(mockActivityId);
    expect(LiveActivityModule.startActivity).toHaveBeenCalledWith({
      memberId: 'member-123',
      storeId: 'store-456',
      beers: [{ id: 'beer-1', name: 'Test IPA' }],
    });
  });

  it('should have updateActivity accept activityId and UpdateActivityData and return Promise<boolean>', async () => {
    (LiveActivityModule.updateActivity as Mock).mockResolvedValue(true);

    const result = await LiveActivityModule.updateActivity('activity-123', {
      beers: [{ id: 'beer-1', name: 'Updated IPA' }],
    });

    expect(result).toBe(true);
    expect(LiveActivityModule.updateActivity).toHaveBeenCalledWith('activity-123', {
      beers: [{ id: 'beer-1', name: 'Updated IPA' }],
    });
  });

  it('should have endActivity accept activityId and return Promise<boolean>', async () => {
    (LiveActivityModule.endActivity as Mock).mockResolvedValue(true);

    const result = await LiveActivityModule.endActivity('activity-123');

    expect(result).toBe(true);
    expect(LiveActivityModule.endActivity).toHaveBeenCalledWith('activity-123');
  });

  it('should have endAllActivities return Promise<boolean>', async () => {
    (LiveActivityModule.endAllActivities as Mock).mockResolvedValue(true);

    const result = await LiveActivityModule.endAllActivities();

    expect(result).toBe(true);
  });

  it('should have restartActivity accept StartActivityData and return Promise<string | null>', async () => {
    const mockActivityId = 'new-activity-id';
    (LiveActivityModule.restartActivity as Mock).mockResolvedValue(mockActivityId);

    const result = await LiveActivityModule.restartActivity({
      memberId: 'member-123',
      storeId: 'store-456',
      beers: [{ id: 'beer-1', name: 'Test Stout' }],
    });

    expect(result).toBe(mockActivityId);
  });

  it('should have restartActivity return null for empty queue', async () => {
    (LiveActivityModule.restartActivity as Mock).mockResolvedValue(null);

    const result = await LiveActivityModule.restartActivity({
      memberId: 'member-123',
      storeId: 'store-456',
      beers: [],
    });

    expect(result).toBeNull();
  });

  it('should have getAllActivityIds return Promise<string[]>', async () => {
    const mockIds = ['activity-1', 'activity-2'];
    (LiveActivityModule.getAllActivityIds as Mock).mockResolvedValue(mockIds);

    const result = await LiveActivityModule.getAllActivityIds();

    expect(result).toEqual(mockIds);
  });

  it('should have endActivitiesOlderThan accept maxAgeSeconds and return Promise<number>', async () => {
    (LiveActivityModule.endActivitiesOlderThan as Mock).mockResolvedValue(2);

    const result = await LiveActivityModule.endActivitiesOlderThan(10800); // 3 hours

    expect(result).toBe(2);
    expect(LiveActivityModule.endActivitiesOlderThan).toHaveBeenCalledWith(10800);
  });

  it('should have endAllActivitiesSync return boolean synchronously', () => {
    (LiveActivityModule.endAllActivitiesSync as Mock).mockReturnValue(true);

    const result = LiveActivityModule.endAllActivitiesSync();

    expect(result).toBe(true);
    expect(LiveActivityModule.endAllActivitiesSync).toHaveBeenCalled();
  });

  it('should have endAllActivitiesSync return false on timeout', () => {
    (LiveActivityModule.endAllActivitiesSync as Mock).mockReturnValue(false);

    const result = LiveActivityModule.endAllActivitiesSync();

    expect(result).toBe(false);
  });
});
