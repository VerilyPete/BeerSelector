# Force Re-Enrichment: Types & Validation

## TypeScript Interfaces

Add to `src/index.ts` (after existing type definitions):

```typescript
// ============================================================================
// Force Re-Enrichment Types
// ============================================================================

interface ForceEnrichmentRequest {
  admin_id?: string;
  beer_ids?: string[];
  criteria?: {
    confidence_below?: number; // 0.0-1.0
    enrichment_older_than_days?: number; // positive integer
    enrichment_source?: 'perplexity' | 'manual';
  };
  limit?: number; // 1-100, default 50
  dry_run?: boolean; // default false
}

interface ForceEnrichmentResponse {
  success: boolean;
  requestId: string;
  data?: {
    matched_count: number;
    queued_count: number;
    skipped_count: number;
    skipped_ids?: string[]; // IDs skipped due to race condition (included if <= 50)
    queued_ids?: string[]; // IDs that were queued (included if <= 50)
    dry_run: boolean;
    applied_criteria?: object;
    quota: {
      daily: { used: number; limit: number; remaining: number };
      monthly: { used: number; limit: number; remaining: number };
    };
  };
  error?: { message: string; code: string };
}

interface BeerToReEnrich {
  id: string;
  brew_name: string;
  brewer: string | null;
  abv: number | null;
  confidence: number | null;
  enrichment_source: string | null;
  updated_at: number;
}
```

## Request Validation

**IMPORTANT:** Either `beer_ids` OR `criteria` is required. Empty body is rejected.

```typescript
interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
}

function validateForceEnrichmentRequest(body: unknown): ValidationResult {
  // Reject null/undefined/non-object
  if (body === null || body === undefined || typeof body !== 'object') {
    return {
      valid: false,
      error: 'Request body must be a JSON object with beer_ids or criteria',
      errorCode: 'INVALID_BODY',
    };
  }

  const req = body as ForceEnrichmentRequest;

  // Must specify either beer_ids OR criteria (not both, not neither)
  const hasBeerIds = req.beer_ids !== undefined;
  const hasCriteria = req.criteria !== undefined;

  if (hasBeerIds && hasCriteria) {
    return {
      valid: false,
      error: 'Cannot specify both beer_ids and criteria',
      errorCode: 'INVALID_REQUEST_BOTH_SPECIFIED',
    };
  }

  if (!hasBeerIds && !hasCriteria) {
    return {
      valid: false,
      error: 'Must specify either beer_ids or criteria',
      errorCode: 'INVALID_REQUEST_NEITHER_SPECIFIED',
    };
  }

  // Validate beer_ids
  if (hasBeerIds) {
    if (!Array.isArray(req.beer_ids)) {
      return { valid: false, error: 'beer_ids must be an array', errorCode: 'INVALID_BEER_IDS' };
    }
    if (req.beer_ids.length === 0) {
      return {
        valid: false,
        error: 'beer_ids cannot be empty',
        errorCode: 'INVALID_BEER_IDS_EMPTY',
      };
    }
    if (req.beer_ids.length > 100) {
      return {
        valid: false,
        error: 'beer_ids max 100 items',
        errorCode: 'INVALID_BEER_IDS_TOO_MANY',
      };
    }
    if (!req.beer_ids.every(id => typeof id === 'string' && id.length > 0)) {
      return {
        valid: false,
        error: 'All beer_ids must be non-empty strings',
        errorCode: 'INVALID_BEER_IDS_FORMAT',
      };
    }
  }

  // Validate criteria
  if (hasCriteria) {
    if (typeof req.criteria !== 'object' || req.criteria === null) {
      return { valid: false, error: 'criteria must be an object', errorCode: 'INVALID_CRITERIA' };
    }
    if (Object.keys(req.criteria).length === 0) {
      return {
        valid: false,
        error: 'criteria cannot be empty',
        errorCode: 'INVALID_CRITERIA_EMPTY',
      };
    }

    // confidence_below: 0.0-1.0
    if (req.criteria.confidence_below !== undefined) {
      const c = req.criteria.confidence_below;
      if (typeof c !== 'number' || c < 0 || c > 1) {
        return {
          valid: false,
          error: 'confidence_below must be 0.0-1.0',
          errorCode: 'INVALID_CONFIDENCE',
        };
      }
    }

    // enrichment_older_than_days: positive integer
    if (req.criteria.enrichment_older_than_days !== undefined) {
      const d = req.criteria.enrichment_older_than_days;
      if (typeof d !== 'number' || d < 1 || !Number.isInteger(d)) {
        return {
          valid: false,
          error: 'enrichment_older_than_days must be positive integer',
          errorCode: 'INVALID_DAYS',
        };
      }
    }

    // enrichment_source: 'perplexity' | 'manual'
    if (req.criteria.enrichment_source !== undefined) {
      if (!['perplexity', 'manual'].includes(req.criteria.enrichment_source)) {
        return {
          valid: false,
          error: "enrichment_source must be 'perplexity' or 'manual'",
          errorCode: 'INVALID_SOURCE',
        };
      }
    }
  }

  // Validate limit: 1-100
  if (req.limit !== undefined) {
    if (typeof req.limit !== 'number' || req.limit < 1 || req.limit > 100) {
      return { valid: false, error: 'limit must be 1-100', errorCode: 'INVALID_LIMIT' };
    }
  }

  // Validate dry_run: boolean
  if (req.dry_run !== undefined && typeof req.dry_run !== 'boolean') {
    return { valid: false, error: 'dry_run must be boolean', errorCode: 'INVALID_DRY_RUN' };
  }

  // Validate admin_id: non-empty string if provided
  if (req.admin_id !== undefined) {
    if (typeof req.admin_id !== 'string' || req.admin_id.trim().length === 0) {
      return {
        valid: false,
        error: 'admin_id must be non-empty string',
        errorCode: 'INVALID_ADMIN_ID',
      };
    }
  }

  return { valid: true };
}
```
