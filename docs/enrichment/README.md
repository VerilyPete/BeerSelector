# Beer Enrichment Service

A Cloudflare Worker + D1 service that enriches Flying Saucer beer data with ABV information from external sources.

## Problem

The Flying Saucer API often returns incomplete beer data - particularly missing ABV (alcohol by volume). This service enriches that data by:

1. Proxying requests to Flying Saucer API
2. Merging in ABV data from our enrichment database
3. Background-enriching missing data via Perplexity API

## Architecture

```
┌─────────────────┐         ┌─────────────────────────────────────┐
│   Mobile App    │         │         Cloudflare Edge             │
│                 │         │                                     │
│  ┌───────────┐  │  GET    │  ┌─────────────┐    ┌───────────┐  │
│  │ Data      │──┼─/beers──┼─▶│   Worker    │───▶│    D1     │  │
│  │ Service   │  │ ?sid=   │  │             │    │ (SQLite)  │  │
│  └───────────┘  │         │  └──────┬──────┘    └───────────┘  │
│                 │         │         │                           │
└─────────────────┘         │         ▼                           │
                            │  ┌─────────────┐                    │
                            │  │Flying Saucer│                    │
                            │  │    API      │                    │
                            │  └─────────────┘                    │
                            │                                     │
                            │  ┌─────────────┐    ┌───────────┐  │
                            │  │ Cron Job    │───▶│ Perplexity│  │
                            │  │ (every 12h) │    │    API    │  │
                            │  └─────────────┘    └───────────┘  │
                            └─────────────────────────────────────┘
```

## Data Flow

### Request Flow (Proxy Pattern)

1. Mobile app calls `GET /beers?sid=13877` (Raleigh)
2. Worker fetches live taplist from Flying Saucer API
3. Worker queries D1 for enrichment data (ABV, confidence)
4. Worker merges data and returns unified response
5. Unknown beers are queued for background enrichment

### Enrichment Flow (Background)

1. Cron job runs every 12 hours
2. Finds beers with missing ABV data
3. Queries Perplexity API for each beer
4. Stores results in D1 with confidence scores

## Cost Analysis

| Resource       | Free Tier Limit  | Expected Usage | Cost         |
| -------------- | ---------------- | -------------- | ------------ |
| Workers        | 100,000 req/day  | ~500-2,000/day | **$0**       |
| D1 Reads       | 5M rows/day      | ~50,000/day    | **$0**       |
| D1 Writes      | 100,000 rows/day | ~1,000/day     | **$0**       |
| D1 Storage     | 5 GB             | < 10 MB        | **$0**       |
| Cron Triggers  | Unlimited        | 2/day          | **$0**       |
| Perplexity API | Pay-per-use      | ~500/month     | **$5-15/mo** |

**Total: ~$5-15/month** (Perplexity API only)

## Documentation

| Document                                                         | Description                      |
| ---------------------------------------------------------------- | -------------------------------- |
| [plan.md](./plan.md)                                             | Phased implementation plan       |
| [cloudflare/worker.md](./cloudflare/worker.md)                   | Worker source code               |
| [cloudflare/schema.md](./cloudflare/schema.md)                   | D1 database schema               |
| [cloudflare/wrangler-config.md](./cloudflare/wrangler-config.md) | Wrangler configuration           |
| [mobile/integration.md](./mobile/integration.md)                 | Mobile app integration           |
| [mobile/migration.md](./mobile/migration.md)                     | SQLite schema migration          |
| [operations.md](./operations.md)                                 | Deployment, monitoring, rollback |

## Quick Links

- **Flying Saucer Store IDs**: See [CLAUDE.md](../../CLAUDE.md#flying-saucer-store-locations)
- **Perplexity API Docs**: https://docs.perplexity.ai/
- **Cloudflare Workers Docs**: https://developers.cloudflare.com/workers/
- **Cloudflare D1 Docs**: https://developers.cloudflare.com/d1/
