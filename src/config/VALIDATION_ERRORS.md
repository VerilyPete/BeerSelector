# Configuration Validation Errors

This document lists all possible configuration validation errors and how to fix them.

## URL Validation Errors

### InvalidUrlError: URL cannot be empty

**Cause**: Attempted to set an empty URL string.

**Example**:
```typescript
config.setCustomApiUrl('');
```

**Error Message**:
```
Invalid API base URL: URL cannot be empty. Must start with http:// or https://.
```

**Solution**: Provide a valid HTTP or HTTPS URL.

### InvalidUrlError: Must start with http:// or https://

**Cause**: URL doesn't have a valid protocol prefix.

**Example**:
```typescript
config.setCustomApiUrl('example.com');
config.setCustomApiUrl('ftp://example.com');
```

**Error Message**:
```
Invalid API base URL: "example.com". Must start with http:// or https://. Example: https://example.com
```

**Solution**: Add http:// or https:// prefix to your URL.

### InvalidUrlError: URL must include a domain name

**Cause**: URL has only the protocol without a domain.

**Example**:
```typescript
config.setCustomApiUrl('https://');
```

**Error Message**:
```
Invalid API base URL: "https://". URL must include a domain name. Example: https://example.com
```

**Solution**: Provide a complete URL with domain name.

### InvalidUrlError: URL cannot contain spaces

**Cause**: URL has unencoded spaces.

**Example**:
```typescript
config.setCustomApiUrl('https://my api.com');
```

**Error Message**:
```
Invalid API base URL: "https://my api.com". URL cannot contain spaces. Use proper URL encoding for special characters.
```

**Solution**: Remove spaces or use URL encoding (%20).

### InvalidUrlError: URL is malformed

**Cause**: URL has invalid characters or structure.

**Example**:
```typescript
config.setCustomApiUrl('https:///example.com');
```

**Error Message**:
```
Invalid API base URL: "https:///example.com". URL is malformed. Must be a valid HTTP or HTTPS URL. Example: https://api.example.com
```

**Solution**: Check URL syntax and fix malformed parts.

---

## Network Configuration Errors

### InvalidNetworkConfigError: Invalid timeout value

**Cause**: API timeout is not between 1ms and 60000ms (1 minute).

**Environment Variable**: `EXPO_PUBLIC_API_TIMEOUT`

**Valid Range**: 1 - 60000 (milliseconds)

**Examples**:
```bash
# Too small
EXPO_PUBLIC_API_TIMEOUT=0

# Too large
EXPO_PUBLIC_API_TIMEOUT=61000

# Negative
EXPO_PUBLIC_API_TIMEOUT=-1000
```

**Error Message**:
```
Invalid timeout value: 61000ms. Must be between 1 and 60000 (1 minute max). Check EXPO_PUBLIC_API_TIMEOUT environment variable.
```

**Solution**: Set a timeout between 1 and 60000 milliseconds. Default is 15000 (15 seconds).

**Recommended Values**:
- Development/Testing: 30000 (30 seconds)
- Production: 15000 (15 seconds)
- Fast APIs: 5000 (5 seconds)

---

### InvalidNetworkConfigError: Invalid retries value

**Cause**: Retry count is not between 0 and 5.

**Environment Variable**: `EXPO_PUBLIC_API_RETRIES`

**Valid Range**: 0 - 5

**Examples**:
```bash
# Too many retries
EXPO_PUBLIC_API_RETRIES=10

# Negative
EXPO_PUBLIC_API_RETRIES=-1
```

**Error Message**:
```
Invalid retries value: 10. Must be between 0 and 5. Check EXPO_PUBLIC_API_RETRIES environment variable.
```

**Solution**: Set retries between 0 (no retries) and 5. Default is 3.

**Recommended Values**:
- Unreliable networks: 5
- Normal usage: 3
- Fast-fail scenarios: 0 or 1

---

### InvalidNetworkConfigError: Invalid retry delay value

**Cause**: Retry delay is not between 1ms and 10000ms (10 seconds).

**Environment Variable**: `EXPO_PUBLIC_API_RETRY_DELAY`

**Valid Range**: 1 - 10000 (milliseconds)

**Examples**:
```bash
# Too long
EXPO_PUBLIC_API_RETRY_DELAY=11000

# Zero delay
EXPO_PUBLIC_API_RETRY_DELAY=0

# Negative
EXPO_PUBLIC_API_RETRY_DELAY=-500
```

**Error Message**:
```
Invalid retry delay value: 11000ms. Must be between 1 and 10000 (10 seconds max). Check EXPO_PUBLIC_API_RETRY_DELAY environment variable.
```

**Solution**: Set retry delay between 1 and 10000 milliseconds. Default is 1000 (1 second).

**Recommended Values**:
- Quick retries: 500 (0.5 seconds)
- Standard: 1000 (1 second)
- Slow retries: 3000 (3 seconds)

---

## Environment Validation Errors

### InvalidEnvironmentError: Invalid environment

**Cause**: Attempted to set an invalid environment name.

**Environment Variable**: `EXPO_PUBLIC_DEFAULT_ENV`

**Valid Values**: 'development', 'staging', 'production'

**Examples**:
```typescript
config.setEnvironment('test'); // Invalid
config.setEnvironment('PRODUCTION'); // Invalid (case-sensitive)
config.setEnvironment(''); // Invalid (empty)
```

**Error Message**:
```
Invalid environment: "test". Must be one of: development, staging, production. Set EXPO_PUBLIC_DEFAULT_ENV or use config.setEnvironment().
```

**Solution**: Use one of the three valid environment names (case-sensitive).

**Valid Examples**:
```typescript
config.setEnvironment('development'); // ✅
config.setEnvironment('staging');     // ✅
config.setEnvironment('production');  // ✅
```

---

## Error Handling in Code

### Catching Configuration Errors

```typescript
import {
  InvalidUrlError,
  InvalidNetworkConfigError,
  InvalidEnvironmentError,
  ConfigurationError
} from '@/src/config/config';

try {
  config.setCustomApiUrl(userProvidedUrl);
} catch (error) {
  if (error instanceof InvalidUrlError) {
    console.error('Invalid URL provided:', error.message);
    // Show user-friendly message
  } else if (error instanceof ConfigurationError) {
    console.error('Configuration error:', error.message);
  }
}
```

### Validating Before Setting

```typescript
// Check if URL looks valid before setting
function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\/.+/.test(url);
}

if (isValidHttpUrl(userUrl)) {
  config.setCustomApiUrl(userUrl);
} else {
  showError('Please enter a valid HTTP or HTTPS URL');
}
```

---

## Environment Variables Quick Reference

| Variable | Type | Valid Range | Default | Description |
|----------|------|-------------|---------|-------------|
| `EXPO_PUBLIC_API_BASE_URL` | URL | Valid HTTP/HTTPS | See below | Generic API base URL |
| `EXPO_PUBLIC_DEV_API_BASE_URL` | URL | Valid HTTP/HTTPS | Production URL | Development API URL |
| `EXPO_PUBLIC_STAGING_API_BASE_URL` | URL | Valid HTTP/HTTPS | Production URL | Staging API URL |
| `EXPO_PUBLIC_PROD_API_BASE_URL` | URL | Valid HTTP/HTTPS | `https://tapthatapp.beerknurd.com` | Production API URL |
| `EXPO_PUBLIC_API_TIMEOUT` | Number | 1-60000 (ms) | 15000 | Request timeout |
| `EXPO_PUBLIC_API_RETRIES` | Number | 0-5 | 3 | Number of retries |
| `EXPO_PUBLIC_API_RETRY_DELAY` | Number | 1-10000 (ms) | 1000 | Delay between retries |
| `EXPO_PUBLIC_DEFAULT_ENV` | String | See below | production | Default environment |
| `EXPO_PUBLIC_UNTAPPD_BASE_URL` | URL | Valid HTTPS | `https://untappd.com` | Untappd base URL |

**Valid Environment Names**: `development`, `staging`, `production`

---

## Testing with Invalid Configuration

For testing purposes, you can catch validation errors:

```typescript
describe('My Component', () => {
  it('should handle invalid config gracefully', () => {
    // Set invalid config
    process.env.EXPO_PUBLIC_API_TIMEOUT = '-1000';

    // This will throw InvalidNetworkConfigError
    expect(() => {
      const network = config.network;
    }).toThrow();
  });
});
```

---

## Common Scenarios

### Scenario 1: Local Development with Mock Server

```bash
# .env.development
EXPO_PUBLIC_DEV_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_API_TIMEOUT=30000
EXPO_PUBLIC_API_RETRIES=1
```

### Scenario 2: Unreliable Network

```bash
# .env
EXPO_PUBLIC_API_TIMEOUT=30000
EXPO_PUBLIC_API_RETRIES=5
EXPO_PUBLIC_API_RETRY_DELAY=2000
```

### Scenario 3: Fast-Fail Production

```bash
# .env.production
EXPO_PUBLIC_PROD_API_BASE_URL=https://api.production.com
EXPO_PUBLIC_API_TIMEOUT=10000
EXPO_PUBLIC_API_RETRIES=2
EXPO_PUBLIC_API_RETRY_DELAY=500
```

---

## Best Practices

1. **Always use HTTPS in production**: Set `EXPO_PUBLIC_PROD_API_BASE_URL` to an HTTPS URL.

2. **Set reasonable timeouts**: Don't set timeout too high (user waits too long) or too low (requests fail unnecessarily).

3. **Limit retries**: More than 3-5 retries usually indicates a bigger problem.

4. **Use environment-specific URLs**: Set different base URLs for each environment using environment-specific variables.

5. **Validate user input**: If accepting URLs from users, validate them before passing to config.

6. **Handle errors gracefully**: Catch configuration errors and show helpful messages to users.

7. **Test error cases**: Write tests that verify your app handles invalid configuration correctly.

---

## Support

If you encounter validation errors that aren't covered here, check:

1. The error message itself (it includes helpful suggestions)
2. The `src/config/__tests__/configValidation.test.ts` file for examples
3. The `src/config/config.ts` file for validation logic
