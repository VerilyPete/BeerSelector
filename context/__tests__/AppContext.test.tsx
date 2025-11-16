/**
 * AppContext Test Suite
 *
 * Tests for the global application context that manages:
 * - User session state (login status, user info, visitor mode)
 * - Beer list state (allBeers, tastedBeers, rewards)
 * - Filter/search state
 * - Loading and error states
 *
 * This follows TDD principles - tests written before implementation
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { AppProvider, useAppContext } from '../AppContext';
import { getSessionData } from '@/src/api/sessionManager';
import { isVisitorMode } from '@/src/api/authService';
import type { SessionData } from '@/src/types/api';
import type { Beer, Beerfinder } from '@/src/types/beer';
import type { Reward } from '@/src/types/database';

// Mock dependencies
jest.mock('@/src/api/sessionManager');
jest.mock('@/src/api/authService');

// Mock the repository modules at the top level
jest.mock('@/src/database/repositories/BeerRepository', () => ({
  beerRepository: {
    getAll: jest.fn().mockResolvedValue([]),
    insertAll: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
  }
}));

jest.mock('@/src/database/repositories/MyBeersRepository', () => ({
  myBeersRepository: {
    getAll: jest.fn().mockResolvedValue([]),
    insertAll: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
  }
}));

jest.mock('@/src/database/repositories/RewardsRepository', () => ({
  rewardsRepository: {
    getAll: jest.fn().mockResolvedValue([]),
    insertAll: jest.fn().mockResolvedValue(undefined),
    clearAll: jest.fn().mockResolvedValue(undefined),
  }
}));

// Import the mocked repositories after mocking them
import { beerRepository } from '@/src/database/repositories/BeerRepository';
import { myBeersRepository } from '@/src/database/repositories/MyBeersRepository';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';

const mockGetSessionData = jest.mocked(getSessionData);
const mockIsVisitorMode = jest.mocked(isVisitorMode);
const mockBeerRepository = jest.mocked(beerRepository);
const mockMyBeersRepository = jest.mocked(myBeersRepository);
const mockRewardsRepository = jest.mocked(rewardsRepository);

describe('AppContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset timers before each test
    jest.useRealTimers();

    // Default mocks
    mockGetSessionData.mockResolvedValue(null);
    mockIsVisitorMode.mockResolvedValue(false);

    // Default repository mocks - empty data
    mockBeerRepository.getAll.mockResolvedValue([]);
    mockMyBeersRepository.getAll.mockResolvedValue([]);
    mockRewardsRepository.getAll.mockResolvedValue([]);
  });

  afterEach(() => {
    // Clean up any pending timers
    jest.clearAllTimers();
  });

  describe('Provider Rendering', () => {
    it('should render children without errors', async () => {
      const TestChild = () => <></>;
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      expect(result.current).toBeDefined();
    });

    it('should throw error when useAppContext is used outside provider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => {
        renderHook(() => useAppContext());
      }).toThrow('useAppContext must be used within an AppProvider');

      console.error = originalError;
    });
  });

  describe('Initial State', () => {
    it('should have correct default session state when not logged in', async () => {
      mockGetSessionData.mockResolvedValue(null);
      mockIsVisitorMode.mockResolvedValue(false);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
      });

      expect(result.current.session.isLoggedIn).toBe(false);
      expect(result.current.session.isVisitor).toBe(false);
      expect(result.current.session.userName).toBeUndefined();
      expect(result.current.session.userEmail).toBeUndefined();
      expect(result.current.session.memberId).toBeUndefined();
      expect(result.current.session.storeId).toBeUndefined();
      expect(result.current.session.storeName).toBeUndefined();
    });

    it('should load session data on mount when user is logged in', async () => {
      const mockSession: SessionData = {
        sessionId: 'test-session-123',
        memberId: 'member-456',
        storeId: 'store-789',
        storeName: 'Flying Saucer Dallas',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        cardNum: '12345',
      };

      mockGetSessionData.mockResolvedValue(mockSession);
      mockIsVisitorMode.mockResolvedValue(false);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
        expect(result.current.session.isLoggedIn).toBe(true);
      });

      expect(result.current.session.isVisitor).toBe(false);
      expect(result.current.session.userName).toBe('testuser');
      expect(result.current.session.userEmail).toBe('test@example.com');
      expect(result.current.session.memberId).toBe('member-456');
      expect(result.current.session.storeId).toBe('store-789');
      expect(result.current.session.storeName).toBe('Flying Saucer Dallas');
      expect(result.current.session.firstName).toBe('Test');
      expect(result.current.session.lastName).toBe('User');
      expect(result.current.session.cardNum).toBe('12345');
    });

    it('should detect visitor mode correctly', async () => {
      const mockVisitorSession: SessionData = {
        sessionId: 'visitor-session',
        memberId: 'visitor',
        storeId: 'store-123',
        storeName: 'Flying Saucer Austin',
      };

      mockGetSessionData.mockResolvedValue(mockVisitorSession);
      mockIsVisitorMode.mockResolvedValue(true);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
        expect(result.current.session.isLoggedIn).toBe(true);
      });

      expect(result.current.session.isVisitor).toBe(true);
      expect(result.current.session.memberId).toBe('visitor');
    });

    it('should have correct default beer list state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      expect(result.current.beers.allBeers).toEqual([]);
      expect(result.current.beers.tastedBeers).toEqual([]);
      expect(result.current.beers.rewards).toEqual([]);
    });

    it('should load beer data from database on mount', async () => {
      const mockBeers: Beer[] = [
        { id: 1, name: 'Test Beer', brewery: 'Test Brewery' } as Beer,
      ];
      const mockTastedBeers: Beerfinder[] = [
        { id: 2, name: 'Tasted Beer', hasTasted: true } as Beerfinder,
      ];
      const mockRewards: Reward[] = [
        { reward_id: '1', redeemed: 'false', reward_type: 'plate' } as Reward,
      ];

      mockBeerRepository.getAll.mockResolvedValue(mockBeers);
      mockMyBeersRepository.getAll.mockResolvedValue(mockTastedBeers);
      mockRewardsRepository.getAll.mockResolvedValue(mockRewards);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      expect(result.current.beers.allBeers).toEqual(mockBeers);
      expect(result.current.beers.tastedBeers).toEqual(mockTastedBeers);
      expect(result.current.beers.rewards).toEqual(mockRewards);

      // Verify repositories were called
      expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1);
      expect(mockMyBeersRepository.getAll).toHaveBeenCalledTimes(1);
      expect(mockRewardsRepository.getAll).toHaveBeenCalledTimes(1);
    });

    it('should have correct default filter state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      expect(result.current.filters.searchText).toBe('');
      expect(result.current.filters.selectedFilters).toEqual({});
      expect(result.current.filters.sortBy).toBeUndefined();
    });

    it('should have correct default loading state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      expect(result.current.loading.isLoadingRewards).toBe(false);
      expect(result.current.loading.isRefreshing).toBe(false);
    });

    it('should have correct default error state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      expect(result.current.errors.beerError).toBeNull();
      expect(result.current.errors.rewardError).toBeNull();
      expect(result.current.errors.sessionError).toBeNull();
    });
  });

  describe('Session State Updates', () => {
    it('should update session state on login', async () => {
      mockGetSessionData.mockResolvedValue(null);
      mockIsVisitorMode.mockResolvedValue(false);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
        expect(result.current.session.isLoggedIn).toBe(false);
      });

      const newSession: SessionData = {
        sessionId: 'new-session',
        memberId: 'new-member',
        storeId: 'store-1',
        storeName: 'Test Store',
        username: 'newuser',
        email: 'new@example.com',
      };

      act(() => {
        result.current.updateSession(newSession, false);
      });

      expect(result.current.session.isLoggedIn).toBe(true);
      expect(result.current.session.isVisitor).toBe(false);
      expect(result.current.session.userName).toBe('newuser');
      expect(result.current.session.userEmail).toBe('new@example.com');
    });

    it('should update session state for visitor login', async () => {
      mockGetSessionData.mockResolvedValue(null);
      mockIsVisitorMode.mockResolvedValue(false);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
        expect(result.current.session.isLoggedIn).toBe(false);
      });

      const visitorSession: SessionData = {
        sessionId: 'visitor-sess',
        memberId: 'visitor',
        storeId: 'store-2',
        storeName: 'Visitor Store',
      };

      act(() => {
        result.current.updateSession(visitorSession, true);
      });

      expect(result.current.session.isLoggedIn).toBe(true);
      expect(result.current.session.isVisitor).toBe(true);
      expect(result.current.session.memberId).toBe('visitor');
    });

    it('should clear session state on logout', async () => {
      const mockSession: SessionData = {
        sessionId: 'session-to-clear',
        memberId: 'member-to-clear',
        storeId: 'store-clear',
        storeName: 'Store To Clear',
        username: 'usertoclear',
        email: 'clear@example.com',
      };

      mockGetSessionData.mockResolvedValue(mockSession);
      mockIsVisitorMode.mockResolvedValue(false);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
        expect(result.current.session.isLoggedIn).toBe(true);
      });

      act(() => {
        result.current.clearSession();
      });

      expect(result.current.session.isLoggedIn).toBe(false);
      expect(result.current.session.isVisitor).toBe(false);
      expect(result.current.session.userName).toBeUndefined();
      expect(result.current.session.userEmail).toBeUndefined();
      expect(result.current.session.memberId).toBeUndefined();
    });

    it('should trigger re-render when session state updates', async () => {
      mockGetSessionData.mockResolvedValue(null);
      mockIsVisitorMode.mockResolvedValue(false);

      const { result, rerender } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
        expect(result.current.session.isLoggedIn).toBe(false);
      });

      const renderCount = result.current.session.isLoggedIn ? 1 : 0;

      const session: SessionData = {
        sessionId: 'test',
        memberId: 'test',
        storeId: 'test',
        storeName: 'test',
      };

      act(() => {
        result.current.updateSession(session, false);
      });

      rerender();

      expect(result.current.session.isLoggedIn).toBe(true);
      expect(result.current.session.isLoggedIn).not.toBe(renderCount === 1);
    });
  });

  describe('Beer List State Updates', () => {
    it('should update all beers state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      const mockBeers = [
        { id: 1, name: 'Beer 1', brewery: 'Brewery 1' },
        { id: 2, name: 'Beer 2', brewery: 'Brewery 2' },
      ];

      act(() => {
        result.current.setAllBeers(mockBeers as any);
      });

      expect(result.current.beers.allBeers).toEqual(mockBeers);
    });

    it('should update tasted beers state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      const mockTastedBeers = [
        { id: 1, name: 'Tasted Beer 1', hasTasted: true },
      ];

      act(() => {
        result.current.setTastedBeers(mockTastedBeers as any);
      });

      expect(result.current.beers.tastedBeers).toEqual(mockTastedBeers);
    });

    it('should update rewards state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      const mockRewards = [
        { reward_id: '1', redeemed: 'false', reward_type: 'plate' },
      ];

      act(() => {
        result.current.setRewards(mockRewards as any);
      });

      expect(result.current.beers.rewards).toEqual(mockRewards);
    });

    it('should refresh beer data from database', async () => {
      const initialBeers: Beer[] = [];
      const updatedBeers: Beer[] = [
        { id: 3, name: 'Updated Beer', brewery: 'Updated Brewery' } as Beer,
      ];
      const updatedTasted: Beerfinder[] = [
        { id: 4, name: 'Updated Tasted', hasTasted: true } as Beerfinder,
      ];
      const updatedRewards: Reward[] = [
        { reward_id: '2', redeemed: 'true', reward_type: 'glass' } as Reward,
      ];

      // Start with empty data
      mockBeerRepository.getAll.mockResolvedValue(initialBeers);
      mockMyBeersRepository.getAll.mockResolvedValue([]);
      mockRewardsRepository.getAll.mockResolvedValue([]);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      expect(result.current.beers.allBeers).toEqual(initialBeers);

      // Update the mock returns for refresh
      mockBeerRepository.getAll.mockResolvedValue(updatedBeers);
      mockMyBeersRepository.getAll.mockResolvedValue(updatedTasted);
      mockRewardsRepository.getAll.mockResolvedValue(updatedRewards);

      // Call refreshBeerData
      await act(async () => {
        await result.current.refreshBeerData();
      });

      expect(result.current.beers.allBeers).toEqual(updatedBeers);
      expect(result.current.beers.tastedBeers).toEqual(updatedTasted);
      expect(result.current.beers.rewards).toEqual(updatedRewards);

      // Verify repositories were called again (2 times total - once on mount, once on refresh)
      expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(2);
      expect(mockMyBeersRepository.getAll).toHaveBeenCalledTimes(2);
      expect(mockRewardsRepository.getAll).toHaveBeenCalledTimes(2);
    });
  });

  describe('Filter State Updates', () => {
    it('should update search text', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      act(() => {
        result.current.setSearchText('IPA');
      });

      expect(result.current.filters.searchText).toBe('IPA');
    });

    it('should update selected filters', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      const filters = { style: 'IPA', abv: '>7%' };

      act(() => {
        result.current.setSelectedFilters(filters);
      });

      expect(result.current.filters.selectedFilters).toEqual(filters);
    });

    it('should update sort by', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      act(() => {
        result.current.setSortBy('name');
      });

      expect(result.current.filters.sortBy).toBe('name');
    });

    it('should clear all filters', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      // Set some filters first
      act(() => {
        result.current.setSearchText('test');
        result.current.setSelectedFilters({ style: 'IPA' });
        result.current.setSortBy('name');
      });

      // Clear them
      act(() => {
        result.current.clearFilters();
      });

      expect(result.current.filters.searchText).toBe('');
      expect(result.current.filters.selectedFilters).toEqual({});
      expect(result.current.filters.sortBy).toBeUndefined();
    });
  });

  describe('Loading State Updates', () => {
    it('should update isLoadingBeers', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      act(() => {
        result.current.setLoadingBeers(true);
      });

      expect(result.current.loading.isLoadingBeers).toBe(true);

      act(() => {
        result.current.setLoadingBeers(false);
      });

      expect(result.current.loading.isLoadingBeers).toBe(false);
    });

    it('should update isLoadingRewards', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      act(() => {
        result.current.setLoadingRewards(true);
      });

      expect(result.current.loading.isLoadingRewards).toBe(true);
    });

    it('should update isRefreshing', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      act(() => {
        result.current.setRefreshing(true);
      });

      expect(result.current.loading.isRefreshing).toBe(true);
    });
  });

  describe('Error State Updates', () => {
    it('should update beer error', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      act(() => {
        result.current.setBeerError('Failed to load beers');
      });

      expect(result.current.errors.beerError).toBe('Failed to load beers');
    });

    it('should update reward error', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      act(() => {
        result.current.setRewardError('Failed to load rewards');
      });

      expect(result.current.errors.rewardError).toBe('Failed to load rewards');
    });

    it('should update session error', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      act(() => {
        result.current.setSessionError('Session expired');
      });

      expect(result.current.errors.sessionError).toBe('Session expired');
    });

    it('should clear all errors', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      // Set some errors first
      act(() => {
        result.current.setBeerError('Beer error');
        result.current.setRewardError('Reward error');
        result.current.setSessionError('Session error');
      });

      // Clear them
      act(() => {
        result.current.clearErrors();
      });

      expect(result.current.errors.beerError).toBeNull();
      expect(result.current.errors.rewardError).toBeNull();
      expect(result.current.errors.sessionError).toBeNull();
    });
  });

  describe('Session Loading on Mount', () => {
    it('should handle session loading error gracefully', async () => {
      mockGetSessionData.mockRejectedValue(new Error('Database error'));
      mockIsVisitorMode.mockResolvedValue(false);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
        expect(result.current.session.isLoggedIn).toBe(false);
      });

      // Should still be usable even with loading error
      expect(result.current.updateSession).toBeDefined();
      expect(result.current.clearSession).toBeDefined();
    });

    it('should reload session when refreshSession is called', async () => {
      mockGetSessionData
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          sessionId: 'refreshed-session',
          memberId: 'refreshed-member',
          storeId: 'store-1',
          storeName: 'Refreshed Store',
        });

      mockIsVisitorMode.mockResolvedValue(false);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingSession).toBe(false);
        expect(result.current.session.isLoggedIn).toBe(false);
      });

      await act(async () => {
        await result.current.refreshSession();
      });

      expect(result.current.session.isLoggedIn).toBe(true);
      expect(result.current.session.memberId).toBe('refreshed-member');
    });
  });

  describe('Error Handling', () => {
    it('should handle beer data loading error', async () => {
      // Mock repositories to throw errors
      mockBeerRepository.getAll.mockRejectedValue(new Error('Database error'));
      mockMyBeersRepository.getAll.mockResolvedValue([]);
      mockRewardsRepository.getAll.mockResolvedValue([]);

      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      // The error should be caught and handled
      expect(result.current.errors.beerError).toBe('Failed to load beer data from database');
      expect(result.current.beers.allBeers).toEqual([]);

      console.error = originalError;
    });

    it('should handle refreshBeerData error', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      // Mock repositories to throw errors on refresh
      mockBeerRepository.getAll.mockRejectedValue(new Error('Refresh error'));

      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      await act(async () => {
        await result.current.refreshBeerData();
      });

      expect(result.current.errors.beerError).toBe('Failed to refresh beer data from database');

      console.error = originalError;
    });
  });

  describe('TypeScript Type Safety', () => {
    it('should have properly typed session state', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      // Type assertions to ensure TypeScript types are correct
      const session = result.current.session;
      const _isLoggedIn: boolean = session.isLoggedIn;
      const _isVisitor: boolean = session.isVisitor;
      const _userName: string | undefined = session.userName;
      const _userEmail: string | undefined = session.userEmail;

      expect(typeof session.isLoggedIn).toBe('boolean');
      expect(typeof session.isVisitor).toBe('boolean');
    });

    it('should have properly typed action functions', async () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Wait for initial loading
      await waitFor(() => {
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      // Type assertions
      const _updateSession: (session: SessionData, isVisitor: boolean) => void = result.current.updateSession;
      const _clearSession: () => void = result.current.clearSession;
      const _setSearchText: (text: string) => void = result.current.setSearchText;
      const _refreshBeerData: () => Promise<void> = result.current.refreshBeerData;
      const _setBeerError: (error: string | null) => void = result.current.setBeerError;

      expect(typeof result.current.updateSession).toBe('function');
      expect(typeof result.current.clearSession).toBe('function');
      expect(typeof result.current.setSearchText).toBe('function');
      expect(typeof result.current.refreshBeerData).toBe('function');
      expect(typeof result.current.setBeerError).toBe('function');
    });
  });

  describe('Retry Logic', () => {
    let mockAlert: jest.SpyInstance;

    beforeEach(() => {
      // Use fake timers for controlling retry delays
      jest.useFakeTimers();

      // Mock Alert.alert
      mockAlert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation();

      // Clear all repository mocks
      jest.clearAllMocks();

      // Set default successful responses
      mockBeerRepository.getAll.mockResolvedValue([]);
      mockMyBeersRepository.getAll.mockResolvedValue([]);
      mockRewardsRepository.getAll.mockResolvedValue([]);
    });

    afterEach(() => {
      // Clean up
      jest.clearAllTimers();
      jest.useRealTimers();
      mockAlert.mockRestore();
    });

    it('should retry once and succeed on second attempt', async () => {
      // Suppress console output for cleaner test results
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      // Mock to fail once, then succeed
      mockBeerRepository.getAll
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce([{ id: 1, name: 'Success Beer' } as Beer]);

      mockMyBeersRepository.getAll.mockResolvedValue([]);
      mockRewardsRepository.getAll.mockResolvedValue([]);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Initial load should fail
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1);
      });

      // Advance time by 1 second for first retry
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Wait for retry to complete
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(2);
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      // Should have succeeded on retry
      expect(result.current.beers.allBeers).toEqual([{ id: 1, name: 'Success Beer' }]);
      expect(result.current.errors.beerError).toBeNull();

      // Alert should NOT have been called
      expect(mockAlert).not.toHaveBeenCalled();

      // Verify console logs
      expect(console.error).toHaveBeenCalledWith(
        '[AppContext] Error loading beer data (attempt 1/4):',
        expect.any(Error)
      );
      expect(console.log).toHaveBeenCalledWith(
        '[AppContext] Retrying in 1000ms (attempt 1/3)'
      );
      expect(console.log).toHaveBeenCalledWith(
        '[AppContext] Beer data loaded successfully'
      );

      // Restore console
      console.log = originalLog;
      console.error = originalError;
    });

    it('should retry twice and succeed on third attempt', async () => {
      // Suppress console output
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      // Mock to fail twice, then succeed
      mockBeerRepository.getAll
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValueOnce([{ id: 2, name: 'Third Time Success' } as Beer]);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Initial load should fail
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1);
      });

      // Advance time by 1 second for first retry
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Wait for first retry to fail
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(2);
      });

      // Advance time by 2 seconds for second retry (exponential backoff)
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      // Wait for second retry to succeed
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(3);
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      // Should have succeeded on third attempt
      expect(result.current.beers.allBeers).toEqual([{ id: 2, name: 'Third Time Success' }]);
      expect(result.current.errors.beerError).toBeNull();

      // Alert should NOT have been called
      expect(mockAlert).not.toHaveBeenCalled();

      // Verify retry delays
      expect(console.log).toHaveBeenCalledWith('[AppContext] Retrying in 1000ms (attempt 1/3)');
      expect(console.log).toHaveBeenCalledWith('[AppContext] Retrying in 2000ms (attempt 2/3)');

      // Restore console
      console.log = originalLog;
      console.error = originalError;
    });

    it('should fail after all retries and show alert', async () => {
      // Suppress console output
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      // Mock to fail all attempts (initial + 3 retries = 4 total)
      mockBeerRepository.getAll.mockRejectedValue(new Error('Persistent failure'));

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Initial load should fail
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1);
      });

      // Advance time by 1 second for first retry
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(2);
      });

      // Advance time by 2 seconds for second retry
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(3);
      });

      // Advance time by 4 seconds for third retry
      act(() => {
        jest.advanceTimersByTime(4000);
      });

      // Wait for final retry to fail
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(4);
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      // Should have error state set
      expect(result.current.errors.beerError).toBe('Failed to load beer data from database');
      expect(result.current.beers.allBeers).toEqual([]);

      // Alert should have been called on final failure
      expect(mockAlert).toHaveBeenCalledTimes(1);
      expect(mockAlert).toHaveBeenCalledWith(
        'Data Load Failed',
        'Unable to load beer data after multiple attempts. Please check your connection and restart the app.',
        [{ text: 'OK', style: 'default' }]
      );

      // Verify all retry attempts with correct delays
      expect(console.log).toHaveBeenCalledWith('[AppContext] Retrying in 1000ms (attempt 1/3)');
      expect(console.log).toHaveBeenCalledWith('[AppContext] Retrying in 2000ms (attempt 2/3)');
      expect(console.log).toHaveBeenCalledWith('[AppContext] Retrying in 4000ms (attempt 3/3)');

      // Restore console
      console.log = originalLog;
      console.error = originalError;
    });

    it('should cancel pending retries when component unmounts', async () => {
      // Suppress console output
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      // Mock to fail all attempts
      mockBeerRepository.getAll.mockRejectedValue(new Error('Will unmount before retry'));

      const { result, unmount } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Initial load should fail
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1);
      });

      // Verify retry is scheduled
      expect(console.log).toHaveBeenCalledWith('[AppContext] Retrying in 1000ms (attempt 1/3)');

      // Unmount before retry timer fires
      unmount();

      // Advance time past all retry delays
      act(() => {
        jest.advanceTimersByTime(10000); // Advance past all possible retries
      });

      // Should NOT have retried after unmount
      expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1); // Only initial attempt

      // Alert should NOT have been called after unmount
      expect(mockAlert).not.toHaveBeenCalled();

      // Restore console
      console.log = originalLog;
      console.error = originalError;
    });

    it('should not show alert if component unmounts during final failure', async () => {
      // Suppress console output
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      // Mock to fail all attempts
      mockBeerRepository.getAll.mockRejectedValue(new Error('Will unmount during retries'));

      const { unmount } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Initial load should fail
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1);
      });

      // Advance through all retries quickly
      act(() => {
        jest.advanceTimersByTime(1000); // First retry
      });

      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(2);
      });

      act(() => {
        jest.advanceTimersByTime(2000); // Second retry
      });

      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(3);
      });

      // Unmount just before final retry would complete
      unmount();

      act(() => {
        jest.advanceTimersByTime(4000); // Would be third retry
      });

      // Should not retry after unmount
      expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(3);

      // Alert should NOT have been called since component unmounted
      expect(mockAlert).not.toHaveBeenCalled();

      // Restore console
      console.log = originalLog;
      console.error = originalError;
    });

    it('should handle rapid mount/unmount cycles without memory leaks', async () => {
      // Suppress console output
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      // Mock to fail to trigger retries
      mockBeerRepository.getAll.mockRejectedValue(new Error('Rapid mount test'));

      // Mount and unmount multiple times rapidly
      for (let i = 0; i < 3; i++) {
        const { unmount } = renderHook(() => useAppContext(), {
          wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
        });

        // Wait for initial load attempt
        await waitFor(() => {
          expect(mockBeerRepository.getAll).toHaveBeenCalled();
        });

        // Unmount immediately
        unmount();
      }

      // Advance all timers
      act(() => {
        jest.runAllTimers();
      });

      // No alerts should have been shown
      expect(mockAlert).not.toHaveBeenCalled();

      // Restore console
      console.log = originalLog;
      console.error = originalError;
    });

    it('should clear error state when retry succeeds', async () => {
      // Suppress console output
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      // Mock to fail once, then succeed
      mockBeerRepository.getAll
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce([{ id: 3, name: 'Recovery Beer' } as Beer]);

      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Initial load should fail and set error
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1);
      });

      // Error should be set temporarily during retry
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error loading beer data'),
        expect.any(Error)
      );

      // Advance time for retry
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Wait for successful retry
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(2);
        expect(result.current.loading.isLoadingBeers).toBe(false);
      });

      // Error should be cleared after successful retry
      expect(result.current.errors.beerError).toBeNull();
      expect(result.current.beers.allBeers).toEqual([{ id: 3, name: 'Recovery Beer' }]);

      // Restore console
      console.log = originalLog;
      console.error = originalError;
    });

    it('should respect exponential backoff timing precisely', async () => {
      // Suppress console output
      const originalLog = console.log;
      const originalError = console.error;
      console.log = jest.fn();
      console.error = jest.fn();

      // Mock to fail all attempts
      mockBeerRepository.getAll.mockRejectedValue(new Error('Testing backoff'));

      renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Initial attempt
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1);
      });

      // Test that retry doesn't happen before delay
      act(() => {
        jest.advanceTimersByTime(999); // Just before 1 second
      });
      expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(1);

      // First retry at exactly 1 second
      act(() => {
        jest.advanceTimersByTime(1); // Complete 1 second
      });
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(2);
      });

      // Test second retry timing (2 seconds)
      act(() => {
        jest.advanceTimersByTime(1999); // Just before 2 seconds
      });
      expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(2);

      act(() => {
        jest.advanceTimersByTime(1); // Complete 2 seconds
      });
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(3);
      });

      // Test third retry timing (4 seconds)
      act(() => {
        jest.advanceTimersByTime(3999); // Just before 4 seconds
      });
      expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(3);

      act(() => {
        jest.advanceTimersByTime(1); // Complete 4 seconds
      });
      await waitFor(() => {
        expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(4);
      });

      // No more retries after max attempts
      act(() => {
        jest.advanceTimersByTime(10000);
      });
      expect(mockBeerRepository.getAll).toHaveBeenCalledTimes(4);

      // Restore console
      console.log = originalLog;
      console.error = originalError;
    });
  });
});