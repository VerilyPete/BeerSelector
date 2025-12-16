# Force Re-Enrichment: Overview

## Purpose

Add `POST /admin/enrich/force` endpoint to allow re-enriching beers that already have ABV data.

**Use cases:**

- Fixing incorrect ABV values
- Re-processing low-confidence enrichments
- Refreshing stale data
- Testing enrichment pipeline changes

## How It Works

1. **Query** beers matching criteria (by IDs or filters)
2. **Clear** their ABV/confidence/enrichment_source fields
3. **Queue** them for the existing enrichment pipeline

The key insight: clearing ABV makes beers eligible for normal enrichment processing.

## API Endpoint

```
POST /admin/enrich/force
```

**Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `X-API-Key` | Yes | API key |
| `X-Admin-Secret` | Yes | Admin secret |
| `Content-Type` | Yes | `application/json` |

## Request Modes

**Mode 1: By specific IDs** (required: at least one mode)

```json
{
  "beer_ids": ["7239443", "7239444"],
  "dry_run": true
}
```

**Mode 2: By criteria** (required: at least one mode)

```json
{
  "criteria": {
    "confidence_below": 0.7,
    "enrichment_older_than_days": 30,
    "enrichment_source": "perplexity"
  },
  "limit": 50,
  "dry_run": true
}
```

**IMPORTANT:** Must specify either `beer_ids` OR `criteria`. Empty body is NOT allowed.

## Safety Features

| Feature                | Description                                        |
| ---------------------- | -------------------------------------------------- |
| **Quota pre-check**    | Checks remaining quota BEFORE clearing any records |
| **Optimistic locking** | Prevents overwriting concurrent imports            |
| **Audit logging**      | All operations logged with admin_id                |
| **Dry run mode**       | Preview matches without making changes             |
| **Blocklist**          | Respects existing enrichment blocklist             |

## Implementation Files

All changes go into `src/index.ts`. Implementation order:

| Step | Document                 | What to Add                                          |
| ---- | ------------------------ | ---------------------------------------------------- |
| 1    | `02-types-validation.md` | TypeScript types + validation function               |
| 2    | `03-helpers.md`          | `getEnrichmentQuotaStatus()` + query + clear helpers |
| 3    | `04-handler.md`          | Main handler + route registration                    |
| 4    | `05-examples.md`         | Test the implementation                              |

## Existing Dependencies

These functions/constants already exist in `src/index.ts` and should be reused:

| Name                                                    | Location    | Purpose                                        |
| ------------------------------------------------------- | ----------- | ---------------------------------------------- |
| `shouldSkipEnrichment(brewName)`                        | ~line 70    | Blocklist filter for flights, root beer, etc.  |
| `writeAdminAuditLog(db, ctx, operation, details, hash)` | ~line 324   | Audit logging (details logged to console only) |
| `authorizeAdmin(request, env)`                          | ~line 291   | Returns `{ authorized, adminSecretHash }`      |
| `ENRICHMENT_QUEUE`                                      | Env binding | Queue for enrichment messages                  |

## Related Documents

- `01-schema.md` - Database schema (no changes needed)
- `02-types-validation.md` - TypeScript types and validation
- `03-helpers.md` - Query, quota, and clear helpers
- `04-handler.md` - Main handler implementation
- `05-examples.md` - curl examples and testing
