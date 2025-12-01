/**
 * Debouncer interface for type-safe debounced function calls
 */
export interface Debouncer<TArgs extends unknown[], TResult> {
  /** Call the debounced function with arguments */
  call: (...args: TArgs) => Promise<TResult>;

  /** Cancel any pending debounced call */
  cancel: () => void;

  /** Check if a call is pending */
  isPending: () => boolean;

  /** Flush and execute immediately if a call is pending */
  flush: () => void;
}

interface PendingResolver<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Creates a debouncer that coalesces rapid function calls.
 *
 * - Only the last call within the delay window executes
 * - All callers receive the result from the final execution
 * - Cancellation rejects all pending promises
 *
 * @param fn - The async function to debounce
 * @param delayMs - Debounce delay in milliseconds
 * @returns Debouncer interface
 */
export function createDebouncer<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  delayMs: number
): Debouncer<TArgs, TResult> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let latestArgs: TArgs | null = null;
  let pendingResolvers: PendingResolver<TResult>[] = [];

  const isPending = (): boolean => timeoutId !== null;

  const executeNow = async (): Promise<void> => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    const argsToUse = latestArgs;
    const resolvers = [...pendingResolvers];

    // Clear state before execution
    pendingResolvers = [];
    latestArgs = null;

    if (!argsToUse || resolvers.length === 0) {
      return;
    }

    try {
      const result = await fn(...argsToUse);
      resolvers.forEach(({ resolve }) => resolve(result));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      resolvers.forEach(({ reject }) => reject(err));
    }
  };

  const cancel = (): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    // Reject all pending promises
    const error = new Error('Debounced call cancelled');
    pendingResolvers.forEach(({ reject }) => reject(error));
    pendingResolvers = [];
    latestArgs = null;
  };

  const flush = (): void => {
    if (isPending()) {
      // Execute immediately
      void executeNow();
    }
  };

  const call = (...args: TArgs): Promise<TResult> => {
    return new Promise((resolve, reject) => {
      // Store latest args and add resolver
      latestArgs = args;
      pendingResolvers.push({ resolve, reject });

      // Clear existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Set new timeout
      timeoutId = setTimeout(() => {
        timeoutId = null;
        void executeNow();
      }, delayMs);
    });
  };

  return { call, cancel, isPending, flush };
}
