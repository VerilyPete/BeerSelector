/**
 * Tests for Beer Data Integration in AppContext
 *
 * MP-4 Step 2: Verify that beer data (allBeers, tastedBeers, rewards) can be
 * stored in context, updated via actions, and accessible by components.
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AppProvider, useAppContext } from '../AppContext';
import type { Beer, Beerfinder } from '@/src/types/beer';
import type { Reward } from '@/src/types/database';

// Mock dependencies
jest.mock('@/src/api/sessionManager', () => ({
  getSessionData: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/src/api/authService', () => ({
  isVisitorMode: jest.fn().mockResolvedValue(false),
}));

describe('AppContext - Beer Data Integration', () => {
  describe('setAllBeers', () => {
    it('should update allBeers in context', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: AppProvider,
      });

      // Wait for session loading to complete
      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      // Initial state should be empty
      expect(result.current.beers.allBeers).toEqual([]);

      const mockBeers: Beer[] = [
        {
          id: '1',
          brew_name: 'Test IPA',
          brewer: 'Test Brewery',
          brew_style: 'IPA',
          brew_abv: '6.5',
          brew_ibu: '65',
          brew_container: 'Draft',
          brewer_loc: 'Austin, TX',
          added_date: '1234567890',
        },
        {
          id: '2',
          brew_name: 'Test Stout',
          brewer: 'Test Brewery',
          brew_style: 'Stout',
          brew_abv: '8.0',
          brew_ibu: '40',
          brew_container: 'Bottle',
          brewer_loc: 'Portland, OR',
          added_date: '1234567891',
        },
      ];

      // Update allBeers
      act(() => {
        result.current.setAllBeers(mockBeers);
      });

      // Verify state updated
      expect(result.current.beers.allBeers).toEqual(mockBeers);
      expect(result.current.beers.allBeers.length).toBe(2);
    });

    it('should not affect tastedBeers or rewards when updating allBeers', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: AppProvider,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      const mockBeers: Beer[] = [
        {
          id: '1',
          brew_name: 'Test IPA',
          brewer: 'Test Brewery',
          brew_style: 'IPA',
          brew_abv: '6.5',
          brew_ibu: '65',
          brew_container: 'Draft',
          brewer_loc: 'Austin, TX',
          added_date: '1234567890',
        },
      ];

      act(() => {
        result.current.setAllBeers(mockBeers);
      });

      // Other beer data should remain unchanged
      expect(result.current.beers.tastedBeers).toEqual([]);
      expect(result.current.beers.rewards).toEqual([]);
    });
  });

  describe('setTastedBeers', () => {
    it('should update tastedBeers in context', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: AppProvider,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      expect(result.current.beers.tastedBeers).toEqual([]);

      const mockTastedBeers: Beerfinder[] = [
        {
          id: '1',
          brew_name: 'Tasted IPA',
          brewer: 'Test Brewery',
          brew_style: 'IPA',
          brew_abv: '6.5',
          brew_ibu: '65',
          brew_container: 'Draft',
          brewer_loc: 'Austin, TX',
          added_date: '1234567890',
          tasted: '1',
          tasted_date: '01/15/2024',
        },
      ];

      act(() => {
        result.current.setTastedBeers(mockTastedBeers);
      });

      expect(result.current.beers.tastedBeers).toEqual(mockTastedBeers);
      expect(result.current.beers.tastedBeers.length).toBe(1);
    });

    it('should not affect allBeers or rewards when updating tastedBeers', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: AppProvider,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      const mockTastedBeers: Beerfinder[] = [
        {
          id: '1',
          brew_name: 'Tasted IPA',
          brewer: 'Test Brewery',
          brew_style: 'IPA',
          brew_abv: '6.5',
          brew_ibu: '65',
          brew_container: 'Draft',
          brewer_loc: 'Austin, TX',
          added_date: '1234567890',
          tasted: '1',
          tasted_date: '01/15/2024',
        },
      ];

      act(() => {
        result.current.setTastedBeers(mockTastedBeers);
      });

      expect(result.current.beers.allBeers).toEqual([]);
      expect(result.current.beers.rewards).toEqual([]);
    });
  });

  describe('setRewards', () => {
    it('should update rewards in context', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: AppProvider,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      expect(result.current.beers.rewards).toEqual([]);

      const mockRewards: Reward[] = [
        {
          reward_id: '1',
          reward_type: 'Free Beer',
          redeemed: '0',
        },
        {
          reward_id: '2',
          reward_type: 'T-Shirt',
          redeemed: '1',
        },
      ];

      act(() => {
        result.current.setRewards(mockRewards);
      });

      expect(result.current.beers.rewards).toEqual(mockRewards);
      expect(result.current.beers.rewards.length).toBe(2);
    });

    it('should not affect allBeers or tastedBeers when updating rewards', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: AppProvider,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      const mockRewards: Reward[] = [
        {
          reward_id: '1',
          reward_type: 'Free Beer',
          redeemed: '0',
        },
      ];

      act(() => {
        result.current.setRewards(mockRewards);
      });

      expect(result.current.beers.allBeers).toEqual([]);
      expect(result.current.beers.tastedBeers).toEqual([]);
    });
  });

  describe('Loading states', () => {
    it('should update isLoadingBeers state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: AppProvider,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      expect(result.current.loading.isLoadingBeers).toBe(false);

      act(() => {
        result.current.setLoadingBeers(true);
      });

      expect(result.current.loading.isLoadingBeers).toBe(true);

      act(() => {
        result.current.setLoadingBeers(false);
      });

      expect(result.current.loading.isLoadingBeers).toBe(false);
    });

    it('should update isLoadingRewards state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: AppProvider,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      expect(result.current.loading.isLoadingRewards).toBe(false);

      act(() => {
        result.current.setLoadingRewards(true);
      });

      expect(result.current.loading.isLoadingRewards).toBe(true);

      act(() => {
        result.current.setLoadingRewards(false);
      });

      expect(result.current.loading.isLoadingRewards).toBe(false);
    });
  });

  describe('Error states', () => {
    it('should update beerError state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: AppProvider,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      expect(result.current.errors.beerError).toBe(null);

      act(() => {
        result.current.setBeerError('Failed to load beers');
      });

      expect(result.current.errors.beerError).toBe('Failed to load beers');

      act(() => {
        result.current.setBeerError(null);
      });

      expect(result.current.errors.beerError).toBe(null);
    });

    it('should update rewardError state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: AppProvider,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      expect(result.current.errors.rewardError).toBe(null);

      act(() => {
        result.current.setRewardError('Failed to load rewards');
      });

      expect(result.current.errors.rewardError).toBe('Failed to load rewards');

      act(() => {
        result.current.setRewardError(null);
      });

      expect(result.current.errors.rewardError).toBe(null);
    });
  });

  describe('Complete beer data workflow', () => {
    it('should handle loading -> success -> error flow for beers', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: AppProvider,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      // Start loading
      act(() => {
        result.current.setLoadingBeers(true);
      });

      expect(result.current.loading.isLoadingBeers).toBe(true);
      expect(result.current.beers.allBeers).toEqual([]);
      expect(result.current.errors.beerError).toBe(null);

      // Simulate successful load
      const mockBeers: Beer[] = [
        {
          id: '1',
          brew_name: 'Test Beer',
          brewer: 'Test',
          brew_style: 'IPA',
          brew_abv: '5',
          brew_ibu: '50',
          brew_container: 'Draft',
          brewer_loc: 'TX',
          added_date: '123',
        },
      ];

      act(() => {
        result.current.setAllBeers(mockBeers);
        result.current.setLoadingBeers(false);
      });

      expect(result.current.loading.isLoadingBeers).toBe(false);
      expect(result.current.beers.allBeers).toEqual(mockBeers);
      expect(result.current.errors.beerError).toBe(null);

      // Simulate error on next load
      act(() => {
        result.current.setLoadingBeers(true);
      });

      act(() => {
        result.current.setBeerError('Network error');
        result.current.setLoadingBeers(false);
      });

      expect(result.current.loading.isLoadingBeers).toBe(false);
      expect(result.current.errors.beerError).toBe('Network error');
      // Previous beer data should still be available
      expect(result.current.beers.allBeers).toEqual(mockBeers);
    });
  });
});
