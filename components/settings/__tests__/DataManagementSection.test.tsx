import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import DataManagementSection from '../DataManagementSection';

jest.mock('@/hooks/useColorScheme', () => ({
  useColorScheme: jest.fn(() => 'dark'),
}));

describe('DataManagementSection', () => {
  it('routes the visible logout button to logout, not member login', () => {
    const onLogin = jest.fn();
    const onLogout = jest.fn();
    const { getByTestId } = render(
      <DataManagementSection
        apiUrlsConfigured
        refreshing={false}
        onRefresh={jest.fn().mockResolvedValue(undefined)}
        isFirstLogin={false}
        onLogin={onLogin}
        onLogout={onLogout}
        canGoBack
        onGoHome={jest.fn()}
      />
    );

    fireEvent.press(getByTestId('logout-button'));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onLogin).not.toHaveBeenCalled();
  });
});
