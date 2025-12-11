# Perplexity API Integration

This document covers the integration of Perplexity API for beer ABV enrichment in our Cloudflare Worker.

## Overview

We use Perplexity's Sonar API to automatically look up ABV (Alcohol By Volume) data for beers that don't have this information in the Flying Saucer API. Perplexity performs web searches to find accurate ABV percentages from reliable sources like brewery websites, Untappd, Beer Advocate, and other beer databases.

**Why Perplexity?**

- Real-time web search capabilities for up-to-date beer data
- Structured JSON output ensures reliable, parseable responses
- Cost-effective pricing for our use case
- Good accuracy for beer-specific queries

## API Configuration

### Endpoint

```
POST https://api.perplexity.ai/chat/completions
```

### Authentication

Authentication uses a Bearer token passed in the `Authorization` header:

```typescript
headers: {
  'Authorization': `Bearer ${env.PERPLEXITY_API_KEY}`,
  'Content-Type': 'application/json'
}
```

The API key is stored as an environment variable (`PERPLEXITY_API_KEY`) in the Cloudflare Worker configuration.

### Model Selection

We use the **`sonar`** model (base tier) for ABV lookups:

```typescript
{
  model: 'sonar',
  // ...
}
```

**Why Sonar (not Sonar Pro)?**

- ABV lookup is a simple factual query that doesn't require deep reasoning
- Base Sonar model provides sufficient accuracy at lower cost
- Faster response times for simple queries
- Lower token costs ($1/1M vs $3/1M input)

## Request Format

### Prompt Structure

We use a two-message conversation pattern:

```typescript
messages: [
  {
    role: 'system',
    content: 'You are a beer database assistant that searches for beer ABV information.',
  },
  {
    role: 'user',
    content: `Find the ABV percentage for the beer "${safeName}"${brewerContext}. Search for this specific beer.`,
  },
];
```

**Components:**

- **System message**: Establishes the assistant's role and domain expertise
- **User message**: Provides the specific beer name and brewer (if available)
- **Brewer context**: Included when available to improve search accuracy (e.g., "by Sierra Nevada")

### Input Sanitization

To prevent prompt injection attacks, all user inputs are sanitized before being included in prompts:

```typescript
function sanitizeForPrompt(input: string): string {
  return input
    .replace(/["\n\r\t\\]/g, ' ') // Remove quotes, newlines, escapes
    .replace(/\s+/g, ' ') // Collapse whitespace
    .substring(0, 200) // Limit length
    .trim();
}
```

This sanitization:

- Removes control characters that could break JSON or inject prompts
- Prevents excessively long inputs
- Collapses multiple spaces into single spaces
- Trims leading/trailing whitespace

### Structured Output Format

We use Perplexity's `response_format` feature with JSON schema to ensure reliable, structured responses:

```typescript
response_format: {
  type: 'json_schema',
  json_schema: {
    schema: {
      type: 'object',
      properties: {
        abv: {
          type: ['number', 'null'],
          description: 'ABV percentage as a number (e.g., 5.2), or null if not found'
        },
        source: {
          type: 'string',
          description: 'Where the ABV data was found'
        }
      },
      required: ['abv']
    }
  }
}
```

This schema:

- **Guarantees JSON output**: No need to parse natural language responses
- **Type safety**: Ensures `abv` is either a number or null
- **Source tracking**: Provides provenance for the ABV data (though we don't currently store this)
- **Required fields**: `abv` must always be present in the response

## Response Parsing

### Expected Response Structure

Perplexity returns responses in this format:

```json
{
  "choices": [
    {
      "message": {
        "content": "{\"abv\": 5.2, \"source\": \"brewery website\"}"
      }
    }
  ]
}
```

The actual data is in `choices[0].message.content` as a JSON string.

### Extraction Logic

Our parsing logic handles various edge cases:

````typescript
// 1. Extract content from response
const content = data.choices[0].message.content;

// 2. Clean markdown code fences (sometimes Perplexity adds these)
let cleanContent = content
  .replace(/```(?:json)?\s*/gi, '') // Remove opening code fence
  .replace(/```/g, '') // Remove closing code fence
  .trim();

// 3. Extract JSON object (defensive parsing)
const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  return null; // No JSON found
}

// 4. Parse JSON
const json = JSON.parse(jsonMatch[0]);

// 5. Validate ABV value
if (typeof json.abv === 'number' && json.abv >= 0 && json.abv <= 100) {
  return Math.round(json.abv * 10) / 10; // Round to 1 decimal place
}

return null; // Invalid or missing ABV
````

### Handling Null/Not Found Cases

If Perplexity cannot find ABV data, it returns:

```json
{
  "abv": null,
  "source": "not found"
}
```

Our code returns `null` in these cases:

- `json.abv` is null
- `json.abv` is not a number
- `json.abv` is outside the valid range (0-100%)
- JSON parsing fails
- Response structure is unexpected

**Important**: We never store null ABV values in the database. The record remains with `abv = NULL`, allowing future enrichment attempts.

## Rate Limiting

### Perplexity API Limits (2025)

Perplexity uses a **usage tier system** based on cumulative spending:

| Tier        | Spending Threshold | Sonar RPM | Sonar Pro RPM | Deep Research RPM |
| ----------- | ------------------ | --------- | ------------- | ----------------- |
| 0 (Starter) | $0 (new accounts)  | 50        | 50            | 5                 |
| 1           | $50                | 50        | 50            | 10                |
| 2           | $250               | 500       | 500           | 20                |
| 3           | $500               | 1000      | 1000          | 40                |
| 4           | $1000              | 2000      | 2000          | 60                |
| 5           | $5000+             | 2000      | 2000          | 100               |

**RPM** = Requests Per Minute

**Our current tier**: Tier 0 (starter) with **50 RPM** for Sonar model.

Perplexity uses a **leaky bucket algorithm** for rate limiting, which allows burst traffic while maintaining long-term rate control.

### Worker Queue Configuration

Our Cloudflare Worker cron job respects these limits through conservative configuration:

```typescript
// In scheduled() cron handler
const { results } = await env.DB.prepare(
  `SELECT id, brew_name, brewer FROM enriched_beers
   WHERE abv IS NULL
   ORDER BY updated_at ASC
   LIMIT 10` // Process only 10 beers per run
).all<EnrichedBeerRow>();

// Rate limit: 1500ms between requests
await new Promise(r => setTimeout(r, 1500));
```

**Current settings:**

- **Batch size**: 10 beers per cron run
- **Delay between requests**: 1500ms (1.5 seconds)
- **Effective rate**: ~40 requests per minute (well under 50 RPM limit)

**Why conservative?**

- Allows headroom for other API consumers
- Prevents hitting rate limits during traffic spikes
- Provides buffer for retry attempts
- Leaves capacity for manual/on-demand enrichment

### Adjusting for Higher Tiers

As spending increases and usage tier upgrades:

| Tier | RPM Limit | Max Batch Size | Delay Between Requests |
| ---- | --------- | -------------- | ---------------------- |
| 0-1  | 50        | 10             | 1500ms                 |
| 2    | 500       | 100            | 150ms                  |
| 3    | 1000      | 200            | 75ms                   |
| 4-5  | 2000      | 400            | 40ms                   |

**To adjust configuration:**

1. Update `LIMIT` in the SQL query (batch size)
2. Update `setTimeout` delay between requests
3. Consider splitting batches across multiple cron runs

## Error Handling

### 429 Rate Limit Responses

When Perplexity returns HTTP 429 (Too Many Requests), we implement exponential backoff:

```typescript
if (response.status === 429) {
  const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
  log(
    'warn',
    'Rate limited by Perplexity, backing off',
    {
      attempt,
      waitTimeMs: waitTime,
    },
    requestId
  );
  await new Promise(r => setTimeout(r, waitTime));
  continue; // Retry
}
```

**Backoff schedule:**

- Attempt 1: Wait 1 second
- Attempt 2: Wait 2 seconds
- Attempt 3: Wait 4 seconds (final attempt)

### Network Errors

Network failures (timeouts, connection errors) trigger retry logic:

```typescript
async function fetchAbvFromSource(
  brew_name: string,
  brewer: string | null,
  env: Env,
  requestId: string,
  retries = 3 // 3 attempts total
): Promise<number | null>;
```

Between retry attempts, we use linear backoff:

```typescript
await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
// Attempt 0→1: 1s wait
// Attempt 1→2: 2s wait
```

### Invalid Responses

If Perplexity returns data we can't parse or validate:

```typescript
log(
  'error',
  'Failed to parse Perplexity JSON response',
  {
    content: content.substring(0, 200), // Log first 200 chars
    error: String(parseError),
  },
  requestId
);
return null; // Skip this beer
```

**Logged cases:**

- Malformed JSON in response
- Missing `choices` array
- Missing `content` field
- ABV value outside valid range (0-100%)
- Type errors (e.g., ABV is a string)

**Result**: Beer remains in enrichment queue (`abv = NULL`) and will be retried in a future cron run.

## Cost Estimation

### Perplexity Pricing (2025)

**Sonar Model:**

- **Input tokens**: $1 per 1M tokens
- **Output tokens**: $1 per 1M tokens
- **Request fee**: $5 per 1,000 requests (low context)

**Total cost formula:**

```
Cost = (Input Tokens × $1/1M) + (Output Tokens × $1/1M) + (Requests × $5/1000)
```

### Typical Beer Query Costs

**Example query:**

```
System: "You are a beer database assistant..." (12 tokens)
User: "Find the ABV for Pliny the Elder by Russian River" (15 tokens)
Total input: ~27 tokens

Response: {"abv": 8.0, "source": "russianriverbrewing.com"} (15 tokens)
Total output: ~15 tokens
```

**Cost per query:**

```
Input: 27 tokens × $1/1M = $0.000027
Output: 15 tokens × $1/1M = $0.000015
Request fee: $5/1000 = $0.005
Total: ~$0.005042 per beer
```

**Request fee dominates**: The $5/1K request fee is ~99% of the cost. Token costs are negligible.

### Monthly Cost Projection

**Scenario 1: Initial database backfill (10,000 beers)**

```
Beers: 10,000
Cost per beer: $0.005
Total: $50
Timeline: ~1 week at 50 RPM (Tier 0)
```

**Scenario 2: Ongoing maintenance (100 new beers/month)**

```
Beers: 100
Cost per beer: $0.005
Total: $0.50/month
```

**Scenario 3: Full catalog enrichment (50,000 beers across all stores)**

```
Beers: 50,000
Cost per beer: $0.005
Total: $250
Timeline: ~1 month at 50 RPM, or 1 week at 500 RPM (Tier 2)
```

### Cost Optimization Tips

1. **Batch wisely**: Don't re-enrich beers that already have ABV data
2. **Filter duplicates**: Same beer ID appears at multiple stores—enrich once
3. **Cache aggressively**: Store enrichment data globally by beer ID
4. **Prioritize popular beers**: Enrich high-demand beers first
5. **Use confidence scores**: Skip re-enrichment of high-confidence data
6. **Monitor failed requests**: Don't retry beers that consistently fail
7. **Consider tier upgrades**: If processing large volumes, Tier 2 ($250 spend) gives 10x rate limit for 5x cost

## Confidence Score Mapping

### Default Confidence for LLM-Sourced Data

All ABV data from Perplexity is stored with a **default confidence of 0.7** (70%):

```typescript
if (abv !== null) {
  await env.DB.prepare(
    `UPDATE enriched_beers
     SET abv = ?, confidence = 0.7, updated_at = ?, last_verified_at = ?
     WHERE id = ?`
  )
    .bind(abv, Date.now(), Date.now(), row.id)
    .run();
}
```

### Confidence Score Scale (0.0 - 1.0)

| Score   | Meaning             | Source Example                                                  |
| ------- | ------------------- | --------------------------------------------------------------- |
| 0.9-1.0 | Verified            | Official brewery API, manual verification                       |
| 0.7-0.9 | High confidence     | Perplexity with brewery website source                          |
| 0.5-0.7 | Medium confidence   | Perplexity with aggregator site source (Untappd, Beer Advocate) |
| 0.3-0.5 | Low confidence      | User-submitted data, unverified sources                         |
| 0.0-0.3 | Very low confidence | Conflicting data, uncertain sources                             |

### Current Implementation

**All Perplexity data = 0.7**: We currently use a fixed confidence score because:

- Perplexity doesn't provide reliability metadata
- The `source` field in responses is not parsed or analyzed
- Web search results are generally reliable for well-known beers

### Future Enhancements

**Dynamic confidence scoring** could be implemented based on:

1. **Source analysis**: Parse the `source` field from Perplexity responses

   ```typescript
   if (source.includes('brewery') || source.includes('official')) {
     confidence = 0.85;
   } else if (source.includes('untappd') || source.includes('beeradvocate')) {
     confidence = 0.7;
   } else {
     confidence = 0.6;
   }
   ```

2. **Response consistency**: Check if ABV appears in multiple search results

   ```typescript
   // Prompt Perplexity to list multiple sources
   // Compare ABV values across sources
   // Higher confidence if values match
   ```

3. **Verification flags**: Mark certain beers as manually verified

   ```typescript
   // Set confidence = 1.0 and is_verified = true
   // These never get re-enriched
   ```

4. **Age-based decay**: Reduce confidence over time for old data
   ```typescript
   const ageInMonths = (Date.now() - last_verified_at) / (30 * 24 * 60 * 60 * 1000);
   const decayedConfidence = baseConfidence * Math.exp(-0.1 * ageInMonths);
   ```

### When to Use Higher/Lower Confidence

**Use higher confidence (0.85-0.95) when:**

- Data comes directly from brewery APIs
- Multiple independent sources agree
- Data has been manually verified
- Source is known to be authoritative

**Use lower confidence (0.5-0.6) when:**

- Sources conflict or are unclear
- Beer is rare or obscure (fewer data sources)
- Data comes from user-generated content
- Perplexity indicates uncertainty in response

**Flag for manual review when:**

- Confidence < 0.5
- Multiple failed enrichment attempts
- ABV value seems unrealistic (e.g., > 20% for non-barleywine styles)
- Conflicting data from different sources

## Example Code

The complete implementation is in `/workspace/BeerSelector/docs/enrichment/cloudflare/worker.md`, specifically the `fetchAbvFromSource` function (lines 854-979).

### Key Implementation Snippet

```typescript
async function fetchAbvFromSource(
  brew_name: string,
  brewer: string | null,
  env: Env,
  requestId: string,
  retries = 3
): Promise<number | null> {
  // Sanitize inputs
  const safeName = sanitizeForPrompt(brew_name);
  const safeBrewer = brewer ? sanitizeForPrompt(brewer) : null;
  const brewerContext = safeBrewer ? ` by ${safeBrewer}` : '';

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            {
              role: 'system',
              content: 'You are a beer database assistant that searches for beer ABV information.',
            },
            {
              role: 'user',
              content: `Find the ABV percentage for the beer "${safeName}"${brewerContext}. Search for this specific beer.`,
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              schema: {
                type: 'object',
                properties: {
                  abv: {
                    type: ['number', 'null'],
                    description: 'ABV percentage as a number (e.g., 5.2), or null if not found',
                  },
                  source: {
                    type: 'string',
                    description: 'Where the ABV data was found',
                  },
                },
                required: ['abv'],
              },
            },
          },
        }),
      });

      // Handle rate limiting with exponential backoff
      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Perplexity API returned ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Parse and validate JSON response
      const json = JSON.parse(content);

      if (typeof json.abv === 'number' && json.abv >= 0 && json.abv <= 100) {
        return Math.round(json.abv * 10) / 10; // Round to 1 decimal
      }

      return null;
    } catch (error) {
      if (attempt === retries - 1) {
        log(
          'error',
          `Failed to enrich after ${retries} attempts`,
          {
            name: safeName,
            error: String(error),
          },
          requestId
        );
        return null;
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }

  return null;
}
```

## Related Documentation

- **[Worker Code](worker.md)** - Complete Cloudflare Worker source code
- **[Database Schema](../database-schema.md)** - D1 database structure for enrichment data
- **[Architecture](../architecture.md)** - Overall enrichment system architecture

## External Resources

### Perplexity API Documentation

- [Pricing Guide](https://docs.perplexity.ai/getting-started/pricing)
- [Usage Tiers & Rate Limits](https://docs.perplexity.ai/guides/usage-tiers)
- [API Reference](https://docs.perplexity.ai/)

### Additional Reading

- [Perplexity Sonar Launch (TechCrunch)](https://techcrunch.com/2025/01/21/perplexity-launches-sonar-an-api-for-ai-search/)
- [Helicone Perplexity Pricing Calculator](https://www.helicone.ai/llm-cost/provider/perplexity/model/sonar)
- [Perplexity API Error Handling Guide](https://www.hostingseekers.com/blog/fix-perplexity-api-errors-tutorial/)
