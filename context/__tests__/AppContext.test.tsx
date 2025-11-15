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

// Mock dependencies
jest.mock('@/src/api/sessionManager');
jest.mock('@/src/api/authService');

const mockGetSessionData = jest.mocked(getSessionData);
const mockIsVisitorMode = jest.mocked(isVisitorMode);

describe('AppContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mocks
    mockGetSessionData.mockResolvedValue(null);
    mockIsVisitorMode.mockResolvedValue(false);
  });

  describe('Provider Rendering', () => {
    it('should render children without errors', () => {
      const TestChild = () => <></>;
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
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
        expect(result.current.session.isLoggedIn).toBe(false);
      });

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
        expect(result.current.session.isLoggedIn).toBe(true);
      });

      expect(result.current.session.isVisitor).toBe(true);
      expect(result.current.session.memberId).toBe('visitor');
    });

    it('should have correct default beer list state', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      expect(result.current.beers.allBeers).toEqual([]);
      expect(result.current.beers.tastedBeers).toEqual([]);
      expect(result.current.beers.rewards).toEqual([]);
    });

    it('should have correct default filter state', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      expect(result.current.filters.searchText).toBe('');
      expect(result.current.filters.selectedFilters).toEqual({});
      expect(result.current.filters.sortBy).toBeUndefined();
    });

    it('should have correct default loading state', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      expect(result.current.loading.isLoadingBeers).toBe(false);
      expect(result.current.loading.isLoadingRewards).toBe(false);
      expect(result.current.loading.isRefreshing).toBe(false);
    });

    it('should have correct default error state', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
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
    it('should update all beers state', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
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

    it('should update tasted beers state', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      const mockTastedBeers = [
        { id: 1, name: 'Tasted Beer 1', hasTasted: true },
      ];

      act(() => {
        result.current.setTastedBeers(mockTastedBeers as any);
      });

      expect(result.current.beers.tastedBeers).toEqual(mockTastedBeers);
    });

    it('should update rewards state', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      const mockRewards = [
        { reward_id: '1', redeemed: 'false', reward_type: 'plate' },
      ];

      act(() => {
        result.current.setRewards(mockRewards as any);
      });

      expect(result.current.beers.rewards).toEqual(mockRewards);
    });
  });

  describe('Filter State Updates', () => {
    it('should update search text', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      act(() => {
        result.current.setSearchText('IPA');
      });

      expect(result.current.filters.searchText).toBe('IPA');
    });

    it('should update selected filters', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      const filters = { style: 'IPA', abv: '>7%' };

      act(() => {
        result.current.setSelectedFilters(filters);
      });

      expect(result.current.filters.selectedFilters).toEqual(filters);
    });

    it('should update sort by', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      act(() => {
        result.current.setSortBy('name');
      });

      expect(result.current.filters.sortBy).toBe('name');
    });

    it('should clear all filters', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
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
    it('should update isLoadingBeers', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
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

    it('should update isLoadingRewards', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      act(() => {
        result.current.setLoadingRewards(true);
      });

      expect(result.current.loading.isLoadingRewards).toBe(true);
    });

    it('should update isRefreshing', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      act(() => {
        result.current.setRefreshing(true);
      });

      expect(result.current.loading.isRefreshing).toBe(true);
    });
  });

  describe('Error State Updates', () => {
    it('should update beer error', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      act(() => {
        result.current.setBeerError('Failed to load beers');
      });

      expect(result.current.errors.beerError).toBe('Failed to load beers');
    });

    it('should update reward error', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      act(() => {
        result.current.setRewardError('Failed to load rewards');
      });

      expect(result.current.errors.rewardError).toBe('Failed to load rewards');
    });

    it('should update session error', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      act(() => {
        result.current.setSessionError('Session expired');
      });

      expect(result.current.errors.sessionError).toBe('Session expired');
    });

    it('should clear all errors', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
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
        expect(result.current.session.isLoggedIn).toBe(false);
      });

      await act(async () => {
        await result.current.refreshSession();
      });

      expect(result.current.session.isLoggedIn).toBe(true);
      expect(result.current.session.memberId).toBe('refreshed-member');
    });
  });

  describe('TypeScript Type Safety', () => {
    it('should have properly typed session state', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
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

    it('should have properly typed action functions', () => {
      const { result } = renderHook(() => useAppContext(), {
        wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
      });

      // Type assertions
      const _updateSession: (session: SessionData, isVisitor: boolean) => void = result.current.updateSession;
      const _clearSession: () => void = result.current.clearSession;
      const _setSearchText: (text: string) => void = result.current.setSearchText;

      expect(typeof result.current.updateSession).toBe('function');
      expect(typeof result.current.clearSession).toBe('function');
      expect(typeof result.current.setSearchText).toBe('function');
    });
  });
});
