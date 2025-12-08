/**
 * Types related to database operations in the application
 */

/**
 * Preference interface for app preferences stored in the database
 */
export interface Preference {
  key: string;
  value: string;
  description: string;
}

/**
 * Reward interface for user rewards stored in the database
 */
export interface Reward {
  reward_id: string;
  redeemed: string;
  reward_type: string;
}

/**
 * UntappdCookie interface for Untappd cookies stored in the database
 */
export interface UntappdCookie {
  key: string;
  value: string;
  description: string;
}

/**
 * DatabaseLock interface for database locks
 */
export interface DatabaseLock {
  lock_key: string;
  acquired_at: number;
  expires_at: number;
}

/**
 * Type guard to check if an object is a Preference
 * @param obj The object to check
 * @returns True if the object is a Preference, false otherwise
 */
export function isPreference(obj: unknown): obj is Preference {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return typeof o.key === 'string' &&
    typeof o.value === 'string' &&
    typeof o.description === 'string';
}

/**
 * Type guard to check if an object is a Reward
 * @param obj The object to check
 * @returns True if the object is a Reward, false otherwise
 */
export function isReward(obj: unknown): obj is Reward {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return typeof o.reward_id === 'string' &&
    typeof o.redeemed === 'string' &&
    typeof o.reward_type === 'string';
}

/**
 * Type guard to check if an object is an UntappdCookie
 * @param obj The object to check
 * @returns True if the object is an UntappdCookie, false otherwise
 */
export function isUntappdCookie(obj: unknown): obj is UntappdCookie {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return typeof o.key === 'string' &&
    typeof o.value === 'string' &&
    typeof o.description === 'string';
}
