/**
 * Type Safety Tests for Repository Pattern
 *
 * Tests verify that:
 * 1. Repository methods return correctly typed entities
 * 2. Type guards properly narrow types at runtime
 * 3. Generic type parameters enforce compile-time safety
 * 4. Invalid type assignments cause TypeScript errors
 *
 * This is a TDD file - tests define desired behavior before implementation
 */

import { BeerRepository } from '../BeerRepository';
import { MyBeersRepository } from '../MyBeersRepository';
import { RewardsRepository } from '../RewardsRepository';
import {
  Beer,
  Beerfinder,
  BeerWithContainerType,
  BeerfinderWithContainerType,
} from '@/src/types/beer';
import { Reward } from '@/src/types/database';
import { AllBeersRow, TastedBrewRow, RewardRow } from '../../schemaTypes';
import { toNonEmpty } from '../../../api/fetchOutcome';
import type { NonEmptyArray } from '../../../api/fetchOutcome';
import { getDatabase } from '../../connection';
import type { ContainerType } from '@/src/utils/beerGlassType';

// Mock the database connection
jest.mock('../../connection', () => ({
  getDatabase: jest.fn(),
}));

// Mock the lock manager
jest.mock('../../locks', () => ({
  databaseLockManager: {
    withDatabaseLock: jest.fn(async (_name: string, task: () => Promise<unknown>) => task()),
  },
}));

// getDatabase is replaced by the jest.mock factory above; cast it back to a
// mock so tests can configure its resolved value.
const mockedGetDatabase = getDatabase as jest.Mock;

/**
 * Narrow a literal fixture array for the NonEmptyArray-typed repository
 * signatures. Throws rather than asserting, so a fixture that is accidentally
 * empty fails loudly instead of lying to the type system.
 */
function nel<T>(items: readonly T[]): NonEmptyArray<T> {
  const narrowed = toNonEmpty(items);
  if (narrowed === null) throw new Error('fixture array was unexpectedly empty');
  return narrowed;
}

/**
 * Compile-time-only helper: checks that `value`'s type is assignable to T
 * without introducing an unused local variable. The parameter is never read
 * at runtime — TypeScript's noUnusedParameters and eslint's no-unused-vars
 * (configured with `args: 'none'`) both exempt unused parameters, so this
 * expresses a type-level assertion without a lint or type-check escape hatch.
 */
function assertType<T>(_value: T): void {}

describe('Repository Type Safety', () => {
  describe('BeerRepository Type Safety', () => {
    function createBeerRepository() {
      jest.clearAllMocks();
      return new BeerRepository();
    }

    it('getAll() should return Promise<Beer[]>', async () => {
      const repository = createBeerRepository();
      const mockDb = {
        getAllAsync: jest.fn().mockResolvedValue([
          {
            id: '1',
            brew_name: 'Test Beer',
            added_date: '2025-01-01',
            brewer: 'Test Brewery',
            brewer_loc: 'Austin, TX',
            brew_style: 'IPA',
            brew_container: 'Draft',
            review_count: '10',
            review_rating: '4.5',
            brew_description: 'Hoppy',
          } as AllBeersRow,
        ]),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const result = await repository.getAll();

      // TypeScript should infer result as Beer[]
      const beer: Beer = result[0];
      expect(beer.id).toBe('1');
      expect(beer.brew_name).toBe('Test Beer');

      // This should work - Beer has these properties
      assertType<string>(beer.brew_name);
      assertType<string | number | undefined>(beer.id);
    });

    it('getById() should return Promise<Beer | null>', async () => {
      const repository = createBeerRepository();
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({
          id: '1',
          brew_name: 'Test Beer',
          added_date: '2025-01-01',
          brewer: 'Test Brewery',
          brewer_loc: 'Austin, TX',
          brew_style: 'IPA',
          brew_container: 'Draft',
          review_count: '10',
          review_rating: '4.5',
          brew_description: 'Hoppy',
        } as AllBeersRow),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const result = await repository.getById('1');

      // TypeScript should infer result as Beer | null
      if (result) {
        const beer: Beer = result;
        expect(beer.id).toBe('1');
      }
    });

    it('search() should return Promise<Beer[]>', async () => {
      const repository = createBeerRepository();
      const mockDb = {
        getAllAsync: jest.fn().mockResolvedValue([]),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const result = await repository.search('IPA');

      // TypeScript should infer result as Beer[]
      const beers: Beer[] = result;
      expect(Array.isArray(beers)).toBe(true);
    });

    it('insertMany() should only accept Beer[]', async () => {
      const repository = createBeerRepository();
      const mockDb = {
        withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => {
          await callback();
        }),
        withExclusiveTransactionAsync: jest.fn(async (task: (txn: unknown) => Promise<void>) => {
          await task(mockDb);
        }),
        getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
        runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
        prepareAsync: jest.fn().mockResolvedValue({
          executeAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
          finalizeAsync: jest.fn().mockResolvedValue(undefined),
        }),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const validBeers: BeerWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer',
          added_date: '2025-01-01',
          brewer: 'Test Brewery',
          brewer_loc: 'Austin, TX',
          brew_style: 'IPA',
          container_type: 'pint',
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      await repository.insertMany(nel(validBeers));

      // TypeScript should prevent passing wrong type (not exercised at
      // runtime — this is a documented example, not a live assertion)
      // Should not allow Beerfinder[]:
      // await repository.insertMany([{ id: '1', brew_name: 'Test', tasted_date: '2025-01-01' }]);
    });
  });

  describe('MyBeersRepository Type Safety', () => {
    function createMyBeersRepository() {
      jest.clearAllMocks();
      return new MyBeersRepository();
    }

    it('getAll() should return Promise<BeerfinderWithContainerType[]>', async () => {
      const repository = createMyBeersRepository();
      const mockDb = {
        getAllAsync: jest.fn().mockResolvedValue([
          {
            id: '1',
            brew_name: 'Test Beer',
            roh_lap: '1',
            tasted_date: '2025-01-01',
            brewer: 'Test Brewery',
            brewer_loc: 'Austin, TX',
            brew_style: 'IPA',
            brew_container: 'Draft',
            review_count: '10',
            review_ratings: '4.5',
            brew_description: 'Hoppy',
            chit_code: 'ABC123',
            container_type: 'pint',
          } as TastedBrewRow,
        ]),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const result = await repository.getAll();

      // TypeScript should infer result as BeerfinderWithContainerType[]
      const beerfinder: BeerfinderWithContainerType = result[0];
      expect(beerfinder.id).toBe('1');
      expect(beerfinder.tasted_date).toBe('2025-01-01');
      expect(beerfinder.container_type).toBe('pint');

      // This should work - BeerfinderWithContainerType has these properties
      assertType<string | undefined>(beerfinder.tasted_date);
      assertType<string | undefined>(beerfinder.chit_code);
      assertType<ContainerType>(beerfinder.container_type);
    });

    it('getById() should return Promise<Beerfinder | null>', async () => {
      const repository = createMyBeersRepository();
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue(null),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const result = await repository.getById('1');

      // TypeScript should infer result as Beerfinder | null
      const nullable: Beerfinder | null = result;
      expect(nullable).toBeNull();
    });

    it('getCount() should return Promise<number>', async () => {
      const repository = createMyBeersRepository();
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({ count: 42 }),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const result = await repository.getCount();

      // TypeScript should infer result as number
      const count: number = result;
      expect(count).toBe(42);
    });

    it('insertMany() should only accept BeerfinderWithContainerType[]', async () => {
      const repository = createMyBeersRepository();
      const mockDb = {
        withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => {
          await callback();
        }),
        getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
        runAsync: jest.fn(),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const validBeerfinders: BeerfinderWithContainerType[] = [
        {
          id: '1',
          brew_name: 'Test Beer',
          tasted_date: '2025-01-01',
          roh_lap: '1',
          chit_code: 'ABC123',
          container_type: 'pint',
          abv: null,
          enrichment_confidence: null,
          enrichment_source: null,
        },
      ];

      await repository.insertMany(nel(validBeerfinders));

      // TypeScript should prevent passing wrong type (not exercised at
      // runtime — this is a documented example, not a live assertion)
      // Should not allow Beer[] (missing tasted_date, roh_lap, etc.):
      // await repository.insertMany([{ id: '1', brew_name: 'Test', added_date: '2025-01-01' }]);
    });
  });

  describe('RewardsRepository Type Safety', () => {
    function createRewardsRepository() {
      jest.clearAllMocks();
      return new RewardsRepository();
    }

    it('getAll() should return Promise<Reward[]>', async () => {
      const repository = createRewardsRepository();
      const mockDb = {
        getAllAsync: jest.fn().mockResolvedValue([
          {
            reward_id: 'PLATE_1',
            redeemed: 'false',
            reward_type: 'plate',
          } as RewardRow,
        ]),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const result = await repository.getAll();

      // TypeScript should infer result as Reward[]
      const reward: Reward = result[0];
      expect(reward.reward_id).toBe('PLATE_1');
      expect(reward.reward_type).toBe('plate');

      // This should work - Reward has these properties
      assertType<string>(reward.reward_id);
      assertType<string>(reward.reward_type);
    });

    it('getById() should return Promise<Reward | null>', async () => {
      const repository = createRewardsRepository();
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({
          reward_id: 'PLATE_1',
          redeemed: 'false',
          reward_type: 'plate',
        } as RewardRow),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const result = await repository.getById('PLATE_1');

      // TypeScript should infer result as Reward | null
      if (result) {
        const reward: Reward = result;
        expect(reward.reward_id).toBe('PLATE_1');
      }
    });

    it('getByType() should return Promise<Reward[]>', async () => {
      const repository = createRewardsRepository();
      const mockDb = {
        getAllAsync: jest.fn().mockResolvedValue([]),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const result = await repository.getByType('plate');

      // TypeScript should infer result as Reward[]
      const rewards: Reward[] = result;
      expect(Array.isArray(rewards)).toBe(true);
    });

    it('getCount() should return Promise<number>', async () => {
      const repository = createRewardsRepository();
      const mockDb = {
        getFirstAsync: jest.fn().mockResolvedValue({ count: 5 }),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const result = await repository.getCount();

      // TypeScript should infer result as number
      const count: number = result;
      expect(count).toBe(5);
    });

    it('insertMany() should only accept Reward[]', async () => {
      const repository = createRewardsRepository();
      const mockDb = {
        withTransactionAsync: jest.fn(async (callback: () => Promise<void>) => {
          await callback();
        }),
        runAsync: jest.fn(),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const validRewards: Reward[] = [
        {
          reward_id: 'PLATE_1',
          redeemed: 'false',
          reward_type: 'plate',
        },
      ];

      await repository.insertMany(validRewards);

      // TypeScript should prevent passing wrong type (not exercised at
      // runtime — this is a documented example, not a live assertion)
      // Should not allow Beer[]:
      // await repository.insertMany([{ id: '1', brew_name: 'Test' }]);
    });
  });

  describe('Type Guard Integration', () => {
    it('should use type guards to validate data at runtime', async () => {
      jest.clearAllMocks();
      const repository = new BeerRepository();

      const mockDb = {
        getAllAsync: jest.fn().mockResolvedValue([
          {
            id: '1',
            brew_name: 'Valid Beer',
            added_date: '2025-01-01',
          },
          {
            id: '', // Invalid - empty id
            brew_name: 'Invalid Beer',
          },
          {
            id: '2',
            brew_name: '', // Invalid - empty brew_name
          },
        ]),
      };

      mockedGetDatabase.mockResolvedValue(mockDb);

      const result = await repository.getAll();

      // Should only return valid beers (1 out of 3)
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
      expect(result[0].brew_name).toBe('Valid Beer');
    });
  });

  describe('Compile-Time Type Safety', () => {
    it('should enforce return types match repository entity types', () => {
      // These are compile-time checks - if they compile, the test passes

      const beerRepo = new BeerRepository();
      const myBeersRepo = new MyBeersRepository();
      const rewardsRepo = new RewardsRepository();

      // TypeScript should correctly infer these types
      type BeerRepoGetAll = ReturnType<typeof beerRepo.getAll>;
      type MyBeersRepoGetAll = ReturnType<typeof myBeersRepo.getAll>;
      type RewardsRepoGetAll = ReturnType<typeof rewardsRepo.getAll>;

      // These type assertions should pass at compile time
      assertType<Promise<Beer[]>>(beerRepo.getAll());
      assertType<Promise<BeerfinderWithContainerType[]>>(myBeersRepo.getAll());
      assertType<Promise<Reward[]>>(rewardsRepo.getAll());

      // Type-level assertions (compile-time only)
      type AssertBeerType = BeerRepoGetAll extends Promise<Beer[]> ? true : false;
      type AssertBeerfinderType =
        MyBeersRepoGetAll extends Promise<BeerfinderWithContainerType[]> ? true : false;
      type AssertRewardType = RewardsRepoGetAll extends Promise<Reward[]> ? true : false;

      assertType<AssertBeerType>(true);
      assertType<AssertBeerfinderType>(true);
      assertType<AssertRewardType>(true);
    });

    it('should prevent assigning wrong entity types', () => {
      const beerRepo = new BeerRepository();
      const myBeersRepo = new MyBeersRepository();

      // TypeScript should prevent these assignments
      // @ts-expect-error - Cannot assign Promise<Beer[]> to Promise<BeerfinderWithContainerType[]>
      const _wrong1: Promise<BeerfinderWithContainerType[]> = beerRepo.getAll();

      // @ts-expect-error - Cannot assign Promise<BeerfinderWithContainerType[]> to Promise<Beer[]>
      const _wrong2: Promise<Beer[]> = myBeersRepo.getAll();
    });
  });
});
