# Network State Detection - Developer Guide

## Quick Start

The BeerSelector app now includes comprehensive network state detection to improve offline UX.

## Using Network State in Your Components

### Basic Usage

```typescript
import { useNetwork } from '@/context/NetworkContext';

function MyComponent() {
  const { isConnected, isInternetReachable } = useNetwork();

  if (!isConnected) {
    return <Text>You are offline</Text>;
  }

  return <Text>You are online</Text>;
}
```

### Checking Before Network Operations

```typescript
import { useNetwork } from '@/context/NetworkContext';
import { Alert } from 'react-native';

function MyComponent() {
  const { isConnected, isInternetReachable } = useNetwork();

  const handleRefresh = async () => {
    // Check network before making request
    if (!isConnected || !isInternetReachable) {
      Alert.alert(
        'Offline',
        'Cannot refresh data while offline. Please check your internet connection.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Proceed with network request
    await fetchDataFromAPI();
  };

  return (
    <Button
      title="Refresh"
      onPress={handleRefresh}
      disabled={!isConnected || !isInternetReachable}
    />
  );
}
```

### Showing Different UI Based on Network State

```typescript
import { useNetwork } from '@/context/NetworkContext';

function MyComponent() {
  const { isConnected, isInternetReachable, connectionType } = useNetwork();

  return (
    <View>
      {isConnected && isInternetReachable ? (
        <Text>Online via {connectionType}</Text>
      ) : isConnected ? (
        <Text>Connected but no internet access</Text>
      ) : (
        <Text>Offline - showing cached data</Text>
      )}
    </View>
  );
}
```

### Manually Refreshing Network State

```typescript
import { useNetwork } from '@/context/NetworkContext';
import { useFocusEffect } from 'expo-router';

function MyComponent() {
  const { refresh, isConnected } = useNetwork();

  // Refresh network state when screen is focused
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return <Text>Connected: {isConnected ? 'Yes' : 'No'}</Text>;
}
```

### Accessing Connection Details

```typescript
import { useNetwork } from '@/context/NetworkContext';

function MyComponent() {
  const { connectionType, details } = useNetwork();

  return (
    <View>
      <Text>Connection Type: {connectionType}</Text>
      <Text>Is Expensive: {details.isConnectionExpensive ? 'Yes' : 'No'}</Text>
      {details.cellularGeneration && (
        <Text>Cellular: {details.cellularGeneration}</Text>
      )}
      {details.ipAddress && (
        <Text>IP Address: {details.ipAddress}</Text>
      )}
    </View>
  );
}
```

## Network State Properties

### `isConnected` (boolean | null)
- `true` - Device has network connection (WiFi, Cellular, Ethernet, etc.)
- `false` - Device is completely offline (airplane mode, no connection)
- `null` - Network state not yet initialized

### `isInternetReachable` (boolean | null)
- `true` - Can reach the internet (checked by pinging external server)
- `false` - Connected to network but no internet access (e.g., WiFi with no internet)
- `null` - Internet reachability not yet determined

### `connectionType` (string)
- `'wifi'` - Connected via WiFi
- `'cellular'` - Connected via cellular data
- `'ethernet'` - Connected via ethernet cable
- `'bluetooth'` - Connected via Bluetooth
- `'wimax'` - Connected via WiMAX
- `'vpn'` - Connected via VPN
- `'other'` - Connected via unknown connection type
- `'unknown'` - Connection type unknown
- `'none'` - Not connected

### `details` (object)
Additional connection information:
- `isConnectionExpensive` (boolean | null) - Whether connection is metered/expensive
- `cellularGeneration` (string | null) - '2g', '3g', '4g', '5g' (cellular only)
- `ipAddress` (string | null) - Device IP address (when available)
- `subnet` (string | null) - Subnet mask (when available)

### `isInitialized` (boolean)
- `true` - Network state has been fetched at least once
- `false` - Still waiting for initial network state

### `refresh()` (function)
Manually refresh the network state. Returns a Promise.

## Offline Indicator

The app automatically shows an offline indicator banner at the top of the screen when:
- Device is completely offline (`isConnected === false`)
- Connected but internet not reachable (`isConnected === true && isInternetReachable === false`)

### Customizing the Offline Indicator

The OfflineIndicator is globally rendered in `app/_layout.tsx`. To customize it:

```typescript
// In app/_layout.tsx
<OfflineIndicator message="Custom Offline Message" />
```

## Best Practices

### 1. Always Check Network Before API Calls

```typescript
const { isConnected, isInternetReachable } = useNetwork();

const fetchData = async () => {
  if (!isConnected || !isInternetReachable) {
    // Show offline message or use cached data
    return;
  }

  // Make API call
  const response = await fetch(url);
  // ...
};
```

### 2. Provide Helpful Feedback to Users

```typescript
if (!isConnected) {
  Alert.alert(
    'Offline',
    'You are currently offline. Some features may be unavailable.',
    [{ text: 'OK' }]
  );
}
```

### 3. Gracefully Degrade Features

```typescript
// Show full feature set when online
if (isConnected && isInternetReachable) {
  return <FullFeatureComponent />;
}

// Show limited feature set when offline
return <OfflineModeComponent />;
```

### 4. Use Cached Data When Offline

```typescript
const { isConnected } = useNetwork();
const [data, setData] = useState([]);

useEffect(() => {
  if (isConnected) {
    // Fetch fresh data from API
    fetchDataFromAPI().then(setData);
  } else {
    // Load cached data from database
    loadDataFromDatabase().then(setData);
  }
}, [isConnected]);
```

### 5. Warn About Expensive Connections

```typescript
const { details } = useNetwork();

if (details.isConnectionExpensive) {
  Alert.alert(
    'Cellular Data',
    'You are using cellular data. Large downloads may incur charges.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', onPress: () => downloadLargeFile() }
    ]
  );
}
```

## Common Patterns

### Conditional Rendering Based on Network

```typescript
function DataList() {
  const { isConnected, isInternetReachable } = useNetwork();
  const [data, setData] = useState([]);

  return (
    <View>
      {!isConnected && (
        <Text style={styles.warning}>
          Viewing cached data - you are offline
        </Text>
      )}
      <FlatList data={data} renderItem={renderItem} />
    </View>
  );
}
```

### Retry Failed Operations When Back Online

```typescript
function DataSync() {
  const { isConnected, isInternetReachable } = useNetwork();
  const previouslyConnected = useRef(false);

  useEffect(() => {
    // Detect when we come back online
    if ((isConnected && isInternetReachable) && !previouslyConnected.current) {
      console.log('Back online - retrying failed operations');
      retryFailedOperations();
    }

    previouslyConnected.current = isConnected && isInternetReachable;
  }, [isConnected, isInternetReachable]);

  return null;
}
```

### Disable Buttons When Offline

```typescript
function ActionButton() {
  const { isConnected, isInternetReachable } = useNetwork();
  const isOnline = isConnected && isInternetReachable;

  return (
    <>
      <Button
        title="Sync Data"
        disabled={!isOnline}
        onPress={handleSync}
      />
      {!isOnline && (
        <Text>Cannot sync while offline</Text>
      )}
    </>
  );
}
```

## Testing

### Manual Testing

1. **Test Airplane Mode:**
   - Enable airplane mode on device/simulator
   - Verify offline indicator appears
   - Verify app still functions with cached data
   - Disable airplane mode
   - Verify offline indicator disappears

2. **Test WiFi Disconnect:**
   - Disconnect from WiFi
   - Verify offline indicator appears
   - Reconnect to WiFi
   - Verify offline indicator disappears

3. **Test No Internet Access:**
   - Connect to WiFi with no internet (or use network link conditioner)
   - Verify "Connected but No Internet Access" message shows

### E2E Testing with Maestro

Run the offline mode E2E test:
```bash
maestro test .maestro/16-offline-mode.yaml
```

## Troubleshooting

### Network State Shows as `null`

This is normal during initial app load. The network state will update once NetInfo fetches the initial state.

```typescript
const { isConnected, isInitialized } = useNetwork();

if (!isInitialized) {
  return <LoadingSpinner />;
}

// Now safe to use isConnected
```

### Offline Indicator Not Appearing

1. Check that NetworkProvider is in app tree (see `app/_layout.tsx`)
2. Verify NetInfo library is installed: `npm list @react-native-community/netinfo`
3. Check console for NetInfo errors

### Network State Not Updating

Call `refresh()` to manually update:
```typescript
const { refresh } = useNetwork();
await refresh();
```

## Dependencies

This feature requires:
- `@react-native-community/netinfo` (^11.4.1)

Installed automatically when running:
```bash
npm install
```

## Related Documentation

- [MP-7 Step 1 Implementation Summary](../MP-7_STEP_1_NETWORK_STATE_SUMMARY.md)
- [CLAUDE.md - Testing Strategy](../CLAUDE.md#testing-architecture)
- [NetInfo Documentation](https://github.com/react-native-netinfo/react-native-netinfo)

## Support

For issues or questions:
1. Check this documentation
2. Review implementation in `context/NetworkContext.tsx`
3. Check Maestro E2E test in `.maestro/16-offline-mode.yaml`
4. See CODE_REVIEW.md MP-7 section
