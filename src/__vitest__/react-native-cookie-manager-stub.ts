import { vi } from 'vitest';

const CookieManager = {
  clearAllStores: vi.fn(async () => true),
};

export default CookieManager;
