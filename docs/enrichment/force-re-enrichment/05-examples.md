# Force Re-Enrichment: Examples & Testing

## curl Examples

### Dry Run - Preview Matches

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "criteria": { "confidence_below": 0.7 },
    "limit": 50,
    "dry_run": true
  }' \
  "https://ufobeer.your-domain.workers.dev/admin/enrich/force"
```

### Force Re-Enrich Specific Beers

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "beer_ids": ["7239443", "7239444", "7239445"]
  }' \
  "https://ufobeer.your-domain.workers.dev/admin/enrich/force"
```

### Re-Enrich Low Confidence Beers

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "criteria": { "confidence_below": 0.6 },
    "limit": 25
  }' \
  "https://ufobeer.your-domain.workers.dev/admin/enrich/force"
```

### Re-Enrich Old Perplexity Data (>30 days)

```bash
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "criteria": {
      "enrichment_source": "perplexity",
      "enrichment_older_than_days": 30
    },
    "limit": 100
  }' \
  "https://ufobeer.your-domain.workers.dev/admin/enrich/force"
```

## Example Responses

### Successful Dry Run

```json
{
  "success": true,
  "requestId": "abc123",
  "data": {
    "matched_count": 127,
    "queued_count": 50,
    "skipped_count": 0,
    "queued_ids": ["7239443", "7239444", "..."],
    "dry_run": true,
    "applied_criteria": { "confidence_below": 0.7 },
    "quota": {
      "daily": { "used": 127, "limit": 500, "remaining": 373 },
      "monthly": { "used": 842, "limit": 2000, "remaining": 1158 }
    }
  }
}
```

### Successful Execute with Skipped Beers

```json
{
  "success": true,
  "requestId": "abc123",
  "data": {
    "matched_count": 10,
    "queued_count": 8,
    "skipped_count": 2,
    "skipped_ids": ["7239450", "7239451"],
    "queued_ids": ["7239443", "7239444", "..."],
    "dry_run": false,
    "quota": {
      "daily": { "used": 135, "limit": 500, "remaining": 365 },
      "monthly": { "used": 850, "limit": 2000, "remaining": 1150 }
    }
  }
}
```

### Quota Exhausted (with quota info)

```json
{
  "success": false,
  "requestId": "abc123",
  "error": {
    "message": "Quota exhausted: daily_limit",
    "code": "QUOTA_DAILY_LIMIT"
  },
  "data": {
    "quota": {
      "daily": { "used": 500, "limit": 500, "remaining": 0 },
      "monthly": { "used": 1200, "limit": 2000, "remaining": 800 }
    }
  }
}
```

### Missing Required Field

```json
{
  "success": false,
  "requestId": "abc123",
  "error": {
    "message": "Must specify either beer_ids or criteria",
    "code": "INVALID_REQUEST_NEITHER_SPECIFIED"
  }
}
```

### Empty Criteria Error

```json
{
  "success": false,
  "requestId": "abc123",
  "error": {
    "message": "criteria cannot be empty",
    "code": "INVALID_CRITERIA_EMPTY"
  }
}
```

## Testing Checklist

### Validation Tests

- [ ] Empty body `{}` → Error: `INVALID_REQUEST_NEITHER_SPECIFIED`
- [ ] `beer_ids` only → Valid
- [ ] `criteria` only → Valid
- [ ] Both `beer_ids` and `criteria` → Error: `INVALID_REQUEST_BOTH_SPECIFIED`
- [ ] Empty `criteria: {}` → Error: `INVALID_CRITERIA_EMPTY`
- [ ] `confidence_below` at boundaries (0, 0.5, 1.0) → Valid
- [ ] Invalid `confidence_below` (-0.1, 1.1) → Error
- [ ] `enrichment_older_than_days` valid (1, 30) → Valid
- [ ] `enrichment_older_than_days` invalid (0, -1, 1.5) → Error

### Quota Tests

- [ ] Full quota available → Proceeds normally
- [ ] Daily limit at 0 → Returns 429 with quota info BEFORE clearing
- [ ] Monthly limit at 0 → Returns 429 with quota info BEFORE clearing
- [ ] Partial quota (e.g., 15 remaining, request 50) → Only processes 15

### Optimistic Locking Tests

- [ ] Beer not modified since query → Clears successfully
- [ ] Beer modified since query → Skipped (appears in `skipped_ids`)

### Blocklist Tests

- [ ] Beer matching blocklist pattern (e.g., "Sour Flight") → Skipped

### Integration Test

```bash
# 1. Find a beer with ABV
npx wrangler d1 execute ufobeer-db --remote --command \
  "SELECT id, brew_name, abv, confidence FROM enriched_beers WHERE abv IS NOT NULL LIMIT 1"

# 2. Dry run to preview
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"beer_ids": ["BEER_ID"], "dry_run": true}' \
  "https://ufobeer.your-domain.workers.dev/admin/enrich/force"

# 3. Execute (remove dry_run)
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"beer_ids": ["BEER_ID"]}' \
  "https://ufobeer.your-domain.workers.dev/admin/enrich/force"

# 4. Verify ABV is now NULL
npx wrangler d1 execute ufobeer-db --remote --command \
  "SELECT id, abv FROM enriched_beers WHERE id = 'BEER_ID'"

# 5. Verify audit log entry
npx wrangler d1 execute ufobeer-db --remote --command \
  "SELECT * FROM audit_log WHERE path = 'enrich_force' ORDER BY timestamp DESC LIMIT 1"

# 6. Wait for queue to process, then verify ABV is populated again
# (or trigger enrichment manually)
```

## Deployment

```bash
# 1. Deploy worker with new handler (no schema changes needed!)
cd /workspace/ufobeer && npx wrangler deploy

# 2. Test with dry run first
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"criteria": {"confidence_below": 0.5}, "limit": 5, "dry_run": true}' \
  "https://ufobeer.your-domain.workers.dev/admin/enrich/force"
```

## Error Recovery

**If queue sendBatch fails:** Beers are still cleared but not queued. They will be picked up by:

1. The next cron run (queries `WHERE abv IS NULL`)
2. Manual trigger via `/admin/enrich/trigger`

**If clearing partially completes:** Some beers may be cleared while others are skipped due to optimistic locking. Check `skipped_ids` in the response to see which beers were not processed.
