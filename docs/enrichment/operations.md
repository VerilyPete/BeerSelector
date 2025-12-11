# Operations Guide

This document covers deployment, monitoring, rollback, and security for the beer enrichment service.

## Deployment

### Initial Deployment

```bash
cd ufobeer

# 1. Apply database schema
wrangler d1 execute beer-db --remote --file=./schema.sql

# 2. Set secrets
wrangler secret put FLYING_SAUCER_API_BASE
wrangler secret put PERPLEXITY_API_KEY
wrangler secret put API_KEY

# 3. Deploy Worker
wrangler deploy

# 4. Verify health endpoint
curl https://ufobeer.ufobeer.workers.dev/health
```

### Subsequent Deployments

```bash
# Deploy code changes
wrangler deploy

# Apply schema changes (if any)
wrangler d1 execute beer-db --remote --file=./schema.sql
```

### Migration Path

1. **Deploy Worker**: `wrangler deploy`
2. **Test**: Verify `/health` endpoint returns `{"status":"ok","database":"connected"}`
3. **Add to App**: Update `.env` with enrichment service URL and API key
4. **Create Integration**: Add `enrichmentService.ts` to your React Native app
5. **Gradual Rollout**: Start by only using enrichment data for display, not storage
6. **Monitor**: Check Cloudflare dashboard for errors and usage
7. **Iterate**: Adjust based on data quality feedback

## Rollback Procedure

### Worker Rollback

```bash
# Rollback to previous version
wrangler rollback

# Or deploy a specific version
wrangler deploy --version <version-id>
```

### Emergency Actions

| Issue                        | Action                                     |
| ---------------------------- | ------------------------------------------ |
| Worker errors                | `wrangler rollback` to previous version    |
| D1 corruption                | Restore from Cloudflare auto-backup        |
| Mobile app issues            | Feature flag to disable enrichment         |
| Block all requests           | Remove `ALLOWED_ORIGIN` from vars          |
| Rate limiting too aggressive | Increase `RATE_LIMIT_RPM` in wrangler.toml |
| Perplexity costs too high    | Comment out cron trigger temporarily       |

### D1 Schema Rollback

D1 schema changes should be backward compatible. Avoid destructive migrations.

If needed:

```bash
# Export current data
wrangler d1 execute beer-db --remote --command "SELECT * FROM enriched_beers" > backup.json

# Apply rollback schema
wrangler d1 execute beer-db --remote --file=./rollback.sql
```

### Mobile App Rollback

Add a feature flag to disable enrichment:

```typescript
// In config
const ENRICHMENT_ENABLED = process.env.EXPO_PUBLIC_ENRICHMENT_ENABLED !== 'false';

// In fetchAllBeers
if (!ENRICHMENT_ENABLED) {
  return fetchBeersDirectFromFlyingSaucer(storeId);
}
```

## Monitoring

### Cloudflare Dashboard

Access via [dash.cloudflare.com](https://dash.cloudflare.com):

- **Workers**: Request counts, errors, latency
- **D1**: Read/write usage, storage
- **Logs**: Real-time log streaming

### Real-Time Logs

```bash
# Stream live logs
wrangler tail

# Filter by status
wrangler tail --format=json | jq 'select(.outcome == "exception")'
```

### Request Tracing

Every response includes an `X-Request-ID` header. Use this to:

- Correlate client-side errors with server logs
- Track requests through the audit log
- Debug issues reported by users

### Audit Log Queries

```sql
-- View recent requests
SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 100;

-- Find slow requests (>1 second)
SELECT * FROM audit_log WHERE response_time_ms > 1000 ORDER BY timestamp DESC;

-- Find errors
SELECT * FROM audit_log WHERE error IS NOT NULL ORDER BY timestamp DESC;

-- Requests by client (last 24 hours)
SELECT client_ip, COUNT(*) as count, AVG(response_time_ms) as avg_time
FROM audit_log
WHERE timestamp > strftime('%s', 'now') * 1000 - 86400000
GROUP BY client_ip
ORDER BY count DESC;

-- Rate limit violations
SELECT * FROM audit_log WHERE status_code = 429 ORDER BY timestamp DESC;

-- Request distribution by endpoint
SELECT path, COUNT(*) as count
FROM audit_log
WHERE timestamp > strftime('%s', 'now') * 1000 - 86400000
GROUP BY path;
```

### Enrichment Stats

```sql
-- Overall enrichment status
SELECT
  COUNT(*) as total,
  COUNT(abv) as enriched,
  COUNT(*) - COUNT(abv) as pending,
  ROUND(COUNT(abv) * 100.0 / COUNT(*), 1) as percent_enriched
FROM enriched_beers;

-- Enrichment by confidence level
SELECT
  CASE
    WHEN confidence >= 0.9 THEN 'high'
    WHEN confidence >= 0.7 THEN 'medium'
    ELSE 'low'
  END as confidence_level,
  COUNT(*) as count
FROM enriched_beers
WHERE abv IS NOT NULL
GROUP BY confidence_level;

-- Recently enriched beers
SELECT id, brew_name, abv, confidence, updated_at
FROM enriched_beers
WHERE abv IS NOT NULL
ORDER BY updated_at DESC
LIMIT 10;
```

### Alerts Setup

Set up alerts in Cloudflare for:

| Metric              | Threshold  | Action                              |
| ------------------- | ---------- | ----------------------------------- |
| Error rate          | > 5%       | Investigate logs, consider rollback |
| Request count       | > 80k/day  | Approaching free tier limit         |
| D1 writes           | > 80k/day  | Approaching free tier limit         |
| 429 responses       | > 100/hour | Rate limit may be too aggressive    |
| Response time (p95) | > 2s       | Performance degradation             |

### Logpush (Optional)

For production, enable Cloudflare Logpush to send logs to:

- Datadog
- Splunk
- S3/R2
- BigQuery

## Security Checklist

- [x] API key authentication with timing-safe comparison
- [x] Health endpoint is public (for monitoring) with DB status
- [x] CORS fails explicitly if not configured (no wildcard fallback)
- [x] Secrets stored securely via `wrangler secret`
- [x] Input validation on batch endpoint (max 100 IDs)
- [x] Prompt injection prevention via input sanitization
- [x] Flying Saucer API response validation with type guards
- [x] Rate limiting with configurable limits per minute (per client)
- [x] Request audit logging with 7-day retention
- [x] Request IDs for log correlation and debugging
- [x] Cron job locking to prevent duplicate runs
- [x] Store ID validation against whitelist

### Security Best Practices

1. **Rotate API keys periodically**

   ```bash
   # Generate new key
   openssl rand -hex 32

   # Update secret
   wrangler secret put API_KEY

   # Update mobile app env vars
   ```

2. **Review audit logs weekly** for anomalies

3. **Monitor rate limit violations** for potential abuse

4. **Keep Wrangler updated** for security patches
   ```bash
   npm update -g wrangler
   ```

## Alternative Enrichment Sources

If Perplexity API costs are a concern:

| Source                    | Pros               | Cons                                  |
| ------------------------- | ------------------ | ------------------------------------- |
| **Untappd API**           | Reliable beer data | Requires API approval, 100 calls/hour |
| **BeerAdvocate scraping** | Free               | Maintenance burden, robots.txt        |
| **Open Brewery DB**       | Free API           | Brewery info only, not beers          |
| **Manual curation**       | High accuracy      | Time-intensive                        |

## Troubleshooting

### Common Issues

**Worker not responding**

```bash
# Check deployment status
wrangler deployments list

# Check logs for errors
wrangler tail --format=json | jq 'select(.outcome != "ok")'
```

**D1 connection errors**

```bash
# Test D1 connectivity
wrangler d1 execute beer-db --remote --command "SELECT 1"
```

**Cron not running**

```bash
# Check cron configuration
cat wrangler.toml | grep -A2 triggers

# View cron logs
wrangler tail --format=json | jq 'select(.scriptName | contains("scheduled"))'
```

**Rate limiting too aggressive**

```toml
# In wrangler.toml, increase limit
[vars]
RATE_LIMIT_RPM = "120"  # Increase from 60
```

**CORS errors**

```toml
# Verify ALLOWED_ORIGIN matches exactly (including protocol)
[vars]
ALLOWED_ORIGIN = "https://ufobeer.app"  # No trailing slash
```
