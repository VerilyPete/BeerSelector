import * as svc from '../../services/dataUpdateService';
import { __setRefreshImplementations } from '../../services/dataUpdateService';

// Mocks

jest.mock('../../database/db', () => ({
  getPreference: jest.fn(async (k: string) => {
    if (k === 'all_beers_api_url') return 'https://example.com/allbeers.json';
    if (k === 'my_beers_api_url') return 'https://example.com/mybeers.json';
    return '';
  }),
  setPreference: jest.fn(async () => {}),
}));

describe('manualRefreshAllData', () => {
  afterEach(() => {
    jest.clearAllMocks();
    // Reset implementations between tests
    __setRefreshImplementations({
      fetchAll: async () => ({ success: true, dataUpdated: true, itemCount: 1 } as any),
      fetchMy: async () => ({ success: true, dataUpdated: true, itemCount: 1 } as any),
    });
  });

  it('refreshes core endpoints and returns no errors when both succeed', async () => {
    __setRefreshImplementations({
      fetchAll: async () => ({ success: true, dataUpdated: true, itemCount: 3 } as any),
      fetchMy: async () => ({ success: true, dataUpdated: true, itemCount: 2 } as any),
    });

    const result = await svc.manualRefreshAllData();
    // Debug
    // eslint-disable-next-line no-console
    console.log('RESULT OK:', JSON.stringify(result));
    expect(result.hasErrors).toBe(false);
    expect(result.allBeersResult.success).toBe(true);
    expect(result.myBeersResult.success).toBe(true);
  });

  it('handles partial failure and sets hasErrors', async () => {
    __setRefreshImplementations({
      fetchAll: async () => ({ success: false, dataUpdated: false, error: { type: 'SERVER_ERROR', message: 'boom' } } as any),
      fetchMy: async () => ({ success: true, dataUpdated: true, itemCount: 2 } as any),
    });

    const result = await svc.manualRefreshAllData();
    // eslint-disable-next-line no-console
    console.log('RESULT PARTIAL:', JSON.stringify(result));
    expect(result.hasErrors).toBe(true);
    expect(result.allBeersResult.success).toBe(false);
    expect(result.myBeersResult.success).toBe(true);
  });
});
