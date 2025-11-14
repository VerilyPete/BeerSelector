/**
 * MP-3 Step 2a: Tests for Bottleneck #4 - Search Debouncing
 *
 * Purpose: Verify that search input is properly debounced to prevent excessive
 * filtering and re-renders during rapid typing.
 *
 * Optimization: Create useDebounce hook to delay filter execution by 300ms,
 * reducing filtering operations from 10+ per second to 1 per pause.
 *
 * Expected Behavior (AFTER optimization):
 * - Search updates should be debounced by 300ms
 * - Rapid typing should only trigger filter once after user stops typing
 * - Hook should cleanup timeout on unmount to prevent memory leaks
 * - Debounced value should eventually match input value
 *
 * Current Status: FAILING (hook not yet implemented)
 * These tests will pass after Step 2b implementation.
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useDebounce } from '../useDebounce';

describe('useDebounce Hook (Bottleneck #4)', () => {
  beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Basic Debouncing', () => {
    it('should return initial value immediately', () => {
      const { result } = renderHook(() => useDebounce('initial', 300));

      // EXPECTED: Should return initial value without delay
      expect(result.current).toBe('initial');
    });

    it('should debounce value changes by 300ms', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 300 },
        }
      );

      expect(result.current).toBe('initial');

      // Change value
      rerender({ value: 'changed', delay: 300 });

      // Immediately after change, should still be 'initial'
      expect(result.current).toBe('initial');

      // After 300ms, should update to 'changed'
      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(result.current).toBe('changed');
      });
    });

    it('should not update before delay expires', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 300 },
        }
      );

      rerender({ value: 'changed', delay: 300 });

      // After 100ms, should still be 'initial'
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current).toBe('initial');

      // After 200ms, should still be 'initial'
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current).toBe('initial');
    });

    it('should update exactly after delay expires', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 300 },
        }
      );

      rerender({ value: 'changed', delay: 300 });

      // Advance to exactly 300ms
      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(result.current).toBe('changed');
      });
    });
  });

  describe('Rapid Changes (Core Optimization)', () => {
    it('should only trigger once after multiple rapid changes', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: '', delay: 300 },
        }
      );

      // Simulate typing "hello" rapidly (each keystroke 50ms apart)
      const keystrokes = ['h', 'he', 'hel', 'hell', 'hello'];

      keystrokes.forEach((text, index) => {
        rerender({ value: text, delay: 300 });

        // Advance time by 50ms (rapid typing)
        if (index < keystrokes.length - 1) {
          act(() => {
            jest.advanceTimersByTime(50);
          });
        }

        // Value should still be empty string (debouncing)
        expect(result.current).toBe('');
      });

      // Now wait 300ms after last keystroke
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // EXPECTED: Should only update to final value once
      await waitFor(() => {
        expect(result.current).toBe('hello');
      });
    });

    it('should reset timer on each change', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 300 },
        }
      );

      // Change 1
      rerender({ value: 'change1', delay: 300 });
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Change 2 before timer expires
      rerender({ value: 'change2', delay: 300 });
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Change 3 before timer expires
      rerender({ value: 'change3', delay: 300 });

      // Value should still be 'initial' (timer keeps resetting)
      expect(result.current).toBe('initial');

      // Now wait full 300ms
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should update to final value
      await waitFor(() => {
        expect(result.current).toBe('change3');
      });
    });

    it('should handle 10+ rapid changes efficiently', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: '', delay: 300 },
        }
      );

      // Simulate very rapid typing (10 characters)
      for (let i = 1; i <= 10; i++) {
        rerender({ value: 'a'.repeat(i), delay: 300 });
        act(() => {
          jest.advanceTimersByTime(30); // 30ms between keystrokes
        });
      }

      // Value should still be empty (all changes debounced)
      expect(result.current).toBe('');

      // Wait for debounce delay
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should update to final value
      await waitFor(() => {
        expect(result.current).toBe('aaaaaaaaaa');
      });
    });
  });

  describe('Different Data Types', () => {
    it('should work with string values', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 300 },
        }
      );

      rerender({ value: 'updated', delay: 300 });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(result.current).toBe('updated');
      });
    });

    it('should work with number values', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 0, delay: 300 },
        }
      );

      rerender({ value: 42, delay: 300 });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(result.current).toBe(42);
      });
    });

    it('should work with boolean values', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: false, delay: 300 },
        }
      );

      rerender({ value: true, delay: 300 });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(result.current).toBe(true);
      });
    });

    it('should work with object values', async () => {
      const initialObj = { search: 'initial' };
      const updatedObj = { search: 'updated' };

      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: initialObj, delay: 300 },
        }
      );

      rerender({ value: updatedObj, delay: 300 });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(result.current).toEqual(updatedObj);
      });
    });
  });

  describe('Cleanup and Memory Management', () => {
    it('should cleanup timeout on unmount', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      const { unmount, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 300 },
        }
      );

      rerender({ value: 'changed', delay: 300 });

      // Unmount before timer expires
      unmount();

      // EXPECTED: clearTimeout should be called to prevent memory leak
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it('should not update state after unmount', async () => {
      const { result, unmount, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 300 },
        }
      );

      rerender({ value: 'changed', delay: 300 });

      // Unmount before timer expires
      const beforeUnmount = result.current;
      unmount();

      // Advance timers after unmount
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Value should not have changed (no state update after unmount)
      expect(beforeUnmount).toBe('initial');
    });

    it('should cleanup previous timeout when value changes', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      let clearTimeoutCallCount = 0;

      const { rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 300 },
        }
      );

      // First change
      rerender({ value: 'change1', delay: 300 });
      clearTimeoutCallCount = clearTimeoutSpy.mock.calls.length;

      // Second change should clear previous timeout
      rerender({ value: 'change2', delay: 300 });

      // EXPECTED: clearTimeout called again
      expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearTimeoutCallCount);

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Different Delay Values', () => {
    it('should respect custom delay of 500ms', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 500 },
        }
      );

      rerender({ value: 'changed', delay: 500 });

      // After 300ms, should still be 'initial'
      act(() => {
        jest.advanceTimersByTime(300);
      });
      expect(result.current).toBe('initial');

      // After 500ms, should be 'changed'
      act(() => {
        jest.advanceTimersByTime(200);
      });

      await waitFor(() => {
        expect(result.current).toBe('changed');
      });
    });

    it('should respect custom delay of 100ms', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 100 },
        }
      );

      rerender({ value: 'changed', delay: 100 });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        expect(result.current).toBe('changed');
      });
    });

    it('should handle delay of 0ms (no debouncing)', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: 'initial', delay: 0 },
        }
      );

      rerender({ value: 'changed', delay: 0 });

      // With 0ms delay, should update immediately
      act(() => {
        jest.advanceTimersByTime(0);
      });

      await waitFor(() => {
        expect(result.current).toBe('changed');
      });
    });
  });

  describe('Performance Characteristics', () => {
    it('should reduce filter executions from 10+ to 1 for rapid typing', async () => {
      // Simulation: Without debouncing, 10 keystrokes = 10 filter executions
      // With debouncing, 10 keystrokes = 1 filter execution

      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: '', delay: 300 },
        }
      );

      let updateCount = 0;
      let lastValue = result.current;

      // Simulate 10 rapid keystrokes
      for (let i = 1; i <= 10; i++) {
        rerender({ value: `search${i}`, delay: 300 });

        // Check if value changed (would trigger filter)
        if (result.current !== lastValue) {
          updateCount++;
          lastValue = result.current;
        }

        act(() => {
          jest.advanceTimersByTime(50); // Rapid typing
        });
      }

      // Should have 0 updates during typing
      expect(updateCount).toBe(0);

      // Wait for debounce
      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        if (result.current !== lastValue) {
          updateCount++;
        }
      });

      // EXPECTED: Only 1 update after all typing is done
      expect(updateCount).toBe(1);
    });

    it('should prevent excessive re-renders during search', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: '', delay: 300 },
        }
      );

      // Track state changes
      const values: string[] = [result.current];

      // Type "beer" character by character
      ['b', 'be', 'bee', 'beer'].forEach((text) => {
        rerender({ value: text, delay: 300 });
        values.push(result.current);

        act(() => {
          jest.advanceTimersByTime(50);
        });
      });

      // All values should still be empty string (debounced)
      expect(values.every(v => v === '')).toBe(true);

      // Wait for debounce
      act(() => {
        jest.advanceTimersByTime(300);
      });

      await waitFor(() => {
        expect(result.current).toBe('beer');
      });
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle typical search scenario (300ms delay)', async () => {
      // User types "IPA" with 100ms between keystrokes
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: '', delay: 300 },
        }
      );

      // Type "I"
      rerender({ value: 'I', delay: 300 });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Type "P"
      rerender({ value: 'IP', delay: 300 });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Type "A"
      rerender({ value: 'IPA', delay: 300 });

      // Value should still be empty
      expect(result.current).toBe('');

      // Wait 300ms after last keystroke
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Now value should update
      await waitFor(() => {
        expect(result.current).toBe('IPA');
      });
    });

    it('should handle user pausing mid-typing', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: '', delay: 300 },
        }
      );

      // Type "be"
      rerender({ value: 'be', delay: 300 });

      // Wait 350ms (user pauses, debounce triggers)
      act(() => {
        jest.advanceTimersByTime(350);
      });

      // Value should update to "be"
      await waitFor(() => {
        expect(result.current).toBe('be');
      });

      // Continue typing "er"
      rerender({ value: 'beer', delay: 300 });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Value should update to "beer"
      await waitFor(() => {
        expect(result.current).toBe('beer');
      });
    });

    it('should handle rapid typing followed by immediate clear', async () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        {
          initialProps: { value: '', delay: 300 },
        }
      );

      // Rapid typing
      rerender({ value: 'search', delay: 300 });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      // User clears search
      rerender({ value: '', delay: 300 });

      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Should end up as empty string
      await waitFor(() => {
        expect(result.current).toBe('');
      });
    });
  });
});
