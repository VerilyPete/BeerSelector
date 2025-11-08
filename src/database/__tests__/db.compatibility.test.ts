/**
 * Compatibility Layer Tests for db.ts
 *
 * Verifies that db.ts correctly delegates to repositories without duplicate logic.
 * Part of HP-1 Step 7a.
 */

import { jest } from '@jest/globals';
import type { Beer, Beerfinder } from '../types';
import type { Reward } from '../../types/database';

// Mock the dependencies
jest.mock('../connection');
jest.mock('../locks');
jest.mock('../preferences');
jest.mock('../../api/beerApi');
jest.mock('../repositories/BeerRepository');
jest.mock('../repositories/MyBeersRepository');
jest.mock('../repositories/RewardsRepository');

describe('db.ts Compatibility Layer', () => {
  let mockBeerRepository: any;
  let mockMyBeersRepository: any;
  let mockRewardsRepository: any;
  let mockDatabase: any;
  let mockLockManager: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database instance
    mockDatabase = {
      withTransactionAsync: jest.fn((callback: Function) => callback()),
      runAsync: jest.fn(),
      getAllAsync: jest.fn(),
      getFirstAsync: jest.fn(),
    };

    // Mock lock manager
    mockLockManager = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn(),
    };

    // Mock repositories
    mockBeerRepository = {
      insertMany: jest.fn().mockResolvedValue(undefined),
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
      search: jest.fn().mockResolvedValue([]),
      getByStyle: jest.fn().mockResolvedValue([]),
      getByBrewer: jest.fn().mockResolvedValue([]),
      getUntasted: jest.fn().mockResolvedValue([]),
    };

    mockMyBeersRepository = {
      insertMany: jest.fn().mockResolvedValue(undefined),
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
      clear: jest.fn().mockResolvedValue(undefined),
      getCount: jest.fn().mockResolvedValue(0),
    };

    mockRewardsRepository = {
      insertMany: jest.fn().mockResolvedValue(undefined),
      getAll: jest.fn().mockResolvedValue([]),
      getById: jest.fn().mockResolvedValue(null),
      getByType: jest.fn().mockResolvedValue([]),
      getRedeemed: jest.fn().mockResolvedValue([]),
      getUnredeemed: jest.fn().mockResolvedValue([]),
      clear: jest.fn().mockResolvedValue(undefined),
      getCount: jest.fn().mockResolvedValue(0),
    };

    // Setup mock implementations
    const { getDatabase } = require('../connection');
    getDatabase.mockResolvedValue(mockDatabase);

    const { databaseLockManager } = require('../locks');
    Object.assign(databaseLockManager, mockLockManager);

    const BeerRepositoryModule = require('../repositories/BeerRepository');
    BeerRepositoryModule.beerRepository = mockBeerRepository;

    const MyBeersRepositoryModule = require('../repositories/MyBeersRepository');
    MyBeersRepositoryModule.myBeersRepository = mockMyBeersRepository;

    const RewardsRepositoryModule = require('../repositories/RewardsRepository');
    RewardsRepositoryModule.rewardsRepository = mockRewardsRepository;
  });

  describe('populateBeersTable', () => {
    it('should delegate to beerRepository.insertMany', async () => {
      const { populateBeersTable } = require('../db');
      const beers: Beer[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_rating: '4.5', brew_description: 'Good', added_date: '2025-01-01' }
      ];

      await populateBeersTable(beers);

      expect(mockBeerRepository.insertMany).toHaveBeenCalledWith(beers);
      expect(mockBeerRepository.insertMany).toHaveBeenCalledTimes(1);
    });

    it('should not contain duplicate INSERT logic (delegates to repository)', async () => {
      const { populateBeersTable } = require('../db');
      const beers: Beer[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_rating: '4.5', brew_description: 'Good', added_date: '2025-01-01' }
      ];

      await populateBeersTable(beers);

      // Verify no direct database operations (all handled by repository)
      expect(mockDatabase.runAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO allbeers')
      );
    });
  });

  describe('populateMyBeersTable', () => {
    it('should delegate to myBeersRepository.insertMany', async () => {
      const { populateMyBeersTable } = require('../db');
      const beers: Beerfinder[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_ratings: '4.5', brew_description: 'Good', roh_lap: '1', tasted_date: '2025-01-01', chit_code: 'ABC' }
      ];

      await populateMyBeersTable(beers);

      expect(mockMyBeersRepository.insertMany).toHaveBeenCalledWith(beers);
      expect(mockMyBeersRepository.insertMany).toHaveBeenCalledTimes(1);
    });

    it('should not contain duplicate INSERT logic (delegates to repository)', async () => {
      const { populateMyBeersTable } = require('../db');
      const beers: Beerfinder[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_ratings: '4.5', brew_description: 'Good', roh_lap: '1', tasted_date: '2025-01-01', chit_code: 'ABC' }
      ];

      await populateMyBeersTable(beers);

      // Verify no direct database operations (all handled by repository)
      expect(mockDatabase.runAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO tasted_brew_current_round')
      );
    });
  });

  describe('populateRewardsTable', () => {
    it('should delegate to rewardsRepository.insertMany', async () => {
      const { populateRewardsTable } = require('../db');
      const rewards: Reward[] = [
        { reward_id: '1', reward_type: 'plate', redeemed: '0' }
      ];

      await populateRewardsTable(rewards);

      expect(mockRewardsRepository.insertMany).toHaveBeenCalledWith(rewards);
      expect(mockRewardsRepository.insertMany).toHaveBeenCalledTimes(1);
    });

    it('should not contain duplicate INSERT logic (delegates to repository)', async () => {
      const { populateRewardsTable } = require('../db');
      const rewards: Reward[] = [
        { reward_id: '1', reward_type: 'plate', redeemed: '0' }
      ];

      await populateRewardsTable(rewards);

      // Verify no direct database operations (all handled by repository)
      expect(mockDatabase.runAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO rewards')
      );
    });
  });

  describe('getAllBeers', () => {
    it('should delegate to beerRepository.getAll', async () => {
      const { getAllBeers } = require('../db');
      const expectedBeers: Beer[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_rating: '4.5', brew_description: 'Good', added_date: '2025-01-01' }
      ];
      mockBeerRepository.getAll.mockResolvedValue(expectedBeers);

      const result = await getAllBeers();

      expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedBeers);
    });
  });

  describe('getMyBeers', () => {
    it('should delegate to myBeersRepository.getAll', async () => {
      const { getMyBeers } = require('../db');
      const expectedBeers: Beerfinder[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_ratings: '4.5', brew_description: 'Good', roh_lap: '1', tasted_date: '2025-01-01', chit_code: 'ABC' }
      ];
      mockMyBeersRepository.getAll.mockResolvedValue(expectedBeers);

      const result = await getMyBeers();

      expect(mockMyBeersRepository.getAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedBeers);
    });
  });

  describe('getAllRewards', () => {
    it('should delegate to rewardsRepository.getAll', async () => {
      const { getAllRewards } = require('../db');
      const expectedRewards: Reward[] = [
        { reward_id: '1', reward_type: 'plate', redeemed: '0' }
      ];
      mockRewardsRepository.getAll.mockResolvedValue(expectedRewards);

      const result = await getAllRewards();

      expect(mockRewardsRepository.getAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedRewards);
    });
  });

  describe('refreshBeersFromAPI', () => {
    it('should use beerRepository.insertMany for database operations', async () => {
      const { refreshBeersFromAPI } = require('../db');
      const { fetchBeersFromAPI } = require('../../api/beerApi');

      const mockBeers: Beer[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_rating: '4.5', brew_description: 'Good', added_date: '2025-01-01' }
      ];

      fetchBeersFromAPI.mockResolvedValue(mockBeers);
      mockBeerRepository.getAll.mockResolvedValue(mockBeers);

      await refreshBeersFromAPI();

      // Should fetch from API
      expect(fetchBeersFromAPI).toHaveBeenCalledTimes(1);

      // Should delegate insert to repository
      expect(mockBeerRepository.insertMany).toHaveBeenCalledWith(mockBeers);

      // Should get results from repository
      expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1);
    });

    it('should not contain duplicate INSERT logic', async () => {
      const { refreshBeersFromAPI } = require('../db');
      const { fetchBeersFromAPI } = require('../../api/beerApi');

      const mockBeers: Beer[] = [
        { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_rating: '4.5', brew_description: 'Good', added_date: '2025-01-01' }
      ];

      fetchBeersFromAPI.mockResolvedValue(mockBeers);
      mockBeerRepository.getAll.mockResolvedValue(mockBeers);

      await refreshBeersFromAPI();

      // Verify no direct database INSERT operations
      expect(mockDatabase.runAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO allbeers')
      );
    });
  });

  describe('Code Size Validation', () => {
    it('should have db.ts file size under 450 lines (thin wrapper)', () => {
      const fs = require('fs');
      const path = require('path');

      const dbFilePath = path.join(__dirname, '../db.ts');
      const dbFileContent = fs.readFileSync(dbFilePath, 'utf-8');
      const lineCount = dbFileContent.split('\n').length;

      console.log(`db.ts current line count: ${lineCount}`);

      // Original: 918 lines with duplicate INSERT logic
      // After refactoring: ~432 lines (53% reduction)
      // Target: ~300-450 lines (thin compatibility wrapper)
      // This is acceptable as we've:
      // - Eliminated all duplicate INSERT logic (delegated to repositories)
      // - Maintained backwards compatibility
      // - Separated concerns (repositories handle data access)
      expect(lineCount).toBeLessThan(450);
    });

    it('should not contain duplicate INSERT logic patterns', () => {
      const fs = require('fs');
      const path = require('path');

      const dbFilePath = path.join(__dirname, '../db.ts');
      const dbFileContent = fs.readFileSync(dbFilePath, 'utf-8');

      // Check that there are no INSERT statements for allbeers, tasted_brew_current_round, or rewards
      // except in backward compatibility wrappers that delegate to repositories
      const insertPatterns = [
        /INSERT OR REPLACE INTO allbeers/g,
        /INSERT OR REPLACE INTO tasted_brew_current_round/g,
        /INSERT OR REPLACE INTO rewards/g,
      ];

      insertPatterns.forEach((pattern) => {
        const matches = dbFileContent.match(pattern);

        // Should have 0 matches (all INSERT logic moved to repositories)
        if (matches) {
          console.log(`Found ${matches.length} duplicate INSERT statements: ${pattern}`);
          console.log('Matches:', matches);
        }

        expect(matches).toBeNull();
      });
    });
  });

  describe('Delegation Pattern Verification', () => {
    it('should delegate getBeerById to beerRepository.getById', async () => {
      const { getBeerById } = require('../db');
      const expectedBeer: Beer = { id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_rating: '4.5', brew_description: 'Good', added_date: '2025-01-01' };
      mockBeerRepository.getById.mockResolvedValue(expectedBeer);

      const result = await getBeerById('1');

      expect(mockBeerRepository.getById).toHaveBeenCalledWith('1');
      expect(result).toEqual(expectedBeer);
    });

    it('should delegate searchBeers to beerRepository.search', async () => {
      const { searchBeers } = require('../db');
      const expectedBeers: Beer[] = [{ id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_rating: '4.5', brew_description: 'Good', added_date: '2025-01-01' }];
      mockBeerRepository.search.mockResolvedValue(expectedBeers);

      const result = await searchBeers('Test');

      expect(mockBeerRepository.search).toHaveBeenCalledWith('Test');
      expect(result).toEqual(expectedBeers);
    });

    it('should delegate getBeersByStyle to beerRepository.getByStyle', async () => {
      const { getBeersByStyle } = require('../db');
      const expectedBeers: Beer[] = [{ id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_rating: '4.5', brew_description: 'Good', added_date: '2025-01-01' }];
      mockBeerRepository.getByStyle.mockResolvedValue(expectedBeers);

      const result = await getBeersByStyle('IPA');

      expect(mockBeerRepository.getByStyle).toHaveBeenCalledWith('IPA');
      expect(result).toEqual(expectedBeers);
    });

    it('should delegate getBeersByBrewer to beerRepository.getByBrewer', async () => {
      const { getBeersByBrewer } = require('../db');
      const expectedBeers: Beer[] = [{ id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_rating: '4.5', brew_description: 'Good', added_date: '2025-01-01' }];
      mockBeerRepository.getByBrewer.mockResolvedValue(expectedBeers);

      const result = await getBeersByBrewer('Test Brewery');

      expect(mockBeerRepository.getByBrewer).toHaveBeenCalledWith('Test Brewery');
      expect(result).toEqual(expectedBeers);
    });

    it('should delegate getBeersNotInMyBeers to beerRepository.getUntasted', async () => {
      const { getBeersNotInMyBeers } = require('../db');
      const expectedBeers: Beer[] = [{ id: '1', brew_name: 'Test Beer', brewer: 'Test Brewery', brewer_loc: 'TX', brew_style: 'IPA', brew_container: 'Draft', review_count: '10', review_rating: '4.5', brew_description: 'Good', added_date: '2025-01-01' }];
      mockBeerRepository.getUntasted.mockResolvedValue(expectedBeers);

      const result = await getBeersNotInMyBeers();

      expect(mockBeerRepository.getUntasted).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedBeers);
    });
  });
});
