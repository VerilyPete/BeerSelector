import { vi } from 'vitest';

/**
 * Stand-in for `expo-sqlite` in node-environment runs.
 *
 * The real package cannot be parsed by vite at all: `SQLiteProvider.ts` puts
 * JSX in a `.ts` file, which Metro's babel accepts and vite's esbuild rejects.
 * So the module has to be aliased away rather than merely mocked per-suite.
 *
 * The reader-shaped defaults below mirror `jest.setup.js`'s own `expo-sqlite`
 * mock, and that parity is load-bearing rather than cosmetic. An earlier
 * version made `openDatabaseAsync` a bare `vi.fn()` resolving to `undefined`;
 * suites that call a repository without awaiting it then rejected on
 * `db.getFirstAsync`, and vitest turned those unhandled rejections into a
 * **non-zero exit while printing every test as passed**. Green output and a
 * green process are different things — keep this returning a usable database.
 */
const mockDatabase = {
  execAsync: vi.fn().mockResolvedValue([{ rows: { _array: [] } }]),
  exec: vi.fn().mockResolvedValue([{ rows: { _array: [] } }]),
  runAsync: vi.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
  getFirstAsync: vi.fn().mockResolvedValue(null),
  getAllAsync: vi.fn().mockResolvedValue([]),
  closeAsync: vi.fn().mockResolvedValue(undefined),
  deleteAsync: vi.fn().mockResolvedValue(undefined),
  withTransactionAsync: vi.fn(async (callback: () => Promise<unknown>) => await callback()),
  prepareAsync: vi.fn().mockResolvedValue({
    executeAsync: vi.fn().mockResolvedValue({ getAllAsync: vi.fn().mockResolvedValue([]) }),
    finalizeAsync: vi.fn().mockResolvedValue(undefined),
  }),
};

export const openDatabaseAsync = vi.fn().mockResolvedValue(mockDatabase);
export const openDatabaseSync = vi.fn().mockReturnValue(mockDatabase);
export const openDatabase = vi.fn().mockReturnValue(mockDatabase);
export const deleteDatabaseAsync = vi.fn().mockResolvedValue(undefined);
export const deleteDatabaseSync = vi.fn();

export class SQLiteDatabase {}
export class SQLiteStatement {}

export const SQLiteProvider = () => null;
export const useSQLiteContext = vi.fn();
