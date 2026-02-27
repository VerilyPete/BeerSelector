/**
 * Types related to database operations in the application
 */

/**
 * Preference type for app preferences stored in the database
 */
export type Preference = {
  key: string;
  value: string;
  description: string;
};

/**
 * Reward type for user rewards stored in the database
 */
export type Reward = {
  reward_id: string;
  redeemed: string;
  reward_type: string;
};

/**
 * DatabaseLock type for database locks
 */
export type DatabaseLock = {
  lock_key: string;
  acquired_at: number;
  expires_at: number;
};

/**
 * Type guard to check if an object is a Preference
 * @param obj The object to check
 * @returns True if the object is a Preference, false otherwise
 */
export function isPreference(obj: unknown): obj is Preference {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.key === 'string' && typeof o.value === 'string' && typeof o.description === 'string'
  );
}

/**
 * Type guard to check if an object is a Reward
 * @param obj The object to check
 * @returns True if the object is a Reward, false otherwise
 */
export function isReward(obj: unknown): obj is Reward {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.reward_id === 'string' &&
    typeof o.redeemed === 'string' &&
    typeof o.reward_type === 'string'
  );
}
