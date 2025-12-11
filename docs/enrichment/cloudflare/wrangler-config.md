# Wrangler Configuration

This document covers the Cloudflare Wrangler CLI setup and configuration.

## Prerequisites

Install the Wrangler CLI:

```bash
npm install -g wrangler
wrangler login
```

## Initialize Project

```bash
wrangler init ufobeer
cd ufobeer
```

## Create D1 Database

```bash
wrangler d1 create beer-db
```

Copy the `database_id` from the output - you'll need it for `wrangler.toml`.

## wrangler.toml

```toml
name = "ufobeer"
main = "src/index.ts"
compatibility_date = "2025-01-01"

# D1 Database binding
[[d1_databases]]
binding = "DB"
database_name = "beer-db"
database_id = "<YOUR_DATABASE_ID>"  # From 'wrangler d1 create' output

# Environment variables (non-secret)
[vars]
ALLOWED_ORIGIN = "https://ufobeer.app"
# Rate limit: requests per minute per client (X-Client-ID header or IP fallback)
RATE_LIMIT_RPM = "60"

# Cron triggers for background enrichment
[triggers]
crons = ["0 */12 * * *"]  # Every 12 hours

# Increase CPU time limit for cron jobs (enrichment needs more than default)
[limits]
cpu_ms = 60000  # 60 seconds (default is 10ms for HTTP, 30s for cron)
```

## Configuration Reference

### D1 Database Binding

```toml
[[d1_databases]]
binding = "DB"           # Name used in Worker code (env.DB)
database_name = "beer-db"
database_id = "abc123..."  # From wrangler d1 create
```

### Environment Variables

| Variable         | Description                    | Example               |
| ---------------- | ------------------------------ | --------------------- |
| `ALLOWED_ORIGIN` | CORS origin (required)         | `https://ufobeer.app` |
| `RATE_LIMIT_RPM` | Requests per minute per client | `60`                  |

### Cron Schedule

```toml
[triggers]
crons = ["0 */12 * * *"]  # Standard cron syntax
```

Common schedules:

- `0 */12 * * *` - Every 12 hours (midnight and noon UTC)
- `0 0 * * *` - Daily at midnight UTC
- `*/30 * * * *` - Every 30 minutes

### CPU Limits

```toml
[limits]
cpu_ms = 60000
```

- Default HTTP request: 10ms
- Default cron: 30,000ms (30s)
- Maximum: 60,000ms (60s) - requires paid plan for HTTP, free for cron

## Secrets

Secrets are stored securely and not committed to version control.

```bash
# Flying Saucer API base URL
wrangler secret put FLYING_SAUCER_API_BASE
# Enter: https://fsbs.beerknurd.com/bk-store-json.php

# Perplexity API key for enrichment
wrangler secret put PERPLEXITY_API_KEY
# Enter your Perplexity API key

# API key for mobile app authentication
wrangler secret put API_KEY
# Enter a secure random string (e.g., openssl rand -hex 32)
```

### Generate Secure API Key

```bash
# Generate a secure 32-byte hex string
openssl rand -hex 32
```

### List Secrets

```bash
wrangler secret list
```

### Delete Secret

```bash
wrangler secret delete SECRET_NAME
```

## Environment-Specific Configuration

For different environments (dev, staging, prod), use environments:

```toml
name = "ufobeer"
main = "src/index.ts"
compatibility_date = "2025-01-01"

# Default (production)
[[d1_databases]]
binding = "DB"
database_name = "beer-db"
database_id = "<PROD_DATABASE_ID>"

[vars]
ALLOWED_ORIGIN = "https://ufobeer.app"
RATE_LIMIT_RPM = "60"

# Staging environment
[env.staging]
name = "ufobeer-staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "beer-db-staging"
database_id = "<STAGING_DATABASE_ID>"

[env.staging.vars]
ALLOWED_ORIGIN = "https://staging.ufobeer.app"
RATE_LIMIT_RPM = "100"  # More lenient for testing

# Development environment
[env.dev]
name = "ufobeer-dev"

[[env.dev.d1_databases]]
binding = "DB"
database_name = "beer-db-dev"
database_id = "<DEV_DATABASE_ID>"

[env.dev.vars]
ALLOWED_ORIGIN = "*"  # Allow all origins in dev
RATE_LIMIT_RPM = "1000"  # Very lenient for testing
```

Deploy to specific environment:

```bash
wrangler deploy --env staging
wrangler deploy --env dev
```

## Common Commands

```bash
# Start local development server
wrangler dev

# Deploy to production
wrangler deploy

# Deploy to specific environment
wrangler deploy --env staging

# View logs
wrangler tail

# Execute D1 query (local)
wrangler d1 execute beer-db --local --command "SELECT * FROM enriched_beers LIMIT 5"

# Execute D1 query (remote)
wrangler d1 execute beer-db --remote --command "SELECT COUNT(*) FROM enriched_beers"

# Apply schema (local)
wrangler d1 execute beer-db --local --file=./schema.sql

# Apply schema (remote)
wrangler d1 execute beer-db --remote --file=./schema.sql

# Rollback to previous deployment
wrangler rollback
```

## Troubleshooting

### "Database not found"

Make sure the `database_id` in wrangler.toml matches the output from `wrangler d1 create`.

### "CORS error"

Check that `ALLOWED_ORIGIN` matches your app's origin exactly (including protocol and no trailing slash).

### "CPU time exceeded"

Increase `cpu_ms` in `[limits]` section. For HTTP requests, you may need a paid plan.

### Cron not running

1. Check cron syntax at [crontab.guru](https://crontab.guru)
2. View cron logs with `wrangler tail`
3. Verify `[triggers]` section in wrangler.toml
