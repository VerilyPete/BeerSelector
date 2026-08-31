import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import DeveloperSection from '../DeveloperSection';
import { clearNativeCookies } from '@/src/api/nativeCookieManager';

jest.mock('@/hooks/useColorScheme', () => ({ useColorScheme: () => 'dark' }));
jest.mock('@/src/database/repositories/BeerRepository', () => ({
  beerRepository: {
    getAll: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/database/repositories/MyBeersRepository', () => ({
  myBeersRepository: {
    getAll: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/database/repositories/RewardsRepository', () => ({
  rewardsRepository: {
    getAll: jest.fn().mockResolvedValue([]),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/database/preferences', () => ({
  getPreference: jest.fn().mockResolvedValue(null),
  setPreference: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/services/taplistEtag', () => ({
  commitTaplistWrite: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/api/mockSession', () => ({ createMockSession: jest.fn() }));
jest.mock('@/src/api/sessionManager', () => ({
  clearSessionData: jest.fn().mockResolvedValue(undefined),
  clearAuthCookies: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/api/nativeCookieManager', () => ({
  clearNativeCookies: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/src/database/DatabaseLockManager', () => ({
  databaseLockManager: {
    withDatabaseLock: jest.fn(async (_name: string, operation: () => Promise<void>) => operation()),
  },
}));

describe('DeveloperSection reset', () => {
  beforeEach(() => jest.clearAllMocks());

  it('clears native cookies as part of a first-run reset', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId } = render(<DeveloperSection />);

    fireEvent.press(getByTestId('reset-first-run-button'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Reset Application',
        expect.any(String),
        expect.any(Array)
      )
    );
    const confirmationButtons = alertSpy.mock.calls.find(
      ([title]) => title === 'Reset Application'
    )?.[2];
    const reset = confirmationButtons?.find(button => button.text === 'Reset');
    expect(reset).toBeDefined();
    await reset?.onPress?.();

    await waitFor(() => expect(clearNativeCookies).toHaveBeenCalledTimes(1));
  });
});
