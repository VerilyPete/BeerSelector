# MP-2 Step 3A: Complete `any` Type Audit

**Date**: 2025-11-14
**Task**: Comprehensive audit of all `any` types in the BeerSelector codebase

## Summary Statistics

- **Total `any` occurrences found**: ~300+
- **Categorized by priority**: CRITICAL, HIGH, MEDIUM, LOW

## Priority Categories

### CRITICAL (Database & API Layer) - Must Fix

#### Database Layer
1. **src/database/repositories/RewardsRepository.ts:91**
   ```typescript
   const values: any[] = [];
   ```
   **Fix**: `const values: (string | number)[] = [];`
   **Impact**: Type safety for reward updates

2. **src/database/dataValidation.ts:79**
   ```typescript
   const beerObj = beer as Record<string, any>;
   ```
   **Fix**: Use proper Beer type or unknown
   **Impact**: Validation logic type safety

3. **src/database/repositories/__tests__/MyBeersRepository.test.ts:15, 23**
   ```typescript
   let mockDatabase: any;
   withTransactionAsync: jest.fn(async (callback: any) => await callback())
   ```
   **Fix**: Create proper mock type interface
   **Impact**: Test type safety

#### API Layer
4. **src/api/beerApi.ts:12**
   ```typescript
   export const fetchWithRetry = async (url: string, retries = 3, delay = 1000): Promise<any> => {
   ```
   **Fix**: `Promise<unknown>` or specific response type
   **Impact**: API response type safety

5. **src/api/beerApi.ts:73**
   ```typescript
   const findBeersArray = (obj: any): Beer[] | null => {
   ```
   **Fix**: `(obj: unknown): Beer[] | null`
   **Impact**: Beer array extraction type safety

6. **src/api/beerApi.ts:194, 195, 202**
   ```typescript
   const validBeers = beers.filter((beer: any) => beer && beer.id);
   const invalidBeers = beers.filter((beer: any) => !beer || !beer.id);
   invalidBeers.forEach((beer: any, index: number) => {
   ```
   **Fix**: Use `unknown` or proper Beer type
   **Impact**: Beer validation type safety

7. **src/api/apiClient.ts:219**
   ```typescript
   public async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
   ```
   **Fix**: `<T = unknown>` (generic default)
   **Impact**: Generic API client type safety

8. **src/api/apiClient.ts:292, 306**
   ```typescript
   public async post<T = any>(endpoint: string, data: Record<string, any>): Promise<ApiResponse<T>> {
   public async get<T = any>(endpoint: string, queryParams?: Record<string, any>): Promise<ApiResponse<T>> {
   ```
   **Fix**: `<T = unknown>` and `Record<string, unknown>`
   **Impact**: HTTP method type safety

9. **src/api/validators.ts:37, 104, 158-168, 201**
   ```typescript
   export function validateBrewInStockResponse(response: any): ValidationResult<any[]> {
   export function validateBeer(beer: any): ValidationResult<any> {
   export function validateBeerArray(beers: any[]): {
     validBeers: any[];
     invalidBeers: Array<{ beer: any; errors: string[] }>;
   }
   export function validateRewardsResponse(response: any): ValidationResult<any[]> {
   ```
   **Fix**: Use `unknown` for inputs, proper types for outputs
   **Impact**: Validation function type safety

10. **src/api/beerService.ts:57**
    ```typescript
    const response = await apiClient.post<any>('/addToQueue.php', requestData);
    ```
    **Fix**: Create proper response type
    **Impact**: Queue service type safety

### HIGH (Services & Utils) - Should Fix

11. **src/utils/errorLogger.ts:40, 71, 84**
    ```typescript
    additionalData?: Record<string, any>;
    function sanitizeData(data: any): any {
    const sanitized: any = {};
    ```
    **Fix**: Use `unknown` or proper types
    **Impact**: Error logging type safety

12. **src/utils/errorLogger.ts:291, 295**
    ```typescript
    export function withErrorLogging<T extends (...args: any[]) => Promise<any>>(
      return (async (...args: any[]) => {
    ```
    **Fix**: Proper generic constraints
    **Impact**: Error wrapper type safety

13. **src/utils/notificationUtils.ts:23, 73, 111**
    ```typescript
    originalError?: any;
    export function formatApiErrorForUser(error: any): string {
    export function createErrorResponse(error: any): ErrorResponse {
    ```
    **Fix**: Use `unknown` or Error type
    **Impact**: Error handling type safety

14. **src/types/api.ts:72**
    ```typescript
    data?: any;
    ```
    **Fix**: Use generic type parameter
    **Impact**: API response type safety

### MEDIUM (Components & Hooks) - Should Review

15. **hooks/useDataRefresh.ts:164, 168**
    ```typescript
    } catch (localError: any) {
    } catch (error: any) {
    ```
    **Fix**: `catch (error: unknown)`
    **Impact**: Error handling best practices

16. **hooks/useBeerFilters.ts:79, 80**
    ```typescript
    const partsA = ((a as any).tasted_date || '').split('/');
    const partsB = ((b as any).tasted_date || '').split('/');
    ```
    **Fix**: Use proper type narrowing or type guard
    **Impact**: Sorting logic type safety

17. **hooks/__tests__/useDataRefresh.test.ts:94, 99, 389, 394**
    ```typescript
    let resolveRefresh: any;
    mockManualRefreshAllData.mockReturnValue(delayedRefresh as any);
    ```
    **Fix**: Proper promise resolver types
    **Impact**: Test type safety

18. **components/Beerfinder.tsx:106, 138, 177, 188**
    ```typescript
    } catch (error: any) {
    ```
    **Fix**: `catch (error: unknown)`
    **Impact**: Error handling best practices

19. **components/Rewards.tsx:183**
    ```typescript
    } catch (err: any) {
    ```
    **Fix**: `catch (err: unknown)`
    **Impact**: Error handling best practices

20. **components/beer/BeerItem.tsx:72, 73**
    ```typescript
    const displayDate = (beer as any).tasted_date
    ? formatDateString((beer as any).tasted_date)
    ```
    **Fix**: Proper type narrowing or union type
    **Impact**: Beer display type safety

21. **app/_layout.tsx:171**
    ```typescript
    router.replace(initialRoute as any);
    ```
    **Fix**: Proper route typing
    **Impact**: Navigation type safety

22. **app/(tabs)/index.tsx:338**
    ```typescript
    onPress={() => router.push("/screens/rewards" as any)}
    ```
    **Fix**: Proper route typing
    **Impact**: Navigation type safety

23. **components/Beerfinder.tsx:381**
    ```typescript
    onPress={() => router.push("/screens/rewards" as any)}
    ```
    **Fix**: Proper route typing
    **Impact**: Navigation type safety

### LOW (Test Mocks & Test Utilities) - Can Keep or Fix

24. **Test files using `expect.any(Object)`, `expect.any(String)`, etc.**
    - These are Jest matchers and are acceptable
    - No changes needed

25. **Test mock components** (in `__mocks__/` and test files)
    ```typescript
    export const ThemedView = ({ children, style, ...props }: any) => (...)
    ```
    **Fix**: Could use proper React types, but low priority
    **Impact**: Test utility type safety (minimal)

26. **Test setup and mock implementations**
    - Many test files use `as any` for mocking
    - Generally acceptable in test context
    - Could be improved but not critical

27. **Database lock manager test access**
    ```typescript
    (databaseLockManager as any).lockHeld = false;
    ```
    **Fix**: Expose test utilities or use proper typing
    **Impact**: Test internals access (acceptable)

28. **Comments mentioning "any"** (not actual type usage)
    - Multiple comments like "// Check if there were any errors"
    - No changes needed

## Implementation Plan

### Phase 1: CRITICAL (Database & API) - Days 1-2
1. Fix RewardsRepository values array type
2. Fix beerApi.ts function return types and parameters
3. Fix apiClient.ts generic defaults and Record types
4. Fix validators.ts input/output types
5. Fix beerService.ts response type
6. Fix dataValidation.ts type assertion

### Phase 2: HIGH (Services & Utils) - Day 3
1. Fix errorLogger.ts types
2. Fix notificationUtils.ts error types
3. Fix api.ts data property type

### Phase 3: MEDIUM (Components & Hooks) - Day 4
1. Fix catch clause error types across hooks and components
2. Fix type assertions in components (BeerItem, routing)
3. Fix useBeerFilters type assertions

### Phase 4: LOW (Optional) - Day 5
1. Review and optionally fix test mock types
2. Document any remaining acceptable `any` usages

## Testing Strategy (TDD Approach)

### Before Refactoring
1. Run existing test suite to establish baseline
2. Ensure all tests pass

### During Refactoring
1. Write tests FIRST for each area being refactored
2. Update types, ensuring tests still pass
3. Add new tests to verify type safety

### After Refactoring
1. Run full test suite with coverage
2. Run TypeScript compiler in strict mode
3. Manually test critical flows (login, data refresh, beer browsing)

## Success Metrics

- [ ] Zero `any` types in database layer
- [ ] Zero `any` types in API layer
- [ ] Zero `any` types in services layer
- [ ] Minimal `any` types in components (only where necessary)
- [ ] All tests pass
- [ ] TypeScript compilation passes
- [ ] No runtime errors in manual testing
- [ ] Test coverage maintained or improved
