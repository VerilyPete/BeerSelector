import { createDebouncer } from '../liveActivityDebounce';

describe('liveActivityDebounce', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createDebouncer', () => {
    it('should call the function after the delay', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      const debouncer = createDebouncer(mockFn, 500);

      const promise = debouncer.call('arg1');

      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500);

      const result = await promise;
      expect(mockFn).toHaveBeenCalledWith('arg1');
      expect(result).toBe('result');
    });

    it('should cancel previous call when called again within delay', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      const debouncer = createDebouncer(mockFn, 500);

      // First call - will be superseded
      const firstPromise = debouncer.call('first');

      jest.advanceTimersByTime(300);

      // Second call within window - this should execute
      const promise = debouncer.call('second');

      jest.advanceTimersByTime(500);

      // Both promises resolve with the same result (from the final execution)
      const result = await promise;
      const firstResult = await firstPromise;

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('second');
      expect(result).toBe('result');
      expect(firstResult).toBe('result'); // First promise also resolves with final result
    });

    it('should allow manual cancellation', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      const debouncer = createDebouncer(mockFn, 500);

      const promise = debouncer.call('arg1');
      debouncer.cancel();

      jest.advanceTimersByTime(500);

      // The promise should reject when cancelled
      await expect(promise).rejects.toThrow('Debounced call cancelled');
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should track pending state correctly', () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      const debouncer = createDebouncer(mockFn, 500);

      expect(debouncer.isPending()).toBe(false);

      debouncer.call('arg1');
      expect(debouncer.isPending()).toBe(true);

      jest.advanceTimersByTime(500);
      expect(debouncer.isPending()).toBe(false);
    });

    it('should flush immediately when flush is called', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      const debouncer = createDebouncer(mockFn, 500);

      const promise = debouncer.call('arg1');

      expect(mockFn).not.toHaveBeenCalled();

      debouncer.flush();

      await promise;
      expect(mockFn).toHaveBeenCalledWith('arg1');
    });

    it('should resolve all pending promises with final result', async () => {
      const fn = jest.fn().mockResolvedValue('final-result');
      const debouncer = createDebouncer(fn, 500);

      const promise1 = debouncer.call('arg1');
      const promise2 = debouncer.call('arg2');
      const promise3 = debouncer.call('arg3');

      jest.advanceTimersByTime(500);

      await expect(promise1).resolves.toBe('final-result');
      await expect(promise2).resolves.toBe('final-result');
      await expect(promise3).resolves.toBe('final-result');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('arg3');
    });

    it('should handle function errors correctly', async () => {
      const error = new Error('Function failed');
      const fn = jest.fn().mockRejectedValue(error);
      const debouncer = createDebouncer(fn, 500);

      const promise = debouncer.call('arg1');
      jest.advanceTimersByTime(500);

      await expect(promise).rejects.toThrow('Function failed');
    });

    it('should convert non-Error rejections to Error objects', async () => {
      const fn = jest.fn().mockRejectedValue('string error');
      const debouncer = createDebouncer(fn, 500);

      const promise = debouncer.call('arg1');
      jest.advanceTimersByTime(500);

      await expect(promise).rejects.toThrow('string error');
    });

    it('should allow new calls after execution completes', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      const debouncer = createDebouncer(fn, 500);

      debouncer.call('first');
      jest.advanceTimersByTime(500);

      debouncer.call('second');
      jest.advanceTimersByTime(500);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenNthCalledWith(1, 'first');
      expect(fn).toHaveBeenNthCalledWith(2, 'second');
    });
  });
});
