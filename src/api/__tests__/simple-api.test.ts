import { ApiError } from '../apiClient';

describe('ApiError', () => {
  it('should create an ApiError with correct properties', () => {
    const error = new ApiError('Test error', 500, true, false);
    
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(500);
    expect(error.isNetworkError).toBe(true);
    expect(error.isTimeout).toBe(false);
    expect(error.retryable).toBe(true);
  });
  
  it('should mark 5xx errors as retryable', () => {
    const error = new ApiError('Server error', 503, false, false);
    expect(error.retryable).toBe(true);
  });
  
  it('should mark 4xx errors as non-retryable (except 408 and 429)', () => {
    const error404 = new ApiError('Not found', 404, false, false);
    expect(error404.retryable).toBe(false);
    
    const error429 = new ApiError('Too many requests', 429, false, false);
    expect(error429.retryable).toBe(true);
    
    const error408 = new ApiError('Request timeout', 408, false, false);
    expect(error408.retryable).toBe(true);
  });
});
