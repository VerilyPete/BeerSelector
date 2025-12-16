# ABV Validation Fix: Reject Implausible Values

## Problem

The `extractABV()` function in `src/index.ts` parses ABV percentages from beer descriptions. Currently it accepts any value from 0-100%, but this results in incorrect data when descriptions contain unrelated percentages like:

- "100% satisfaction guaranteed"
- "54% off"
- "Made with 100% barley"

These values (54%, 100%) are clearly not valid ABV for beer.

## Business Context

- Most beers are under 15% ABV
- The strongest commercial beers rarely exceed 15-18% ABV
- Anything over 20% is extremely unlikely to be a valid beer ABV
- Values over 20% should be left for Perplexity to determine the actual ABV

## Fix

Change the upper bound validation in `extractABV()` from `100` to `20`.

### Current Code (line 1662 and 1676)

```typescript
if (!isNaN(abv) && abv >= 0 && abv <= 100) {
```

### Fixed Code

```typescript
if (!isNaN(abv) && abv >= 0 && abv <= 20) {
```

## Files Changed

- `src/index.ts` - `extractABV()` function (2 locations)

## Data Migration

After deploying, use the force re-enrichment endpoint to fix existing bad data:

```bash
# Find and re-enrich beers with ABV > 20%
curl -X POST \
  -H "X-API-Key: $API_KEY" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"criteria": {"confidence_below": 1.0}, "limit": 100}' \
  "https://ufobeer.your-domain.workers.dev/admin/enrich/force"
```

Note: You'll need to manually query for ABV > 20 first since there's no criteria filter for that. Consider adding a direct SQL fix:

```sql
-- Find bad records
SELECT id, brew_name, abv FROM enriched_beers WHERE abv > 20;

-- Clear them for re-enrichment
UPDATE enriched_beers
SET abv = NULL, confidence = NULL, enrichment_source = NULL, updated_at = ?
WHERE abv > 20;
```

## Testing

After deployment, verify new beers with descriptions containing high percentages are NOT assigned those values and instead have NULL ABV (queued for Perplexity).
