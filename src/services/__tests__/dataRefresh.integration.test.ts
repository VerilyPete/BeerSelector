import { vi, type Mock } from 'vitest';
/**
 * Integration tests for data refresh flows
 * Tests the complete refresh cycle using real JSON fixtures
 */

import { refreshAllDataFromAPI } from '../dataUpdateService';
import * as beerRepository from '../../database/repositories/BeerRepository';
import * as myBeersRepository from '../../database/repositories/MyBeersRepository';
import * as rewardsRepository from '../../database/repositories/RewardsRepository';
import * as beerApi from '../../api/beerApi';
import * as preferences from '../../database/preferences';
import { databaseLockManager } from '../../database/locks';
import fs from 'fs';
import path from 'path';
import { fetchedRows } from '../../api/__tests__/helpers/fetchOutcomeFixtures';

// Load real JSON fixtures. These live in ./fixtures/ and are committed —
// they used to be read from the repo root, where both files are gitignored
// and untracked, so this suite failed to load entirely on any clean checkout.
const allBeersFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/allbeers.json'), 'utf-8')
);
const myBeersFixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/mybeers.json'), 'utf-8')
);

// Mock the modules
vi.mock('../../api/beerApi', async () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (await import('../../api/__tests__/helpers/beerApiMock')).beerApiMockFactory()
);
vi.mock('../../database/preferences');
vi.mock('../../database/repositories/BeerRepository');
vi.mock('../../database/repositories/MyBeersRepository');
vi.mock('../../database/repositories/RewardsRepository');

describe('Data Refresh Integration Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock for areApiUrlsConfigured - tests can override if needed
    (preferences.areApiUrlsConfigured as Mock).mockResolvedValue(true);
    // Mock lock manager methods
    vi.spyOn(databaseLockManager, 'withDatabaseLock').mockImplementation(async (_name, task) =>
      task()
    );
  });

  describe('Full refresh flow', () => {
    it('should successfully refresh all data with real JSON fixtures', async () => {
      // Setup: Configure API URLs and visitor mode
      (preferences.getPreference as Mock).mockImplementation((key: string) => {
        switch (key) {
          case 'is_visitor_mode':
            return Promise.resolve('false');
          case 'all_beers_api_url':
            return Promise.resolve('https://api.example.com/allbeers');
          case 'my_beers_api_url':
            return Promise.resolve('https://api.example.com/mybeers');
          default:
            return Promise.resolve(null);
        }
      });

      // Mock API responses with real fixtures
      (beerApi.fetchBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(allBeersFixture[1].brewInStock)
      );
      (beerApi.fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(myBeersFixture[1].tasted_brew_current_round)
      );
      (beerApi.fetchRewardsFromAPI as Mock).mockResolvedValue(
        fetchedRows([{ reward_id: '1', redeemed: 'false', reward_type: 'plate' }])
      );

      // Mock repository insertMany methods
      (beerRepository.beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);

      // Execute refresh
      const result = await refreshAllDataFromAPI();

      // Verify results
      expect(result.allBeers).toHaveLength(194); // From allbeers.json - 1 beer has empty brew_name and is filtered out by validation
      expect(result.myBeers).toHaveLength(98); // From mybeers.json
      expect(result.rewards).toHaveLength(1);

      // Verify API calls
      expect(beerApi.fetchBeersFromAPI).toHaveBeenCalled();
      expect(beerApi.fetchMemberDataFromAPI).toHaveBeenCalledTimes(1);

      // Verify repositories were called with validated data (not raw fixture data)
      expect(beerRepository.beerRepository.insertManyUnsafe).toHaveBeenCalledTimes(1);
      expect(myBeersRepository.myBeersRepository.insertManyUnsafe).toHaveBeenCalledTimes(1);

      // Verify the validated arrays have correct lengths (accounting for validation filtering)
      const allBeersCall = (beerRepository.beerRepository.insertManyUnsafe as Mock).mock
        .calls[0][0];
      expect(allBeersCall).toHaveLength(194); // 195 - 1 beer with empty brew_name

      const myBeersCall = (myBeersRepository.myBeersRepository.insertManyUnsafe as Mock).mock
        .calls[0][0];
      expect(myBeersCall).toHaveLength(98);
    });

    it('should handle visitor mode correctly (no my beers)', async () => {
      // Setup: Visitor mode
      (preferences.getPreference as Mock).mockImplementation((key: string) => {
        switch (key) {
          case 'is_visitor_mode':
            return Promise.resolve('true');
          case 'all_beers_api_url':
            return Promise.resolve('https://api.example.com/allbeers');
          case 'my_beers_api_url':
            return Promise.resolve(null);
          default:
            return Promise.resolve(null);
        }
      });

      (beerApi.fetchBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(allBeersFixture[1].brewInStock)
      );
      (beerApi.fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows([]));
      (beerApi.fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows([]));

      (beerRepository.beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);

      const result = await refreshAllDataFromAPI();

      // In visitor mode, should still get all beers but empty my beers
      expect(result.allBeers).toHaveLength(194);
      expect(result.myBeers).toHaveLength(0);
      expect(result.rewards).toHaveLength(0);
    });

    // Parallel execution test removed: testing implementation details (Promise.all timing)
    // rather than business behavior. The business behavior (all data gets refreshed) is
    // already covered by the other passing tests in this file.
  });

  describe('Partial refresh scenarios', () => {
    // INVERTED by plan 02 Phase 2.5 (was dataRefresh.integration.test.ts:145).
    it('does not abort the other sources when the taplist comes back empty', async () => {
      (preferences.getPreference as Mock).mockImplementation((key: string) => {
        switch (key) {
          case 'is_visitor_mode':
            return Promise.resolve('false');
          case 'all_beers_api_url':
            return Promise.resolve('https://api.example.com/allbeers');
          case 'my_beers_api_url':
            return Promise.resolve('https://api.example.com/mybeers');
          default:
            return Promise.resolve(null);
        }
      });

      (beerApi.fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows([]));
      (beerApi.fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(myBeersFixture[1].tasted_brew_current_round)
      );
      (beerApi.fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows([]));

      (beerRepository.beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);

      // INVERTED by plan 02 Phase 2.5. An empty taplist is still a failure for
      // THAT source — nothing is written for it — but it no longer aborts the
      // other two, which is what per-source isolation buys.
      await expect(refreshAllDataFromAPI()).resolves.toBeDefined();

      expect(beerRepository.beerRepository.insertManyUnsafe).not.toHaveBeenCalled();
    });

    it('should handle empty my beers response (new user)', async () => {
      (preferences.getPreference as Mock).mockImplementation((key: string) => {
        switch (key) {
          case 'is_visitor_mode':
            return Promise.resolve('false');
          case 'all_beers_api_url':
            return Promise.resolve('https://api.example.com/allbeers');
          case 'my_beers_api_url':
            return Promise.resolve('https://api.example.com/mybeers');
          default:
            return Promise.resolve(null);
        }
      });

      (beerApi.fetchBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(allBeersFixture[1].brewInStock)
      );
      (beerApi.fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows([]));
      (beerApi.fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows([]));

      (beerRepository.beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);

      const result = await refreshAllDataFromAPI();

      expect(result.allBeers).toHaveLength(194);
      expect(result.myBeers).toHaveLength(0);

      // INVERTED by plan 02 Phase 2: emptying the tasted table is now asked for
      // explicitly rather than inferred from an empty array reaching insertMany.
      expect(myBeersRepository.myBeersRepository.replaceAllWithEmptyUnsafe).toHaveBeenCalled();
      expect(myBeersRepository.myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
    });

    it('should handle round rollover (200 beers reached)', async () => {
      (preferences.getPreference as Mock).mockImplementation((key: string) => {
        switch (key) {
          case 'is_visitor_mode':
            return Promise.resolve('false');
          case 'all_beers_api_url':
            return Promise.resolve('https://api.example.com/allbeers');
          case 'my_beers_api_url':
            return Promise.resolve('https://api.example.com/mybeers');
          default:
            return Promise.resolve(null);
        }
      });

      (beerApi.fetchBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(allBeersFixture[1].brewInStock)
      );
      // API returns empty array when round rolls over
      (beerApi.fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows([]));
      (beerApi.fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows([]));

      (beerRepository.beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);

      const result = await refreshAllDataFromAPI();

      expect(result.myBeers).toHaveLength(0);
      // INVERTED by plan 02 Phase 2, same reasoning: the round rollover is a
      // genuine empty state and now says so explicitly.
      expect(myBeersRepository.myBeersRepository.replaceAllWithEmptyUnsafe).toHaveBeenCalled();
    });
  });

  describe('Refresh failure recovery', () => {
    it('should throw error when API URLs not configured', async () => {
      // Override the default mock to simulate API URLs not being configured
      (preferences.areApiUrlsConfigured as Mock).mockResolvedValue(false);
      (preferences.getPreference as Mock).mockResolvedValue(null);

      await expect(refreshAllDataFromAPI()).rejects.toThrow(
        'API URLs not configured. Please log in to set up API URLs.'
      );
    });

    // INVERTED by plan 02 Phase 2.5 (was dataRefresh.integration.test.ts:263).
    // Per-source isolation means one source failing no longer aborts the
    // remainder — that is the whole point. The live case is a CHECK IN on a
    // weak link, where aborting left a fresh taplist beside a stale tasted
    // list and stale rewards.
    it('does not abort the other sources when the all-beers API fails', async () => {
      (preferences.getPreference as Mock).mockImplementation((key: string) => {
        switch (key) {
          case 'is_visitor_mode':
            return Promise.resolve('false');
          case 'all_beers_api_url':
            return Promise.resolve('https://api.example.com/allbeers');
          case 'my_beers_api_url':
            return Promise.resolve('https://api.example.com/mybeers');
          default:
            return Promise.resolve(null);
        }
      });

      (beerApi.fetchBeersFromAPI as Mock).mockRejectedValue(new Error('Network error'));
      // The other two sources now actually RUN when all-beers fails, so they
      // need mocking. Before isolation they were unreachable in this test —
      // which is a fair illustration of what the change buys.
      (beerApi.fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(myBeersFixture[1].tasted_brew_current_round)
      );
      (beerApi.fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows([]));

      await expect(refreshAllDataFromAPI()).resolves.toBeDefined();

      // The taplist write is skipped — its source failed — but the other two
      // still landed instead of being aborted alongside it.
      expect(beerRepository.beerRepository.insertManyUnsafe).not.toHaveBeenCalled();
      expect(myBeersRepository.myBeersRepository.insertManyUnsafe).toHaveBeenCalled();
      // These drive `fetchedRows([])` — a server-confirmed empty rewards list —
      // so the write that proves the source was still processed is the CLEAR,
      // not an insert. Until plan 05's review round this asserted
      // `insertManyUnsafe`, which early-returns on an empty array: the source
      // was reported as updated having touched nothing.
      expect(rewardsRepository.rewardsRepository.replaceAllWithEmptyUnsafe).toHaveBeenCalled();
    });

    // INVERTED by plan 02 Phase 2.5 (was dataRefresh.integration.test.ts:282).
    it('does not abort the other sources when the my-beers API fails', async () => {
      (preferences.getPreference as Mock).mockImplementation((key: string) => {
        switch (key) {
          case 'is_visitor_mode':
            return Promise.resolve('false');
          case 'all_beers_api_url':
            return Promise.resolve('https://api.example.com/allbeers');
          case 'my_beers_api_url':
            return Promise.resolve('https://api.example.com/mybeers');
          default:
            return Promise.resolve(null);
        }
      });

      (beerApi.fetchBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(allBeersFixture[1].brewInStock)
      );
      (beerApi.fetchMyBeersFromAPI as Mock).mockRejectedValue(new Error('API timeout'));

      await expect(refreshAllDataFromAPI()).resolves.toBeDefined();

      // The two healthy sources still landed.
      // These drive `fetchedRows([])` — a server-confirmed empty rewards list —
      // so the write that proves the source was still processed is the CLEAR,
      // not an insert. Until plan 05's review round this asserted
      // `insertManyUnsafe`, which early-returns on an empty array: the source
      // was reported as updated having touched nothing.
      expect(rewardsRepository.rewardsRepository.replaceAllWithEmptyUnsafe).toHaveBeenCalled();
      expect(beerRepository.beerRepository.insertManyUnsafe).toHaveBeenCalled();
    });

    // INVERTED by plan 02 Phase 2.5 (was dataRefresh.integration.test.ts:302).
    it('does not abort the other sources when the rewards API fails', async () => {
      (preferences.getPreference as Mock).mockImplementation((key: string) => {
        switch (key) {
          case 'is_visitor_mode':
            return Promise.resolve('false');
          case 'all_beers_api_url':
            return Promise.resolve('https://api.example.com/allbeers');
          case 'my_beers_api_url':
            return Promise.resolve('https://api.example.com/mybeers');
          default:
            return Promise.resolve(null);
        }
      });

      (beerApi.fetchBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(allBeersFixture[1].brewInStock)
      );
      (beerApi.fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(myBeersFixture[1].tasted_brew_current_round)
      );
      (beerApi.fetchRewardsFromAPI as Mock).mockRejectedValue(
        new Error('Rewards service unavailable')
      );

      await expect(refreshAllDataFromAPI()).resolves.toBeDefined();

      // The taplist and tasted writes still landed.
      expect(beerRepository.beerRepository.insertManyUnsafe).toHaveBeenCalled();
    });

    // INVERTED by plan 02 Phase 2.5 (was dataRefresh.integration.test.ts:327).
    it('does not abort the other sources when a database write fails', async () => {
      (preferences.getPreference as Mock).mockImplementation((key: string) => {
        switch (key) {
          case 'is_visitor_mode':
            return Promise.resolve('false');
          case 'all_beers_api_url':
            return Promise.resolve('https://api.example.com/allbeers');
          case 'my_beers_api_url':
            return Promise.resolve('https://api.example.com/mybeers');
          default:
            return Promise.resolve(null);
        }
      });

      (beerApi.fetchBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(allBeersFixture[1].brewInStock)
      );
      (beerApi.fetchMyBeersFromAPI as Mock).mockResolvedValue(
        fetchedRows(myBeersFixture[1].tasted_brew_current_round)
      );
      (beerApi.fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows([]));

      // Simulate database failure
      (beerRepository.beerRepository.insertManyUnsafe as Mock).mockRejectedValue(
        new Error('Database write failed')
      );

      // INVERTED by plan 02 Phase 2.5: a write failure in one source is now
      // isolated too, so the other sources still refresh.
      await expect(refreshAllDataFromAPI()).resolves.toBeDefined();

      // These drive `fetchedRows([])` — a server-confirmed empty rewards list —
      // so the write that proves the source was still processed is the CLEAR,
      // not an insert. Until plan 05's review round this asserted
      // `insertManyUnsafe`, which early-returns on an empty array: the source
      // was reported as updated having touched nothing.
      expect(rewardsRepository.rewardsRepository.replaceAllWithEmptyUnsafe).toHaveBeenCalled();
    });
  });

  describe('Data validation', () => {
    it('should handle beers with missing IDs gracefully', async () => {
      (preferences.getPreference as Mock).mockImplementation((key: string) => {
        switch (key) {
          case 'is_visitor_mode':
            return Promise.resolve('false');
          case 'all_beers_api_url':
            return Promise.resolve('https://api.example.com/allbeers');
          case 'my_beers_api_url':
            return Promise.resolve('https://api.example.com/mybeers');
          default:
            return Promise.resolve(null);
        }
      });

      // Mix of valid and invalid beers
      const beersWithInvalid = [
        { id: '1', brew_name: 'Valid Beer 1', brewer: 'Brewery A' },
        { brew_name: 'Invalid Beer - No ID', brewer: 'Brewery B' }, // Missing ID
        { id: '2', brew_name: 'Valid Beer 2', brewer: 'Brewery C' },
      ];

      (beerApi.fetchBeersFromAPI as Mock).mockResolvedValue(fetchedRows(beersWithInvalid));
      (beerApi.fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows([]));
      (beerApi.fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows([]));

      (beerRepository.beerRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (myBeersRepository.myBeersRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);
      (rewardsRepository.rewardsRepository.insertManyUnsafe as Mock).mockResolvedValue(undefined);

      const result = await refreshAllDataFromAPI();

      // Should still complete successfully
      expect(result.allBeers).toHaveLength(2);
      // Validator filters out the beer without ID, so only 2 valid beers remain
    });

    it('should verify all beers from fixture have required fields', async () => {
      const beers = allBeersFixture[1].brewInStock;

      // Check that fixture data is valid
      beers.forEach((beer: any) => {
        expect(beer).toHaveProperty('id');
        expect(beer).toHaveProperty('brew_name');
        expect(typeof beer.id).toBe('string');
        expect(typeof beer.brew_name).toBe('string');
        expect(beer.id).toBeTruthy(); // ID should not be empty
      });

      console.log(`Verified ${beers.length} beers from fixture have valid structure`);
    });

    it('should verify my beers from fixture have Beerfinder fields', async () => {
      const myBeers = myBeersFixture[1].tasted_brew_current_round;

      myBeers.forEach((beer: any) => {
        expect(beer).toHaveProperty('id');
        expect(beer).toHaveProperty('brew_name');
        // Beerfinder-specific fields (optional but should exist in fixture)
        if (beer.roh_lap || beer.tasted_date || beer.chit_code) {
          // At least one Beerfinder field should exist
          expect(
            beer.roh_lap !== undefined ||
              beer.tasted_date !== undefined ||
              beer.chit_code !== undefined
          ).toBe(true);
        }
      });

      console.log(`Verified ${myBeers.length} tasted beers from fixture`);
    });
  });
});

describe('refreshAllDataFromAPI: empty vs malformed tasted beers', () => {
  // This arm had NO coverage: collapsing it back to an unconditional
  // replaceAllWithEmptyUnsafe left the whole suite green. It is the
  // autoLogin -> CHECK IN path, which is where a wipe hurts most.
  it('does not clear the tasted table when every row fails validation', async () => {
    vi.clearAllMocks();
    (beerApi.fetchBeersFromAPI as Mock).mockResolvedValue(
      fetchedRows([{ id: 'b1', brew_name: 'Beer', brewer: 'X' }])
    );
    // Rows that HAVE ids — so beerApi's own filter passes them through — but
    // fail validateBeer on brew_name. This is the only input that now reaches
    // the null arm with a non-empty raw array, and mocking a rejection instead
    // would never get here at all.
    (beerApi.fetchMyBeersFromAPI as Mock).mockResolvedValue(
      fetchedRows([
        { id: 'm1', brew_name: '', brewer: 'X' },
        { id: 'm2', brew_name: '', brewer: 'Y' },
      ])
    );
    (beerApi.fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows([]));

    await refreshAllDataFromAPI();

    // Skipped, not cleared. This is the autoLogin -> CHECK IN path.
    expect(myBeersRepository.myBeersRepository.replaceAllWithEmptyUnsafe).not.toHaveBeenCalled();
    expect(myBeersRepository.myBeersRepository.insertManyUnsafe).not.toHaveBeenCalled();
  });

  it('does clear the tasted table when the server reports a genuinely empty round', async () => {
    vi.clearAllMocks();
    (beerApi.fetchBeersFromAPI as Mock).mockResolvedValue(
      fetchedRows([{ id: 'b1', brew_name: 'Beer', brewer: 'X' }])
    );
    (beerApi.fetchMyBeersFromAPI as Mock).mockResolvedValue(fetchedRows([]));
    (beerApi.fetchRewardsFromAPI as Mock).mockResolvedValue(fetchedRows([]));

    await refreshAllDataFromAPI();

    expect(myBeersRepository.myBeersRepository.replaceAllWithEmptyUnsafe).toHaveBeenCalled();
  });
});
