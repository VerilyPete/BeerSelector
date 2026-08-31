import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { logout } from '@/src/api/authService';
import SettingsScreen from '../settings';

const mockRefreshSession = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/hooks/useColorScheme', () => ({ useColorScheme: jest.fn(() => 'dark') }));
jest.mock('@/hooks/useSettingsState', () => ({
  useSettingsState: jest.fn(() => ({
    apiUrlsConfigured: true,
    isFirstLogin: false,
    canGoBack: true,
    loadPreferences: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@/hooks/useSettingsRefresh', () => ({
  useSettingsRefresh: jest.fn(() => ({
    refreshing: false,
    handleRefresh: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('@/hooks/useLoginFlow', () => ({
  useLoginFlow: jest.fn(() => ({
    isLoggingIn: false,
    loginWebViewVisible: false,
    startMemberLogin: jest.fn(),
    handleLoginSuccess: jest.fn(),
    handleLoginCancel: jest.fn(),
  })),
}));
jest.mock('@/context/AppContext', () => ({
  useAppContext: jest.fn(() => ({
    refreshBeerData: jest.fn().mockResolvedValue(undefined),
    refreshSession: mockRefreshSession,
  })),
}));
jest.mock('@/src/api/authService', () => ({
  logout: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/components/LoginWebView', () => () => null);
jest.mock('@/components/settings/AboutSection', () => () => null);
jest.mock('@/components/settings/DeveloperSection', () => () => null);
jest.mock('@/components/settings/WelcomeSection', () => () => null);
describe('SettingsScreen logout integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (logout as jest.Mock).mockResolvedValue({ success: true });
    mockRefreshSession.mockResolvedValue(undefined);
  });

  it('calls the auth logout service and refreshes in-memory session state', async () => {
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('logout-button'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });
});
