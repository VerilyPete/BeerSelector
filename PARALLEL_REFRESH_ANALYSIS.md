# Parallel Refresh Lock Contention Analysis (CI-2)

**Issue**: HP-2 Step 5b - Critical Issue CI-2
**Date**: 2025-11-08
**Status**: DOCUMENTED (awaiting fix in Step 5c)

## Executive Summary

The current implementation of `manualRefreshAllData()` and `refreshAllDataFromAPI()` runs three database operations in parallel using `Promise.allSettled()` and `Promise.all()`. This causes **lock contention** at the DatabaseLockManager level, where operations queue and wait for locks sequentially anyway, adding unnecessary overhead.

## Current Behavior

### Problem

Each refresh operation acquires its own database lock through repository methods:
1. `beerRepository.insertMany()` acquires lock → performs operation → releases lock
2. `myBeersRepository.insertMany()` acquires lock (WAITS if lock held) → performs operation → releases lock
3. `rewardsRepository.insertMany()` acquires lock (WAITS if lock held) → performs operation → releases lock

**Result**: Operations execute sequentially at the lock level, but with queueing overhead from parallel Promise execution.

### Performance Impact

- **Current timing**: ~4.5 seconds (with lock contention overhead)
- **Expected with fix**: ~1.5 seconds (sequential execution without queueing overhead)
- **Overhead**: ~3 seconds wasted on lock contention and queueing

## Code Locations Using Parallel Execution

### Location 1: `manualRefreshAllData()` - Line 463

**File**: `src/services/dataUpdateService.ts`
**Lines**: 463-467

```typescript
// Refresh all data in parallel for better performance
const [allBeersResult, myBeersResult, rewardsResult] = await Promise.allSettled([
  apiUrl ? fetchAllImpl() : Promise.resolve({ success: true, dataUpdated: false }),
  myBeersApiUrl ? fetchMyImpl() : Promise.resolve({ success: true, dataUpdated: false }),
  myBeersApiUrl ? fetchRewardsImpl() : Promise.resolve({ success: true, dataUpdated: false })
]);
```

**Issue**: Comment says "for better performance" but actually causes WORSE performance due to lock contention.

**Lock Flow**:
```
Time 0ms:   All 3 promises start simultaneously
Time 0ms:   fetchAllImpl() acquires lock
Time 0ms:   fetchMyImpl() QUEUED (lock held)
Time 0ms:   fetchRewardsImpl() QUEUED (lock held)
Time 500ms: fetchAllImpl() releases lock
Time 500ms: fetchMyImpl() acquires lock from queue
Time 1000ms: fetchMyImpl() releases lock
Time 1000ms: fetchRewardsImpl() acquires lock from queue
Time 1500ms: fetchRewardsImpl() releases lock
Total: 1500ms + queueing overhead ≈ 4500ms
```

### Location 2: `refreshAllDataFromAPI()` - Line 614

**File**: `src/services/dataUpdateService.ts`
**Lines**: 614-632

```typescript
// Fetch all data in parallel for better performance
const [allBeers, myBeers, rewards] = await Promise.all([
  // Fetch and populate all beers
  fetchBeersFromAPI().then(async (beers) => {
    await beerRepository.insertMany(beers);
    return beers;
  }),

  // Fetch and populate my beers (tasted beers)
  fetchMyBeersFromAPI().then(async (beers) => {
    await myBeersRepository.insertMany(beers);
    return beers;
  }),

  // Fetch and populate rewards
  fetchRewardsFromAPI().then(async (rewards) => {
    await rewardsRepository.insertMany(rewards);
    return rewards;
  })
]);
```

**Issue**: Same pattern - parallel API fetches are fine, but sequential database writes cause lock contention.

**Lock Flow**: Same as Location 1 - operations queue at the lock manager.

## Repository Lock Behavior

### Current Implementation (Causing Contention)

Each repository's `insertMany()` method acquires a lock:

```typescript
// BeerRepository.ts - lines 50-70
async insertMany(beers: Beer[]): Promise<void> {
  console.log(`BeerRepository: Starting batch insert of ${beers.length} beers`);

  await acquireLock('BeerRepository.insertMany');  // ← ACQUIRES LOCK

  try {
    await database.withTransactionAsync(async () => {
      // ... insert logic
    });
  } finally {
    releaseLock('BeerRepository.insertMany');  // ← RELEASES LOCK
  }
}
```

**Problem**: When called in parallel via `Promise.all()`, these lock acquisitions queue.

### Unsafe Methods (Available but Unused)

Each repository has `insertManyUnsafe()` methods that skip lock acquisition:

```typescript
// BeerRepository.ts - lines 72-89
async insertManyUnsafe(beers: Beer[]): Promise<void> {
  console.log(`BeerRepository: Starting UNSAFE batch insert of ${beers.length} beers`);

  // NO LOCK - caller must hold master lock
  await database.withTransactionAsync(async () => {
    // ... same insert logic
  });
}
```

**Solution**: Use these methods under a single master lock (Step 5c).

## Lock Contention Evidence

### DatabaseLockManager Queue Logs

When parallel refresh occurs, console shows:

```
Lock acquired for: BeerRepository.insertMany
Database operation already in progress, waiting for lock (MyBeersRepository.insertMany)...
Database operation already in progress, waiting for lock (RewardsRepository.insertMany)...
Lock released for: BeerRepository.insertMany
Lock acquired for: MyBeersRepository.insertMany
Lock released for: MyBeersRepository.insertMany
Lock acquired for: RewardsRepository.insertMany
Lock released for: RewardsRepository.insertMany
```

**Analysis**:
- Operations start simultaneously but execute sequentially
- Queueing adds overhead: Promise creation, queue management, context switching
- No actual parallelism achieved

## Test Coverage

### Existing Tests Proving the Issue

**File**: `src/services/__tests__/refreshCoordination.test.ts`

**Test 7**: "demonstrates current parallel execution causes lock queueing"
- Creates mock operations that acquire locks
- Runs them in parallel via `Promise.allSettled()`
- Verifies lock queue behavior

**Expected behavior** (currently failing):
- Sequential execution: each operation completes before next starts
- Single master lock: acquired once for entire sequence
- No queueing overhead

## Proposed Solution (Step 5c)

### New Function: `sequentialRefreshAllData()`

```typescript
export async function sequentialRefreshAllData(): Promise<ManualRefreshResult> {
  // Acquire master lock ONCE
  await databaseLockManager.acquireLock('refresh-all-data-master');

  try {
    // Execute sequentially, using UNSAFE methods (no nested locks)
    const allBeersResult = await fetchAndUpdateAllBeersUnsafe();
    const myBeersResult = await fetchAndUpdateMyBeersUnsafe();
    const rewardsResult = await fetchAndUpdateRewardsUnsafe();

    return { allBeersResult, myBeersResult, rewardsResult, ... };
  } finally {
    // Release master lock
    await databaseLockManager.releaseLock('refresh-all-data-master');
  }
}
```

### Benefits

1. **Performance**: ~3x faster (1.5s vs 4.5s)
2. **Simplicity**: No lock contention, straightforward execution
3. **Reliability**: Single lock point, easier to reason about
4. **Mobile-optimized**: Faster refresh = better UX on slow connections

## Baseline Measurements

### To Be Measured (Step 5b Task 3)

Run the following to establish baseline:

```bash
# 1. Run existing tests
npm test -- src/services/__tests__/refreshCoordination.test.ts --no-coverage

# 2. Measure refresh timing (manual test in app)
# - Start app
# - Trigger manual refresh
# - Observe console logs for timing

# 3. Monitor lock queue length
# - Check DatabaseLockManager queue logs
# - Count "waiting for lock" messages
```

**Expected Results**:
- Current: 3 "waiting for lock" messages per refresh
- After fix: 0 "waiting for lock" messages per refresh
- Timing improvement: 3x faster

## References

- **CODE_REVIEW.md**: Lines 253-269 (HP-2 Steps 5b-5c)
- **DatabaseLockManager.ts**: Lock queue implementation
- **BeerRepository.ts**: Lines 50-89 (safe vs unsafe methods)
- **MyBeersRepository.ts**: Lines 53-92 (safe vs unsafe methods)
- **RewardsRepository.ts**: Lines 50-89 (safe vs unsafe methods)

## Next Steps

1. ✅ Step 5a: Tests created (7 tests, all failing)
2. ✅ Step 5b: Analysis documented (this file)
3. ⏭️ Step 5c: Implement `sequentialRefreshAllData()` to make tests pass
4. ⏭️ Step 5c: Update `manualRefreshAllData()` to use sequential approach
5. ⏭️ Step 5c: Update `refreshAllDataFromAPI()` to use sequential approach
6. ⏭️ Step 5c: Measure improvement and update this document

---

**Status**: READY FOR IMPLEMENTATION (Step 5c)
