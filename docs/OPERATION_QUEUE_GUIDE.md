# Operation Queue Developer Guide

## Quick Start

### Using Queued Check-Ins

The easiest way to add offline support to your components is to use the `useQueuedCheckIn` hook:

```typescript
import { useQueuedCheckIn } from '@/hooks/useQueuedCheckIn';

function MyComponent() {
  const { queuedCheckIn, isLoading } = useQueuedCheckIn();

  const handleCheckIn = async (beer: Beer) => {
    await queuedCheckIn(beer);
    // Done! Hook handles offline detection, queueing, and user feedback
  };

  return (
    <Button
      onPress={() => handleCheckIn(myBeer)}
      disabled={isLoading}
    >
      Check In
    </Button>
  );
}
```

### Direct Queue Access

For custom operations, use the `useOperationQueue` hook:

```typescript
import { useOperationQueue } from '@/context/OperationQueueContext';
import { OperationType } from '@/src/types/operationQueue';

function MyComponent() {
  const { queueOperation, queuedOperations, isRetrying } = useOperationQueue();

  const handleAction = async () => {
    await queueOperation(OperationType.CHECK_IN_BEER, {
      beerId: 'beer-123',
      beerName: 'My Beer',
      storeId: 'store-456',
      storeName: 'My Store',
      memberId: 'member-789'
    });

    Alert.alert('Queued', 'Operation will retry when back online');
  };

  return (
    <View>
      <Button onPress={handleAction}>Do Action</Button>
      {queuedOperations.length > 0 && (
        <Text>{queuedOperations.length} operations queued</Text>
      )}
    </View>
  );
}
```

## Adding New Operation Types

### 1. Define the Operation Type

Add to `src/types/operationQueue.ts`:

```typescript
export enum OperationType {
  // Existing types...
  MY_NEW_OPERATION = 'MY_NEW_OPERATION',
}
```

### 2. Define the Payload Interface

```typescript
export interface MyNewOperationPayload {
  userId: string;
  data: any;
}
```

### 3. Add to Payload Union Type

```typescript
export type OperationPayload =
  | CheckInBeerPayload
  | MyNewOperationPayload
  // ... other payloads
```

### 4. Add Type Guard (Optional)

```typescript
export function isMyNewOperationPayload(payload: unknown): payload is MyNewOperationPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const p = payload as MyNewOperationPayload;
  return typeof p.userId === 'string' && p.data !== undefined;
}
```

### 5. Implement Execution Logic

In `context/OperationQueueContext.tsx`, add to the `executeOperation` function:

```typescript
case OperationType.MY_NEW_OPERATION: {
  if (!isMyNewOperationPayload(operation.payload)) {
    throw new Error('Invalid MY_NEW_OPERATION payload');
  }

  const payload = operation.payload as MyNewOperationPayload;

  try {
    await myApiCall(payload.userId, payload.data);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      isRetryable: true, // or false if permanent failure
    };
  }
}
```

### 6. Update UI (Optional)

In `components/QueuedOperationsModal.tsx`, add human-readable name:

```typescript
const getOperationTypeName = (type: OperationType): string => {
  switch (type) {
    // ... existing cases
    case OperationType.MY_NEW_OPERATION:
      return 'My New Operation';
    default:
      return type;
  }
};
```

## API Reference

### useOperationQueue()

Returns:
```typescript
{
  // State
  queuedOperations: QueuedOperation[];  // All queued operations
  isRetrying: boolean;                  // Whether retry is in progress

  // Actions
  queueOperation: (type, payload) => Promise<void>;  // Queue new operation
  retryAll: () => Promise<void>;                     // Retry all pending
  retryOperation: (id) => Promise<void>;             // Retry specific operation
  deleteOperation: (id) => Promise<void>;            // Delete operation
  clearQueue: () => Promise<void>;                   // Clear all operations
  refresh: () => Promise<void>;                      // Reload from database

  // Config
  retryConfig: RetryConfig;                          // Retry configuration
}
```

### useQueuedCheckIn()

Returns:
```typescript
{
  queuedCheckIn: (beer: Beer) => Promise<void>;  // Smart check-in function
  isLoading: boolean;                            // Loading state
}
```

### OperationQueueRepository

Singleton instance: `operationQueueRepository`

Methods:
- `addOperation(operation)` - Add to queue
- `getPendingOperations()` - Get pending operations
- `getAllOperations()` - Get all operations
- `getOperationById(id)` - Get by ID
- `updateStatus(id, status, error?)` - Update status
- `incrementRetryCount(id, error?)` - Increment retry count
- `deleteOperation(id)` - Delete operation
- `clearAll()` - Clear queue
- `getCountByStatus(status)` - Count by status
- `getTotalCount()` - Total count

## Configuration

Default retry configuration (in `src/types/operationQueue.ts`):

```typescript
{
  maxRetries: 3,                    // Max retry attempts
  baseDelayMs: 1000,                // Base delay (1 second)
  maxDelayMs: 30000,                // Max delay (30 seconds)
  reconnectionDebounceMs: 2000,     // Debounce after reconnection (2 seconds)
}
```

Custom configuration:

```typescript
<OperationQueueProvider
  retryConfig={{
    maxRetries: 5,
    baseDelayMs: 2000,
  }}
>
  <App />
</OperationQueueProvider>
```

## Best Practices

### 1. Always Use Network-Aware Hooks

✅ Good:
```typescript
const { queuedCheckIn } = useQueuedCheckIn();
await queuedCheckIn(beer);
```

❌ Bad:
```typescript
// Don't call API directly - no offline support
await checkInBeer(beer);
```

### 2. Provide User Feedback

✅ Good:
```typescript
await queueOperation(type, payload);
Alert.alert('Queued', 'Will retry when back online');
```

❌ Bad:
```typescript
// Silent failure - user doesn't know what happened
await queueOperation(type, payload);
```

### 3. Handle Visitor Mode

✅ Good:
```typescript
const sessionData = await getSessionData();
if (sessionData.memberId === 'visitor') {
  Alert.alert('Error', 'Please log in first');
  return;
}
```

### 4. Classify Errors Correctly

✅ Good:
```typescript
return {
  success: false,
  error: 'Network timeout',
  isRetryable: true,  // Will retry
};
```

❌ Bad:
```typescript
return {
  success: false,
  error: 'User not found',
  isRetryable: true,  // Will retry forever!
};
```

### 5. Clean Up Successful Operations

The system automatically deletes successful operations, but you can manually clean up:

```typescript
await operationQueueRepository.deleteSuccessfulOperations();
```

## Troubleshooting

### Operations Not Retrying

**Check**:
1. Network state: `const { isConnected, isInternetReachable } = useNetwork();`
2. Operation status: Should be PENDING, not FAILED
3. Retry count: Should be < maxRetries
4. Console logs: Look for "[OperationQueueContext] Retrying..."

### Operations Not Persisting

**Check**:
1. Database initialized: Check `setupDatabase()` succeeded
2. Table created: Verify `operation_queue` table exists
3. Console errors: Look for database write errors

### UI Not Updating

**Check**:
1. Provider hierarchy: OperationQueueProvider wraps components
2. Hook usage: Component uses `useOperationQueue()`
3. React state: Operations stored in context state

### Duplicate Operations

**Note**: Deduplication is not implemented by default. If needed:

```typescript
// Check before queueing
const existing = await operationQueueRepository.getAllOperations();
const duplicate = existing.find(op =>
  op.type === OperationType.CHECK_IN_BEER &&
  op.payload.beerId === beer.id
);

if (duplicate) {
  Alert.alert('Already Queued', 'This operation is already in the queue');
  return;
}
```

## Testing

### Unit Testing

```typescript
import { operationQueueRepository } from '@/src/database/repositories/OperationQueueRepository';

describe('My Operation', () => {
  it('should queue operation', async () => {
    const operation = {
      id: 'test-1',
      type: OperationType.MY_NEW_OPERATION,
      payload: { userId: '123', data: {} },
      timestamp: Date.now(),
      retryCount: 0,
      status: OperationStatus.PENDING,
    };

    await operationQueueRepository.addOperation(operation);

    const pending = await operationQueueRepository.getPendingOperations();
    expect(pending).toContainEqual(expect.objectContaining({ id: 'test-1' }));
  });
});
```

### E2E Testing (Maestro)

```yaml
# Queue operation while offline
- setAirplaneMode: true
- tapOn: "Action Button"
- assertVisible: "Queued for Later"

# Verify auto-retry
- setAirplaneMode: false
- wait: 5000
- assertNotVisible: "Queued Operations"
```

## Performance Tips

### 1. Batch Operations

If queueing many operations:

```typescript
// Don't do this:
for (const beer of beers) {
  await queueOperation(OperationType.CHECK_IN_BEER, ...);
}

// Do this instead:
const operations = beers.map(beer => ({
  id: generateId(),
  type: OperationType.CHECK_IN_BEER,
  payload: { ... },
  timestamp: Date.now(),
  retryCount: 0,
  status: OperationStatus.PENDING,
}));

for (const op of operations) {
  await operationQueueRepository.addOperation(op);
}
await refresh(); // Single UI update
```

### 2. Clean Up Old Operations

Periodically clean up:

```typescript
// On app startup or settings screen
await operationQueueRepository.deleteSuccessfulOperations();
```

### 3. Limit Queue Size

Prevent unbounded growth:

```typescript
const count = await operationQueueRepository.getTotalCount();
if (count > 100) {
  Alert.alert('Queue Full', 'Please clear some operations');
  return;
}
```

## Examples

### Example 1: Reward Redemption

```typescript
// 1. Define payload
interface RedeemRewardPayload {
  rewardId: string;
  rewardType: string;
  memberId: string;
}

// 2. Queue operation
const { queueOperation } = useOperationQueue();

await queueOperation(OperationType.ADD_TO_REWARD_QUEUE, {
  rewardId: reward.id,
  rewardType: reward.type,
  memberId: sessionData.memberId,
});

// 3. Implement execution (in OperationQueueContext)
case OperationType.ADD_TO_REWARD_QUEUE: {
  const payload = operation.payload as RedeemRewardPayload;
  await redeemReward(payload.rewardId);
  return { success: true };
}
```

### Example 2: Batch Data Sync

```typescript
// Queue data sync operation
await queueOperation(OperationType.REFRESH_ALL_DATA, {
  dataType: 'all',
});

// Execution
case OperationType.REFRESH_ALL_DATA: {
  await manualRefreshAllData();
  return { success: true };
}
```

### Example 3: Custom Hook

```typescript
export const useQueuedRewardRedemption = () => {
  const { isConnected, isInternetReachable } = useNetwork();
  const { queueOperation } = useOperationQueue();
  const [isLoading, setIsLoading] = useState(false);

  const queuedRedeem = useCallback(async (reward: Reward) => {
    setIsLoading(true);

    try {
      const sessionData = await getSessionData();

      if (!isConnected || !isInternetReachable) {
        await queueOperation(OperationType.ADD_TO_REWARD_QUEUE, {
          rewardId: reward.id,
          rewardType: reward.type,
          memberId: sessionData.memberId,
        });

        Alert.alert('Queued', 'Will redeem when back online');
        return;
      }

      await redeemReward(reward.id);
      Alert.alert('Success', 'Reward redeemed!');
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, isInternetReachable, queueOperation]);

  return { queuedRedeem, isLoading };
};
```

## Related Documentation

- [Network Context Guide](./NETWORK_CONTEXT_GUIDE.md) - MP-7 Step 1
- [Background Sync Guide](./BACKGROUND_SYNC_GUIDE.md) - MP-7 Step 3 (coming soon)
- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
- [Testing Guide](./TESTING_GUIDE.md)
