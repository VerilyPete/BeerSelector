/**
 * Behaviour tests for AppContext, driven through a probe consumer.
 *
 * Deliberately NOT `renderHook`: TESTING.md bans it for React Native hooks, and
 * `AppProvider` imports `Alert` from react-native (AppContext.tsx:38), which is
 * exactly the class of component that rule exists for. A probe that renders
 * state into `<Text testID>` and exposes actions via `<Pressable>` asserts the
 * same things through the public surface a real consumer uses.
 *
 * Everything here is driven through `refreshBeerData` rather than the mount
 * effect, so no test needs to advance a timer: the mount effect swallows a
 * failure into 3 retries at 1s/2s/4s before it surfaces anything, while
 * `refreshBeerData` sets and clears its error synchronously with the load.
 */

import React from 'react';
import { Alert, Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppProvider, useAppContext } from '../AppContext';
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode } from '@/src/api/authService';

jest.mock('@/src/database/repositories/BeerRepository');
jest.mock('@/src/database/repositories/MyBeersRepository');
jest.mock('@/src/database/repositories/RewardsRepository');
jest.mock('@/src/api/sessionManager');
jest.mock('@/src/api/authService');

describe('AppContext', () => {
  const mockBeers = [
    {
      id: '1',
      brew_name: 'Test IPA',
      brewer: 'Test Brewery',
      brew_style: 'IPA',
      brew_container: 'Draft',
      brew_description: 'A test beer',
      added_date: '1699564800',
      brewer_loc: 'Austin, TX',
      abv: '6.5',
      ibu: '60',
      container_type: 'tulip' as const,
    },
  ];

  /**
   * Renders the two pieces of state this file cares about and exposes the one
   * action that drives them. `beerError` is rendered as the literal string
   * 'none' when null so the assertion distinguishes "cleared" from "component
   * rendered nothing at all".
   */
  const Probe = () => {
    const { beers, errors, refreshBeerData } = useAppContext();

    return (
      <>
        <Text testID="beer-error">{errors.beerError ?? 'none'}</Text>
        <Text testID="beer-count">{String(beers.allBeers.length)}</Text>
        <Pressable
          testID="refresh"
          onPress={() => {
            void refreshBeerData();
          }}
        >
          <Text>refresh</Text>
        </Pressable>
      </>
    );
  };

  const renderProbe = () => render(<Probe />, { wrapper: AppProvider });

  beforeEach(() => {
    jest.clearAllMocks();

    (getSessionData as jest.Mock).mockResolvedValue(null);
    (isVisitorMode as jest.Mock).mockResolvedValue(false);
    (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);
    (myBeersRepository.getAll as jest.Mock).mockResolvedValue([]);
    (rewardsRepository.getAll as jest.Mock).mockResolvedValue([]);

    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  describe('refreshBeerData', () => {
    it('should clear a previous error once a refresh succeeds', async () => {
      // The error state has no working exit without this. `refreshBeerData` set
      // beerError in its catch and never cleared it on success, so Beerfinder's
      // Try Again — which routes handleRefresh -> onDataReloaded ->
      // refreshBeerData — refetched successfully and left the user staring at
      // the error screen. The only escape was visiting the All Beer tab, whose
      // loadBeers clears the flag as a side effect.
      const { getByTestId } = renderProbe();

      await waitFor(() => {
        expect(getByTestId('beer-count').props.children).toBe('1');
      });

      // Put the context into the error state through refreshBeerData's own
      // catch. No retries on this path, so no timers are needed.
      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('db gone'));

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('beer-error').props.children).toBe(
        'Failed to refresh beer data from database'
      );

      // The database recovers and the user presses Try Again.
      (beerRepository.getAll as jest.Mock).mockResolvedValue(mockBeers);

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      // Both assertions matter. Without the row count, a bare clearErrors()
      // that never reloaded anything would satisfy this test.
      expect(getByTestId('beer-error').props.children).toBe('none');
      expect(getByTestId('beer-count').props.children).toBe('1');
    });

    it('should surface an error when the refresh itself fails', async () => {
      // Guards the other half of the branch: clearing on success must not be
      // implemented by never setting the error in the first place.
      const { getByTestId } = renderProbe();

      await waitFor(() => {
        expect(getByTestId('beer-count').props.children).toBe('1');
      });

      (beerRepository.getAll as jest.Mock).mockRejectedValue(new Error('db gone'));

      await act(async () => {
        fireEvent.press(getByTestId('refresh'));
      });

      expect(getByTestId('beer-error').props.children).toBe(
        'Failed to refresh beer data from database'
      );
    });
  });
});
