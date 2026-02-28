/**
 * Tests for optimisticUpdate type guards
 */

import {
  isCheckInRollbackData,
  isRewardRollbackData,
  isOptimisticUpdate,
  OptimisticUpdateType,
  OptimisticUpdateStatus,
} from '../optimisticUpdate';

describe('isCheckInRollbackData', () => {
  it('returns true for valid CheckInRollbackData', () => {
    expect(
      isCheckInRollbackData({
        type: 'CHECK_IN_BEER',
        beer: { id: 'b1', brew_name: 'Test IPA' },
        wasInAllBeers: true,
        wasInTastedBeers: false,
      })
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isCheckInRollbackData(null)).toBe(false);
  });

  it('returns false for non-object primitives', () => {
    expect(isCheckInRollbackData('string')).toBe(false);
    expect(isCheckInRollbackData(42)).toBe(false);
    expect(isCheckInRollbackData(true)).toBe(false);
  });

  it('returns false when type field is wrong', () => {
    expect(
      isCheckInRollbackData({
        type: 'REDEEM_REWARD',
        beer: { id: 'b1', brew_name: 'Test IPA' },
        wasInAllBeers: true,
        wasInTastedBeers: false,
      })
    ).toBe(false);
  });

  it('rejects objects with wrong field types', () => {
    expect(
      isCheckInRollbackData({
        type: 'CHECK_IN_BEER',
        beer: 'not-object',
        wasInAllBeers: true,
        wasInTastedBeers: false,
      })
    ).toBe(false);
  });

  it('rejects objects when beer is null', () => {
    expect(
      isCheckInRollbackData({
        type: 'CHECK_IN_BEER',
        beer: null,
        wasInAllBeers: true,
        wasInTastedBeers: false,
      })
    ).toBe(false);
  });

  it('rejects objects when wasInAllBeers is not boolean', () => {
    expect(
      isCheckInRollbackData({
        type: 'CHECK_IN_BEER',
        beer: { id: 'b1', brew_name: 'Test IPA' },
        wasInAllBeers: 'yes',
        wasInTastedBeers: false,
      })
    ).toBe(false);
  });

  it('rejects objects when wasInTastedBeers is not boolean', () => {
    expect(
      isCheckInRollbackData({
        type: 'CHECK_IN_BEER',
        beer: { id: 'b1', brew_name: 'Test IPA' },
        wasInAllBeers: true,
        wasInTastedBeers: 1,
      })
    ).toBe(false);
  });

  it('rejects objects with missing fields', () => {
    expect(isCheckInRollbackData({ type: 'CHECK_IN_BEER' })).toBe(false);
  });
});

describe('isRewardRollbackData', () => {
  it('returns true for valid RewardRollbackData', () => {
    expect(
      isRewardRollbackData({
        type: 'REDEEM_REWARD',
        rewardId: 'reward-1',
        wasAvailable: true,
      })
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRewardRollbackData(null)).toBe(false);
  });

  it('returns false for non-object primitives', () => {
    expect(isRewardRollbackData('string')).toBe(false);
    expect(isRewardRollbackData(42)).toBe(false);
  });

  it('rejects objects with wrong type field', () => {
    expect(
      isRewardRollbackData({
        type: 'CHECK_IN_BEER',
        rewardId: 'reward-1',
        wasAvailable: true,
      })
    ).toBe(false);
  });

  it('rejects objects when rewardId is not a string', () => {
    expect(
      isRewardRollbackData({
        type: 'REDEEM_REWARD',
        rewardId: 123,
        wasAvailable: true,
      })
    ).toBe(false);
  });

  it('rejects objects when wasAvailable is not boolean', () => {
    expect(
      isRewardRollbackData({
        type: 'REDEEM_REWARD',
        rewardId: 'reward-1',
        wasAvailable: 'yes',
      })
    ).toBe(false);
  });

  it('rejects objects with missing fields', () => {
    expect(isRewardRollbackData({ type: 'REDEEM_REWARD' })).toBe(false);
  });
});

describe('isOptimisticUpdate', () => {
  it('returns true for valid OptimisticUpdate', () => {
    expect(
      isOptimisticUpdate({
        id: 'update-1',
        type: OptimisticUpdateType.CHECK_IN_BEER,
        status: OptimisticUpdateStatus.PENDING,
        timestamp: 1700000000000,
        rollbackData: {
          type: 'CHECK_IN_BEER',
          beer: { id: 'b1', brew_name: 'Test IPA' },
          wasInAllBeers: true,
          wasInTastedBeers: false,
        },
      })
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isOptimisticUpdate(null)).toBe(false);
  });

  it('returns false for non-object primitives', () => {
    expect(isOptimisticUpdate('string')).toBe(false);
    expect(isOptimisticUpdate(42)).toBe(false);
  });

  it('rejects objects with missing fields', () => {
    expect(isOptimisticUpdate({ id: '1', type: 'CHECK_IN_BEER' })).toBe(false);
  });

  it('rejects objects where id is not a string', () => {
    expect(
      isOptimisticUpdate({
        id: 123,
        type: OptimisticUpdateType.CHECK_IN_BEER,
        status: OptimisticUpdateStatus.PENDING,
        timestamp: 1700000000000,
        rollbackData: { type: 'CHECK_IN_BEER' },
      })
    ).toBe(false);
  });

  it('rejects objects where type is not a valid enum value', () => {
    expect(
      isOptimisticUpdate({
        id: 'update-1',
        type: 'INVALID_TYPE',
        status: OptimisticUpdateStatus.PENDING,
        timestamp: 1700000000000,
        rollbackData: { type: 'CHECK_IN_BEER' },
      })
    ).toBe(false);
  });

  it('rejects objects where status is not a valid enum value', () => {
    expect(
      isOptimisticUpdate({
        id: 'update-1',
        type: OptimisticUpdateType.CHECK_IN_BEER,
        status: 'INVALID_STATUS',
        timestamp: 1700000000000,
        rollbackData: { type: 'CHECK_IN_BEER' },
      })
    ).toBe(false);
  });

  it('rejects objects where timestamp is not a number', () => {
    expect(
      isOptimisticUpdate({
        id: 'update-1',
        type: OptimisticUpdateType.CHECK_IN_BEER,
        status: OptimisticUpdateStatus.PENDING,
        timestamp: '1700000000000',
        rollbackData: { type: 'CHECK_IN_BEER' },
      })
    ).toBe(false);
  });

  it('rejects objects where rollbackData is null', () => {
    expect(
      isOptimisticUpdate({
        id: 'update-1',
        type: OptimisticUpdateType.CHECK_IN_BEER,
        status: OptimisticUpdateStatus.PENDING,
        timestamp: 1700000000000,
        rollbackData: null,
      })
    ).toBe(false);
  });
});
