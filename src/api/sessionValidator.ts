import { getSessionData } from './sessionManager';
import { SessionData, ApiError, isSessionData } from '../types/api';

/**
 * Validates a session by checking required fields
 * @param sessionData The session data to validate
 * @returns The validated session data or null if invalid
 */
export async function validateSession(
  sessionData: SessionData | null
): Promise<SessionData | null> {
  if (!sessionData) {
    console.warn('Session validation failed: No session data provided');
    return null;
  }

  // Validate the session data using the type guard
  if (!isSessionData(sessionData)) {
    console.warn('Session validation failed: Invalid session data format');
    return null;
  }

  // Check for required fields
  const requiredFields: (keyof SessionData)[] = ['memberId', 'storeId', 'storeName', 'sessionId'];
  const missingFields = requiredFields.filter(field => !sessionData[field]);

  if (missingFields.length > 0) {
    console.warn(`Session validation failed: Missing required fields: ${missingFields.join(', ')}`);
    return null;
  }

  // Session is valid
  return sessionData;
}

/**
 * Gets the current session and validates it
 * @returns The current validated session or null if no valid session exists
 */
export async function getCurrentSession(): Promise<SessionData | null> {
  try {
    const sessionData = await getSessionData();
    return await validateSession(sessionData);
  } catch (error) {
    console.error('Error getting current session:', error);

    // Convert to ApiError if needed
    if (!(error instanceof ApiError)) {
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown session validation error',
        401, // Unauthorized
        false,
        false
      );
    }

    throw error;
  }
}
