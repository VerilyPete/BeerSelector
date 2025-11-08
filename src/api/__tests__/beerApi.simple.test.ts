import { fetchBeersFromAPI } from '../beerApi';
import * as preferences from '../../database/preferences';

jest.mock('../../database/preferences');

global.fetch = jest.fn();

describe('Beer API - Simple Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty array when API URL is not configured', async () => {
    (preferences.getPreference as jest.Mock).mockResolvedValue(null);

    const result = await fetchBeersFromAPI();

    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
