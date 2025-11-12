# Migration Guide: db.ts → Repositories

## Overview

The `src/database/db.ts` compatibility layer is deprecated and will be removed in a future version. All database operations should now use repositories directly for better separation of concerns, improved testability, and clearer data access patterns.

## Why Migrate?

1. **Better Architecture**: Direct repository usage follows the repository pattern correctly
2. **Improved Testability**: Repositories are easier to mock and test
3. **Performance**: Removes unnecessary function call indirection
4. **Type Safety**: Repositories provide better TypeScript types
5. **Clarity**: Makes data flow explicit and easier to reason about

## Migration Steps

### 1. Update Imports

**Before (deprecated):**
```typescript
import {
  getAllBeers,
  getMyBeers,
  getAllRewards,
  populateBeersTable,
  populateMyBeersTable,
  populateRewardsTable
} from '@/database/db';
```

**After (recommended):**
```typescript
import { beerRepository } from '@/database/repositories/BeerRepository';
import { myBeersRepository } from '@/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/database/repositories/RewardsRepository';
```

### 2. Update Function Calls

#### Beer Operations

| Old API (deprecated) | New API (recommended) |
|---------------------|----------------------|
| `getAllBeers()` | `beerRepository.getAll()` |
| `getBeerById(id)` | `beerRepository.getById(id)` |
| `searchBeers(query)` | `beerRepository.search(query)` |
| `getBeersByStyle(style)` | `beerRepository.getByStyle(style)` |
| `getBeersByBrewer(brewer)` | `beerRepository.getByBrewer(brewer)` |
| `populateBeersTable(beers)` | `beerRepository.insertMany(beers)` |
| `refreshBeersFromAPI()` | `beerRepository.insertMany(await fetchBeersFromAPI())` |
| `getBeersNotInMyBeers()` | `beerRepository.getUntasted()` |

#### My Beers Operations

| Old API (deprecated) | New API (recommended) |
|---------------------|----------------------|
| `getMyBeers()` | `myBeersRepository.getAll()` |
| `populateMyBeersTable(beers)` | `myBeersRepository.insertMany(beers)` |
| `fetchAndPopulateMyBeers()` | `myBeersRepository.insertMany(await fetchMyBeersFromAPI())` |

#### Rewards Operations

| Old API (deprecated) | New API (recommended) |
|---------------------|----------------------|
| `getAllRewards()` | `rewardsRepository.getAll()` |
| `populateRewardsTable(rewards)` | `rewardsRepository.insertMany(rewards)` |
| `fetchAndPopulateRewards()` | `rewardsRepository.insertMany(await fetchRewardsFromAPI())` |

### 3. Example Migrations

#### Example 1: Simple Component

**Before:**
```typescript
import { getAllBeers } from '@/database/db';

export function AllBeersComponent() {
  const [beers, setBeers] = useState<Beer[]>([]);

  useEffect(() => {
    const loadBeers = async () => {
      const data = await getAllBeers();
      setBeers(data);
    };
    loadBeers();
  }, []);

  return <BeerList beers={beers} />;
}
```

**After:**
```typescript
import { beerRepository } from '@/database/repositories/BeerRepository';

export function AllBeersComponent() {
  const [beers, setBeers] = useState<Beer[]>([]);

  useEffect(() => {
    const loadBeers = async () => {
      const data = await beerRepository.getAll();
      setBeers(data);
    };
    loadBeers();
  }, []);

  return <BeerList beers={beers} />;
}
```

#### Example 2: Data Refresh

**Before:**
```typescript
import { refreshBeersFromAPI } from '@/database/db';

const handleRefresh = async () => {
  setRefreshing(true);
  try {
    const beers = await refreshBeersFromAPI();
    setBeers(beers);
  } finally {
    setRefreshing(false);
  }
};
```

**After:**
```typescript
import { beerRepository } from '@/database/repositories/BeerRepository';
import { fetchBeersFromAPI } from '@/api/beerApi';

const handleRefresh = async () => {
  setRefreshing(true);
  try {
    const freshBeers = await fetchBeersFromAPI();
    await beerRepository.insertMany(freshBeers);
    const beers = await beerRepository.getAll();
    setBeers(beers);
  } finally {
    setRefreshing(false);
  }
};
```

#### Example 3: Multiple Operations

**Before:**
```typescript
import { getAllBeers, getMyBeers, getAllRewards } from '@/database/db';

const loadAllData = async () => {
  const [beers, myBeers, rewards] = await Promise.all([
    getAllBeers(),
    getMyBeers(),
    getAllRewards()
  ]);
  // ... use data
};
```

**After:**
```typescript
import { beerRepository } from '@/database/repositories/BeerRepository';
import { myBeersRepository } from '@/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/database/repositories/RewardsRepository';

const loadAllData = async () => {
  const [beers, myBeers, rewards] = await Promise.all([
    beerRepository.getAll(),
    myBeersRepository.getAll(),
    rewardsRepository.getAll()
  ]);
  // ... use data
};
```

### 4. Testing Updates

**Before:**
```typescript
import * as db from '@/database/db';

jest.mock('@/database/db');
const mockGetAllBeers = db.getAllBeers as jest.MockedFunction<typeof db.getAllBeers>;

it('loads beers', async () => {
  mockGetAllBeers.mockResolvedValue(mockBeers);
  // ... test
});
```

**After:**
```typescript
import { beerRepository } from '@/database/repositories/BeerRepository';

jest.mock('@/database/repositories/BeerRepository');
const mockBeerRepo = jest.mocked(beerRepository);

it('loads beers', async () => {
  mockBeerRepo.getAll.mockResolvedValue(mockBeers);
  // ... test
});
```

### 5. Common Patterns

#### Pattern: Fetch and Populate

**Before:**
```typescript
await fetchAndPopulateMyBeers();
```

**After:**
```typescript
import { myBeersRepository } from '@/database/repositories/MyBeersRepository';
import { fetchMyBeersFromAPI } from '@/api/beerApi';

const myBeers = await fetchMyBeersFromAPI();
await myBeersRepository.insertMany(myBeers);
```

#### Pattern: Conditional Data Loading

**Before:**
```typescript
const beers = isVisitorMode
  ? await getBeersNotInMyBeers()
  : await getAllBeers();
```

**After:**
```typescript
const beers = isVisitorMode
  ? await beerRepository.getUntasted()
  : await beerRepository.getAll();
```

### 6. Benefits After Migration

- ✅ **No deprecation warnings** in development console
- ✅ **Better IDE autocomplete** for repository methods
- ✅ **Clearer code structure** - explicit data access patterns
- ✅ **Easier testing** - direct repository mocking
- ✅ **Future-proof** - ready for db.ts removal

## Files Still Using db.ts

As of the migration start, the following files still import from db.ts:

- `app/_layout.tsx` - App initialization
- `app/(tabs)/index.tsx` - All Beers tab
- `app/(tabs)/beerlist.tsx` - Beerfinder tab
- `app/(tabs)/tastedbrews.tsx` - Tasted Brews tab
- `app/screens/rewards.tsx` - Rewards screen
- `app/settings.tsx` - Settings screen
- `components/AllBeers.tsx` - Beer list component
- `components/Beerfinder.tsx` - Beer search component
- `components/TastedBrewList.tsx` - Tasted beers component
- `components/Rewards.tsx` - Rewards component
- `src/api/authService.ts` - Authentication service
- `src/services/dataUpdateService.ts` - Data refresh service

These will be migrated progressively in HP-7 Steps 2-4.

## Questions?

See the repository implementations in:
- `src/database/repositories/BeerRepository.ts`
- `src/database/repositories/MyBeersRepository.ts`
- `src/database/repositories/RewardsRepository.ts`

Each repository provides comprehensive JSDoc comments and TypeScript types.
