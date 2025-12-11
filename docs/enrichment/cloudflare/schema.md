# D1 Database Schema

This document describes the Cloudflare D1 database schema for the beer enrichment service.

## Schema File

Create `schema.sql` in your Worker project:

```sql
-- ============================================================================
-- enriched_beers: Core table storing beer enrichment data
-- ============================================================================
-- Column names match Flying Saucer API / mobile app convention for consistency
-- id = Flying Saucer beer ID (global across all locations)
CREATE TABLE IF NOT EXISTS enriched_beers (
    id TEXT PRIMARY KEY,
    brew_name TEXT NOT NULL,
    brewer TEXT,
    abv REAL,
    confidence REAL DEFAULT 0.5,
    enrichment_source TEXT DEFAULT 'perplexity',
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
    last_verified_at INTEGER DEFAULT NULL,
    is_verified INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_beer_name ON enriched_beers(brew_name);
CREATE INDEX IF NOT EXISTS idx_brewer ON enriched_beers(brewer);
CREATE INDEX IF NOT EXISTS idx_needs_enrichment ON enriched_beers(abv) WHERE abv IS NULL;

-- ============================================================================
-- system_state: Key-value store for locks and configuration
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

-- ============================================================================
-- rate_limits: Tracks requests per client per minute
-- ============================================================================
CREATE TABLE IF NOT EXISTS rate_limits (
    client_identifier TEXT NOT NULL,
    minute_bucket INTEGER NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (client_identifier, minute_bucket)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket ON rate_limits(minute_bucket);

-- ============================================================================
-- audit_log: Request tracking for debugging and security
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    api_key_hash TEXT,
    client_ip TEXT,
    user_agent TEXT,
    status_code INTEGER,
    response_time_ms INTEGER,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_log(request_id);
```

## Apply Schema

```bash
# Local development
wrangler d1 execute beer-db --local --file=./schema.sql

# Production
wrangler d1 execute beer-db --remote --file=./schema.sql
```

## Table Details

### `enriched_beers`

Stores global beer enrichment data (ABV, confidence scores). Column names match Flying Saucer API / mobile app convention.

| Column              | Type      | Description                                         |
| ------------------- | --------- | --------------------------------------------------- |
| `id`                | TEXT (PK) | Flying Saucer beer ID (global across all locations) |
| `brew_name`         | TEXT      | Beer name                                           |
| `brewer`            | TEXT      | Brewery name                                        |
| `abv`               | REAL      | Alcohol by volume (NULL if not yet enriched)        |
| `confidence`        | REAL      | Confidence score 0.0-1.0 (default 0.5)              |
| `enrichment_source` | TEXT      | Source of enrichment ('perplexity', 'manual')       |
| `updated_at`        | INTEGER   | Last update timestamp (ms since epoch)              |
| `last_verified_at`  | INTEGER   | Last verification timestamp                         |
| `is_verified`       | INTEGER   | 0/1 boolean for manual verification                 |

**Indexes:**

- `idx_beer_name` - Fast lookup by beer name
- `idx_brewery` - Fast lookup by brewery
- `idx_needs_enrichment` - Partial index for beers needing enrichment (WHERE abv IS NULL)

### `system_state`

Key-value store for system configuration and locks.

| Column       | Type      | Description                              |
| ------------ | --------- | ---------------------------------------- |
| `key`        | TEXT (PK) | State key (e.g., 'enrichment_cron_lock') |
| `value`      | TEXT      | State value                              |
| `updated_at` | INTEGER   | Last update timestamp                    |

**Used for:**

- Cron job locking (`enrichment_cron_lock`)
- Future: feature flags, configuration

### `rate_limits`

Tracks API request counts per client per minute.

| Column              | Type    | Description                                  |
| ------------------- | ------- | -------------------------------------------- |
| `client_identifier` | TEXT    | Client UUID or IP address                    |
| `minute_bucket`     | INTEGER | Minute timestamp (floor of Date.now()/60000) |
| `request_count`     | INTEGER | Number of requests in this minute            |

**Primary Key:** `(client_identifier, minute_bucket)`

**Cleanup:** Old entries (>1 hour) are probabilistically deleted (1% of requests).

### `audit_log`

Request audit trail for debugging and security analysis.

| Column             | Type         | Description                               |
| ------------------ | ------------ | ----------------------------------------- |
| `id`               | INTEGER (PK) | Auto-increment ID                         |
| `request_id`       | TEXT         | UUID for request correlation              |
| `timestamp`        | INTEGER      | Request start time (ms)                   |
| `method`           | TEXT         | HTTP method                               |
| `path`             | TEXT         | Request path                              |
| `api_key_hash`     | TEXT         | First 16 chars of SHA-256 hash of API key |
| `client_ip`        | TEXT         | Client IP address                         |
| `user_agent`       | TEXT         | User agent string                         |
| `status_code`      | INTEGER      | HTTP response status                      |
| `response_time_ms` | INTEGER      | Request duration                          |
| `error`            | TEXT         | Error message if any                      |

**Retention:** 7 days (probabilistic cleanup on 0.1% of requests)

## Data Quality Fields

The schema includes fields for tracking data quality:

- **`confidence`**: 0.0-1.0 score
  - `0.5` - Default/unknown
  - `0.7` - LLM-sourced (Perplexity)
  - `1.0` - Manually verified

- **`is_verified`**: Boolean flag for manual verification

- **`last_verified_at`**: Timestamp of last verification

### Re-enrichment Query

Find beers that might need re-verification:

```sql
SELECT * FROM enriched_beers
WHERE confidence < 0.8
  AND last_verified_at < (strftime('%s', 'now') * 1000 - 30 * 24 * 60 * 60 * 1000)
ORDER BY last_verified_at ASC
LIMIT 5;
```

## D1 Limitations

1. **Read Replicas**: D1 uses global read replicas. Writes go to primary, reads from nearest replica. Brief inconsistency possible (<1 second). For critical read-your-own-writes scenarios, use D1 Sessions API with `withSession()`.

2. **Transaction Limits**: 1MB per transaction. For large batch operations, chunk your inserts.

3. **Parameter Limits**: Maximum 100 bound parameters per query. Batch operations are chunked to 25 to stay safe.

4. **No Stored Procedures**: D1 is SQLite - no triggers, stored procedures, or advanced features.

5. **No Full-Text Search**: Implement search manually or use LIKE queries.

6. **Write Limits**: Free tier allows 100,000 row writes/day. Heavy enrichment could hit this.

7. **CPU Time Limits**: Configure `[limits] cpu_ms` in wrangler.toml for cron jobs.

## Useful Queries

```sql
-- View enrichment stats
SELECT
  COUNT(*) as total,
  COUNT(abv) as enriched,
  COUNT(*) - COUNT(abv) as pending
FROM enriched_beers;

-- View recent audit entries
SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100;

-- Find slow requests (>1 second)
SELECT * FROM audit_log WHERE response_time_ms > 1000 ORDER BY timestamp DESC;

-- Find errors
SELECT * FROM audit_log WHERE error IS NOT NULL ORDER BY timestamp DESC;

-- Rate limit violations
SELECT * FROM audit_log WHERE status_code = 429 ORDER BY timestamp DESC;

-- Requests by client (last 24 hours)
SELECT client_ip, COUNT(*) as count, AVG(response_time_ms) as avg_time
FROM audit_log
WHERE timestamp > strftime('%s', 'now') * 1000 - 86400000
GROUP BY client_ip
ORDER BY count DESC;
```
