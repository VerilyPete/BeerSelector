/**
 * Tests for Rewards component using repository pattern
 * Part of HP-7 Step 2a: Migration from db.ts to repositories
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { Rewards } from '../Rewards';
import { rewardsRepository } from '@/src/database/repositories/RewardsRepository';
import { isVisitorMode } from '@/src/api/authService';
import { getSessionData } from '@/src/api/sessionManager';

// Mock dependencies
jest.mock('@/src/database/repositories/RewardsRepository');
jest.mock('@/src/api/authService');
jest.mock('@/src/api/sessionManager');
jest.mock('@/src/api/beerApi');

const mockRewardsRepository = jest.mocked(rewardsRepository);
const mockIsVisitorMode = jest.mocked(isVisitorMode);
const mockGetSessionData = jest.mocked(getSessionData);

describe('Rewards Component with Repository Pattern', () => {
  const mockRewards = [
    {
      reward_id: '1',
      redeemed: '0',
      reward_type: 'Free Beer',
    },
    {
      reward_id: '2',
      redeemed: '1',
      reward_type: 'Discount Coupon',
    },
    {
      reward_id: '3',
      redeemed: '0',
      reward_type: 'Special Event Access',
    },
  ];

  const mockSessionData = {
    memberId: '123',
    storeId: '456',
    storeName: 'Test Store',
    sessionId: 'test-session-id',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    cardNum: '789',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsVisitorMode.mockResolvedValue(false);
    mockGetSessionData.mockResolvedValue(mockSessionData);
    mockRewardsRepository.getAll.mockResolvedValue(mockRewards);
    (mockRewardsRepository.insertMany as jest.Mock).mockResolvedValue(undefined);

    // Mock fetch for queueing rewards
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Data Loading with Repository', () => {
    it('should load rewards using rewardsRepository.getAll()', async () => {
      const { getByText } = render(<Rewards />);

      await waitFor(() => {
        expect(mockRewardsRepository.getAll).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(getByText('Free Beer')).toBeTruthy();
        expect(getByText('Discount Coupon')).toBeTruthy();
        expect(getByText('Special Event Access')).toBeTruthy();
      });
    });

    it('should not call deprecated db.getAllRewards()', async () => {
      const db = require('@/src/database/db');
      const spyGetAllRewards = jest.spyOn(db, 'getAllRewards');

      render(<Rewards />);

      await waitFor(() => {
        expect(mockRewardsRepository.getAll).toHaveBeenCalled();
      });

      // Ensure the deprecated function is not called
      expect(spyGetAllRewards).not.toHaveBeenCalled();
    });

    it('should display available and redeemed rewards correctly', async () => {
      const { getByText } = render(<Rewards />);

      await waitFor(() => {
        expect(getByText('Free Beer')).toBeTruthy();
      });

      // Check status text
      expect(getByText('Available')).toBeTruthy();
      expect(getByText('Redeemed')).toBeTruthy();
    });

    it('should handle empty rewards array', async () => {
      mockRewardsRepository.getAll.mockResolvedValue([]);

      const { getByText } = render(<Rewards />);

      await waitFor(() => {
        expect(getByText('No rewards found.')).toBeTruthy();
      });
    });

    it('should handle visitor mode by showing appropriate message', async () => {
      mockIsVisitorMode.mockResolvedValue(true);
      mockRewardsRepository.getAll.mockResolvedValue([]);

      const { getByText } = render(<Rewards />);

      await waitFor(() => {
        expect(getByText(/Rewards are not available in visitor mode/i)).toBeTruthy();
        expect(getByText(/Please log in to view your rewards/i)).toBeTruthy();
      });
    });
  });

  describe('Data Refresh with Repository', () => {
    it('should refresh data using rewardsRepository.insertMany()', async () => {
      const { getByTestId } = render(<Rewards />);

      await waitFor(() => {
        expect(mockRewardsRepository.getAll).toHaveBeenCalled();
      });

      // Simulate pull-to-refresh
      const flatList = getByTestId('rewards-flatlist');
      fireEvent(flatList, 'refresh');

      await waitFor(() => {
        expect(mockRewardsRepository.insertMany).toHaveBeenCalled();
      });
    });

    it('should not call deprecated db.fetchAndPopulateRewards()', async () => {
      const db = require('@/src/database/db');
      const spyFetchAndPopulate = jest.spyOn(db, 'fetchAndPopulateRewards');

      const { getByTestId } = render(<Rewards />);

      await waitFor(() => {
        expect(mockRewardsRepository.getAll).toHaveBeenCalled();
      });

      // Trigger refresh
      const flatList = getByTestId('rewards-flatlist');
      fireEvent(flatList, 'refresh');

      await waitFor(() => {
        expect(mockRewardsRepository.insertMany).toHaveBeenCalled();
      });

      // Ensure deprecated function not called
      expect(spyFetchAndPopulate).not.toHaveBeenCalled();
    });

    it('should not refresh rewards in visitor mode', async () => {
      mockIsVisitorMode.mockResolvedValue(true);
      mockRewardsRepository.getAll.mockResolvedValue([]);

      const { getByTestId } = render(<Rewards />);

      await waitFor(() => {
        expect(mockRewardsRepository.getAll).toHaveBeenCalled();
      });

      // Reset call count
      mockRewardsRepository.insertMany.mockClear();

      // Simulate refresh
      const flatList = getByTestId('rewards-flatlist');
      fireEvent(flatList, 'refresh');

      await waitFor(() => {
        // Should not call insertMany in visitor mode
        expect(mockRewardsRepository.insertMany).not.toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when repository throws', async () => {
      const errorMessage = 'Database connection failed';
      mockRewardsRepository.getAll.mockRejectedValue(new Error(errorMessage));

      const { getByText } = render(<Rewards />);

      await waitFor(() => {
        expect(getByText('Failed to load rewards. Please try again later.')).toBeTruthy();
      });
    });

    it('should recover from error after successful refresh', async () => {
      mockRewardsRepository.getAll.mockRejectedValueOnce(new Error('Initial error'));

      const { getByText, getByTestId } = render(<Rewards />);

      await waitFor(() => {
        expect(getByText('Failed to load rewards. Please try again later.')).toBeTruthy();
      });

      // Now make it succeed
      mockRewardsRepository.getAll.mockResolvedValue(mockRewards);

      // Trigger refresh
      const flatList = getByTestId('rewards-flatlist');
      fireEvent(flatList, 'refresh');

      await waitFor(() => {
        expect(getByText('Free Beer')).toBeTruthy();
      });
    });
  });

  describe('Repository Call Patterns', () => {
    it('should call repository methods with correct signatures', async () => {
      render(<Rewards />);

      await waitFor(() => {
        expect(mockRewardsRepository.getAll).toHaveBeenCalledWith();
        expect(mockRewardsRepository.getAll).toHaveBeenCalledTimes(1);
      });
    });

    it('should use repository for both initial load and refresh', async () => {
      const { getByTestId } = render(<Rewards />);

      // Initial load
      await waitFor(() => {
        expect(mockRewardsRepository.getAll).toHaveBeenCalledTimes(1);
      });

      // Refresh
      const flatList = getByTestId('rewards-flatlist');
      fireEvent(flatList, 'refresh');

      await waitFor(() => {
        expect(mockRewardsRepository.insertMany).toHaveBeenCalled();
        expect(mockRewardsRepository.getAll).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Integration with Repository Pattern', () => {
    it('should demonstrate correct migration from db.ts', async () => {
      // This test verifies the migration pattern works correctly

      const db = require('@/src/database/db');
      const spyGetAll = jest.spyOn(db, 'getAllRewards');
      const spyFetchAndPopulate = jest.spyOn(db, 'fetchAndPopulateRewards');

      render(<Rewards />);

      await waitFor(() => {
        // Repository pattern is used
        expect(mockRewardsRepository.getAll).toHaveBeenCalled();

        // Deprecated db.ts functions are NOT used
        expect(spyGetAll).not.toHaveBeenCalled();
        expect(spyFetchAndPopulate).not.toHaveBeenCalled();
      });
    });
  });
});
