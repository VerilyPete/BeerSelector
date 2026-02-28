/**
 * Tests for operationQueue type guards
 */

import {
  isQueuedOperation,
  isCheckInBeerPayload,
  isRewardRedemptionPayload,
  OperationType,
  OperationStatus,
} from '../operationQueue';

describe('isQueuedOperation', () => {
  it('returns true for valid QueuedOperation', () => {
    expect(
      isQueuedOperation({
        id: 'op-1',
        type: OperationType.CHECK_IN_BEER,
        payload: {
          beerId: 'beer-1',
          beerName: 'Test Beer',
          storeId: 'store-1',
          storeName: 'Test Store',
          memberId: 'member-1',
        },
        timestamp: 1700000000000,
        retryCount: 0,
        status: OperationStatus.PENDING,
      })
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isQueuedOperation(null)).toBe(false);
  });

  it('returns false for non-object primitives', () => {
    expect(isQueuedOperation('string')).toBe(false);
    expect(isQueuedOperation(42)).toBe(false);
  });

  it('rejects objects with missing required fields', () => {
    expect(isQueuedOperation({ id: 'op-1', type: OperationType.CHECK_IN_BEER })).toBe(false);
  });

  it('rejects objects where id is not a string', () => {
    expect(
      isQueuedOperation({
        id: 123,
        type: OperationType.CHECK_IN_BEER,
        payload: {},
        timestamp: 1700000000000,
        retryCount: 0,
        status: OperationStatus.PENDING,
      })
    ).toBe(false);
  });

  it('rejects objects where type is not a valid enum value', () => {
    expect(
      isQueuedOperation({
        id: 'op-1',
        type: 'INVALID_OPERATION',
        payload: {},
        timestamp: 1700000000000,
        retryCount: 0,
        status: OperationStatus.PENDING,
      })
    ).toBe(false);
  });

  it('rejects objects where payload is null', () => {
    expect(
      isQueuedOperation({
        id: 'op-1',
        type: OperationType.CHECK_IN_BEER,
        payload: null,
        timestamp: 1700000000000,
        retryCount: 0,
        status: OperationStatus.PENDING,
      })
    ).toBe(false);
  });

  it('rejects objects where timestamp is not a number', () => {
    expect(
      isQueuedOperation({
        id: 'op-1',
        type: OperationType.CHECK_IN_BEER,
        payload: {},
        timestamp: '1700000000000',
        retryCount: 0,
        status: OperationStatus.PENDING,
      })
    ).toBe(false);
  });

  it('rejects objects where retryCount is not a number', () => {
    expect(
      isQueuedOperation({
        id: 'op-1',
        type: OperationType.CHECK_IN_BEER,
        payload: {},
        timestamp: 1700000000000,
        retryCount: 'zero',
        status: OperationStatus.PENDING,
      })
    ).toBe(false);
  });

  it('rejects objects where status is not a valid enum value', () => {
    expect(
      isQueuedOperation({
        id: 'op-1',
        type: OperationType.CHECK_IN_BEER,
        payload: {},
        timestamp: 1700000000000,
        retryCount: 0,
        status: 'INVALID_STATUS',
      })
    ).toBe(false);
  });
});

describe('isCheckInBeerPayload', () => {
  it('returns true for valid CheckInBeerPayload', () => {
    expect(
      isCheckInBeerPayload({
        beerId: 'beer-1',
        beerName: 'Test Beer',
        storeId: 'store-1',
        storeName: 'Test Store',
        memberId: 'member-1',
      })
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isCheckInBeerPayload(null)).toBe(false);
  });

  it('returns false for non-object primitives', () => {
    expect(isCheckInBeerPayload('string')).toBe(false);
    expect(isCheckInBeerPayload(42)).toBe(false);
  });

  it('rejects objects with missing fields', () => {
    expect(isCheckInBeerPayload({ beerId: 'beer-1', beerName: 'Test Beer' })).toBe(false);
  });

  it('rejects objects where beerId is not a string', () => {
    expect(
      isCheckInBeerPayload({
        beerId: 123,
        beerName: 'Test Beer',
        storeId: 'store-1',
        storeName: 'Test Store',
        memberId: 'member-1',
      })
    ).toBe(false);
  });

  it('rejects objects where memberId is not a string', () => {
    expect(
      isCheckInBeerPayload({
        beerId: 'beer-1',
        beerName: 'Test Beer',
        storeId: 'store-1',
        storeName: 'Test Store',
        memberId: null,
      })
    ).toBe(false);
  });
});

describe('isRewardRedemptionPayload', () => {
  it('returns true for valid RewardRedemptionPayload', () => {
    expect(
      isRewardRedemptionPayload({
        rewardId: 'reward-1',
        rewardType: 'plate',
        memberId: 'member-1',
      })
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRewardRedemptionPayload(null)).toBe(false);
  });

  it('returns false for non-object primitives', () => {
    expect(isRewardRedemptionPayload('string')).toBe(false);
  });

  it('rejects objects with missing fields', () => {
    expect(isRewardRedemptionPayload({ rewardId: 'reward-1' })).toBe(false);
  });

  it('rejects objects where rewardId is not a string', () => {
    expect(
      isRewardRedemptionPayload({
        rewardId: 999,
        rewardType: 'plate',
        memberId: 'member-1',
      })
    ).toBe(false);
  });

  it('rejects objects where rewardType is not a string', () => {
    expect(
      isRewardRedemptionPayload({
        rewardId: 'reward-1',
        rewardType: null,
        memberId: 'member-1',
      })
    ).toBe(false);
  });
});
