/**
 * Database locking mechanism to prevent concurrent operations
 *
 * This module provides a queue-based lock manager to prevent race conditions
 * when multiple async operations try to access the database simultaneously.
 *
 * Features:
 * - FIFO queue for lock requests
 * - Automatic lock release after 15-second timeout (improved from 60s for better mobile UX)
 * - Operation name tracking for debugging
 * - No polling - uses proper async/await queue mechanism
 */

// Re-export the new DatabaseLockManager implementation
export { DatabaseLockManager, databaseLockManager } from './DatabaseLockManager';
