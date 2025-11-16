/**
 * Tests for Queue Service
 *
 * This test suite validates the queue service functions for retrieving and deleting
 * queued beers from the Flying Saucer API.
 */

import { getQueuedBeers, deleteQueuedBeer } from '../queueService';
import { getSessionData } from '../sessionManager';
import { parseQueuedBeersFromHtml } from '../../utils/htmlParser';
import { ApiError } from '../../types/api';
import { config } from '@/src/config';

// Mock dependencies
jest.mock('../sessionManager');
jest.mock('../../utils/htmlParser');

// Mock global fetch
global.fetch = jest.fn();

describe('queueService', () => {
  // Sample session data for testing
  const mockSessionData = {
    memberId: 'test-member-123',
    storeId: 'test-store-456',
    storeName: 'Test Flying Saucer',
    sessionId: 'test-session-abc123',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    cardNum: '12345'
  };

  // Sample queued beers for testing
  const mockQueuedBeers = [
    {
      name: 'Firestone Walker Parabola (BTL)',
      date: 'Apr 08, 2025 @ 03:10:18pm',
      id: '1885490'
    },
    {
      name: 'Stone IPA (Draft)',
      date: 'Apr 09, 2025 @ 10:30:00am',
      id: '1885491'
    }
  ];

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Setup default mock implementations
    (getSessionData as jest.Mock).mockResolvedValue(mockSessionData);
    (parseQueuedBeersFromHtml as jest.Mock).mockReturnValue(mockQueuedBeers);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getQueuedBeers', () => {
    describe('Success Cases', () => {
      it('should successfully fetch and parse queued beers', async () => {
        // Mock successful fetch
        const mockHtml = '<html>Mock queue page HTML</html>';
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue(mockHtml)
        });

        const result = await getQueuedBeers();

        // Verify fetch was called with correct URL
        expect(global.fetch).toHaveBeenCalledWith(
          config.api.getFullUrl('memberQueues'),
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'accept': expect.any(String),
              'Cookie': expect.stringContaining('store__id=test-store-456')
            })
          })
        );

        // Verify parser was called
        expect(parseQueuedBeersFromHtml).toHaveBeenCalledWith(mockHtml);

        // Verify result
        expect(result).toEqual(mockQueuedBeers);
        expect(result).toHaveLength(2);
      });

      it('should include all session cookies in request headers', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue('<html>Mock HTML</html>')
        });

        await getQueuedBeers();

        // Get the fetch call arguments
        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const headers = fetchCall[1].headers;
        const cookieHeader = headers.Cookie;

        // Verify all session data is in cookies
        expect(cookieHeader).toContain('store__id=test-store-456');
        expect(cookieHeader).toContain('PHPSESSID=test-session-abc123');
        expect(cookieHeader).toContain('store_name=Test%20Flying%20Saucer');
        expect(cookieHeader).toContain('member_id=test-member-123');
        expect(cookieHeader).toContain('username=testuser');
        expect(cookieHeader).toContain('first_name=Test');
        expect(cookieHeader).toContain('last_name=User');
        expect(cookieHeader).toContain('email=test%40example.com');
        expect(cookieHeader).toContain('cardNum=12345');
      });

      it('should return empty array when no beers are queued', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue('<html>Empty queue</html>')
        });

        (parseQueuedBeersFromHtml as jest.Mock).mockReturnValue([]);

        const result = await getQueuedBeers();

        expect(result).toEqual([]);
        expect(result).toHaveLength(0);
      });

      it('should log session information (sanitized)', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue('<html>Mock HTML</html>')
        });

        await getQueuedBeers();

        // Verify session is logged with sanitized sessionId
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Making queue API request'),
          expect.objectContaining({
            sessionId: 'test-...'
          })
        );

        consoleSpy.mockRestore();
      });
    });

    describe('Session Validation', () => {
      it('should throw ApiError when session data is null', async () => {
        (getSessionData as jest.Mock).mockResolvedValue(null);

        await expect(getQueuedBeers()).rejects.toThrow(ApiError);
        await expect(getQueuedBeers()).rejects.toThrow('Your session has expired');
      });

      it('should throw ApiError when memberId is missing', async () => {
        (getSessionData as jest.Mock).mockResolvedValue({
          ...mockSessionData,
          memberId: undefined
        });

        await expect(getQueuedBeers()).rejects.toThrow(ApiError);
      });

      it('should throw ApiError when storeId is missing', async () => {
        (getSessionData as jest.Mock).mockResolvedValue({
          ...mockSessionData,
          storeId: undefined
        });

        await expect(getQueuedBeers()).rejects.toThrow(ApiError);
      });

      it('should throw ApiError when storeName is missing', async () => {
        (getSessionData as jest.Mock).mockResolvedValue({
          ...mockSessionData,
          storeName: undefined
        });

        await expect(getQueuedBeers()).rejects.toThrow(ApiError);
      });

      it('should throw ApiError when sessionId is missing', async () => {
        (getSessionData as jest.Mock).mockResolvedValue({
          ...mockSessionData,
          sessionId: undefined
        });

        await expect(getQueuedBeers()).rejects.toThrow(ApiError);
      });

      it('should throw ApiError with 401 status code for expired session', async () => {
        (getSessionData as jest.Mock).mockResolvedValue(null);

        try {
          await getQueuedBeers();
          fail('Should have thrown ApiError');
        } catch (error) {
          expect(error).toBeInstanceOf(ApiError);
          expect((error as ApiError).statusCode).toBe(401);
        }
      });
    });

    describe('Network Error Handling', () => {
      it('should throw error when fetch fails with network error', async () => {
        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network request failed'));

        await expect(getQueuedBeers()).rejects.toThrow('Network request failed');
      });

      it('should throw error when response is not ok (404)', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 404
        });

        await expect(getQueuedBeers()).rejects.toThrow('Failed to fetch queues with status: 404');
      });

      it('should throw error when response is not ok (500)', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500
        });

        await expect(getQueuedBeers()).rejects.toThrow('Failed to fetch queues with status: 500');
      });

      it('should throw error when response is not ok (401 unauthorized)', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 401
        });

        await expect(getQueuedBeers()).rejects.toThrow('Failed to fetch queues with status: 401');
      });

      it('should log error when network request fails', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

        await expect(getQueuedBeers()).rejects.toThrow();

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error fetching queued beers:',
          expect.any(Error)
        );

        consoleErrorSpy.mockRestore();
      });
    });

    describe('HTML Parsing Errors', () => {
      it('should handle parser returning empty array', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue('<html>Some HTML</html>')
        });

        (parseQueuedBeersFromHtml as jest.Mock).mockReturnValue([]);

        const result = await getQueuedBeers();

        expect(result).toEqual([]);
      });

      it('should propagate parser errors', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue('<html>Some HTML</html>')
        });

        (parseQueuedBeersFromHtml as jest.Mock).mockImplementation(() => {
          throw new Error('Parser error');
        });

        await expect(getQueuedBeers()).rejects.toThrow('Parser error');
      });

      it('should handle response.text() throwing error', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200,
          text: jest.fn().mockRejectedValue(new Error('Failed to read response'))
        });

        await expect(getQueuedBeers()).rejects.toThrow('Failed to read response');
      });
    });

    describe('Optional Session Fields', () => {
      it('should handle missing optional fields gracefully', async () => {
        const sessionWithoutOptionals = {
          memberId: 'test-member-123',
          storeId: 'test-store-456',
          storeName: 'Test Store',
          sessionId: 'test-session-abc'
          // Missing: username, firstName, lastName, email, cardNum
        };

        (getSessionData as jest.Mock).mockResolvedValue(sessionWithoutOptionals);

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200,
          text: jest.fn().mockResolvedValue('<html>Mock HTML</html>')
        });

        await getQueuedBeers();

        // Verify fetch was still called with cookie header
        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const cookieHeader = fetchCall[1].headers.Cookie;

        // Should have empty values for missing fields
        expect(cookieHeader).toContain('username=');
        expect(cookieHeader).toContain('first_name=');
        expect(cookieHeader).toContain('last_name=');
        expect(cookieHeader).toContain('email=');
        expect(cookieHeader).toContain('cardNum=');
      });
    });
  });

  describe('deleteQueuedBeer', () => {
    describe('Success Cases', () => {
      it('should successfully delete a queued beer', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200
        });

        const result = await deleteQueuedBeer('1885490');

        // Verify fetch was called with correct URL and cid
        expect(global.fetch).toHaveBeenCalledWith(
          `${config.api.getFullUrl('deleteQueuedBrew')}?cid=1885490`,
          expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({
              'Cookie': expect.stringContaining('store__id=test-store-456')
            })
          })
        );

        // Verify result is true
        expect(result).toBe(true);
      });

      it('should include all session cookies in delete request', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200
        });

        await deleteQueuedBeer('1885490');

        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const headers = fetchCall[1].headers;
        const cookieHeader = headers.Cookie;

        expect(cookieHeader).toContain('store__id=test-store-456');
        expect(cookieHeader).toContain('PHPSESSID=test-session-abc123');
        expect(cookieHeader).toContain('member_id=test-member-123');
      });

      it('should set correct referer header', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200
        });

        await deleteQueuedBeer('1885490');

        const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
        const headers = fetchCall[1].headers;

        expect(headers.referer).toBe(config.api.referers.memberQueues);
      });

      it('should log deletion attempt', async () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200
        });

        await deleteQueuedBeer('1885490');

        expect(consoleSpy).toHaveBeenCalledWith('Deleting queued beer ID: 1885490');
        expect(consoleSpy).toHaveBeenCalledWith('Successfully deleted queued beer ID: 1885490');

        consoleSpy.mockRestore();
      });

      it('should handle different cid formats', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200
        });

        await deleteQueuedBeer('999999999');

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('cid=999999999'),
          expect.any(Object)
        );
      });
    });

    describe('Input Validation', () => {
      it('should return false when cid is empty string', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        const result = await deleteQueuedBeer('');

        expect(result).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith('Cannot delete queued beer: missing cid');

        consoleErrorSpy.mockRestore();
      });

      it('should return false when cid is undefined', async () => {
        const result = await deleteQueuedBeer(undefined as any);

        expect(result).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it('should return false when cid is null', async () => {
        const result = await deleteQueuedBeer(null as any);

        expect(result).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
      });
    });

    describe('Session Validation', () => {
      it('should return false when session data is null (caught and handled)', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        (getSessionData as jest.Mock).mockResolvedValue(null);

        const result = await deleteQueuedBeer('1885490');

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it('should return false when memberId is missing (caught and handled)', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        (getSessionData as jest.Mock).mockResolvedValue({
          ...mockSessionData,
          memberId: undefined
        });

        const result = await deleteQueuedBeer('1885490');

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it('should return false when storeId is missing (caught and handled)', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        (getSessionData as jest.Mock).mockResolvedValue({
          ...mockSessionData,
          storeId: undefined
        });

        const result = await deleteQueuedBeer('1885490');

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it('should return false when storeName is missing (caught and handled)', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        (getSessionData as jest.Mock).mockResolvedValue({
          ...mockSessionData,
          storeName: undefined
        });

        const result = await deleteQueuedBeer('1885490');

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });

      it('should return false when sessionId is missing (caught and handled)', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        (getSessionData as jest.Mock).mockResolvedValue({
          ...mockSessionData,
          sessionId: undefined
        });

        const result = await deleteQueuedBeer('1885490');

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });
    });

    describe('Network Error Handling', () => {
      it('should return false when response is not ok (404)', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 404
        });

        const result = await deleteQueuedBeer('1885490');

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to delete beer with status: 404'
        );

        consoleErrorSpy.mockRestore();
      });

      it('should return false when response is not ok (500)', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: false,
          status: 500
        });

        const result = await deleteQueuedBeer('1885490');

        expect(result).toBe(false);
      });

      it('should return false when fetch throws network error', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

        const result = await deleteQueuedBeer('1885490');

        expect(result).toBe(false);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Error deleting queued beer:',
          expect.any(Error)
        );

        consoleErrorSpy.mockRestore();
      });

      it('should log errors when deletion fails', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection timeout'));

        await deleteQueuedBeer('1885490');

        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
      });
    });

    describe('Edge Cases', () => {
      it('should handle successful deletion with 204 status', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 204
        });

        const result = await deleteQueuedBeer('1885490');

        expect(result).toBe(true);
      });

      it('should handle cid with special characters (URL encoded)', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200
        });

        await deleteQueuedBeer('test-beer-123');

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('cid=test-beer-123'),
          expect.any(Object)
        );
      });

      it('should handle very long cid values', async () => {
        (global.fetch as jest.Mock).mockResolvedValue({
          ok: true,
          status: 200
        });

        const longCid = '1'.repeat(100);
        await deleteQueuedBeer(longCid);

        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining(`cid=${longCid}`),
          expect.any(Object)
        );
      });
    });
  });

  describe('Integration Between Functions', () => {
    it('should handle typical workflow: get queues then delete one', async () => {
      // First, get queued beers
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('<html>Queue HTML</html>')
      });

      const queues = await getQueuedBeers();
      expect(queues).toHaveLength(2);

      // Then delete one
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200
      });

      const deleteResult = await deleteQueuedBeer(queues[0].id);
      expect(deleteResult).toBe(true);

      // Verify both fetch calls were made
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should use the same session data for both operations', async () => {
      // Get queues
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('<html>Queue HTML</html>')
      });

      await getQueuedBeers();

      // Delete a beer
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200
      });

      await deleteQueuedBeer('1885490');

      // Both calls should have fetched session data
      expect(getSessionData).toHaveBeenCalledTimes(2);
    });
  });
});
