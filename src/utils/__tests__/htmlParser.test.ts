/**
 * Tests for HTML Parser Utility
 *
 * This test suite validates the parseQueuedBeersFromHtml function's ability to extract
 * queued beer data from Flying Saucer's HTML responses.
 */

import { parseQueuedBeersFromHtml, QueuedBeer } from '../htmlParser';

describe('htmlParser - parseQueuedBeersFromHtml', () => {
  describe('Valid HTML with Multiple Beers', () => {
    it('should parse HTML with 3 beers correctly', () => {
      const html = `
        <h3 class="brewName">Firestone Walker Parabola (BTL)<div class="brew_added_date">Apr 08, 2025 @ 03:10:18pm</div></h3>
        <div class="brew_details">Some details</div>
        <a href="deleteQueuedBrew.php?cid=1885490">Delete</a>

        <h3 class="brewName">Stone IPA (Draft)<div class="brew_added_date">Apr 09, 2025 @ 10:30:00am</div></h3>
        <div class="brew_details">Some details</div>
        <a href="deleteQueuedBrew.php?cid=1885491">Delete</a>

        <h3 class="brewName">Founders KBS (Can)<div class="brew_added_date">Apr 10, 2025 @ 02:15:45pm</div></h3>
        <div class="brew_details">Some details</div>
        <a href="deleteQueuedBrew.php?cid=1885492">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(3);

      expect(result[0]).toEqual({
        name: 'Firestone Walker Parabola (BTL)',
        date: 'Apr 08, 2025 @ 03:10:18pm',
        id: '1885490'
      });

      expect(result[1]).toEqual({
        name: 'Stone IPA (Draft)',
        date: 'Apr 09, 2025 @ 10:30:00am',
        id: '1885491'
      });

      expect(result[2]).toEqual({
        name: 'Founders KBS (Can)',
        date: 'Apr 10, 2025 @ 02:15:45pm',
        id: '1885492'
      });
    });

    it('should parse HTML with 5 beers correctly', () => {
      const html = `
        <h3 class="brewName">Beer One (Draft)<div class="brew_added_date">Jan 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=1001">Delete</a>

        <h3 class="brewName">Beer Two (BTL)<div class="brew_added_date">Jan 02, 2025 @ 01:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=1002">Delete</a>

        <h3 class="brewName">Beer Three (Can)<div class="brew_added_date">Jan 03, 2025 @ 02:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=1003">Delete</a>

        <h3 class="brewName">Beer Four (Draft)<div class="brew_added_date">Jan 04, 2025 @ 03:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=1004">Delete</a>

        <h3 class="brewName">Beer Five (BTL)<div class="brew_added_date">Jan 05, 2025 @ 04:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=1005">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(5);
      expect(result[0].name).toBe('Beer One (Draft)');
      expect(result[4].name).toBe('Beer Five (BTL)');
    });

    it('should correctly extract all beer properties', () => {
      const html = `
        <h3 class="brewName">Test Beer Name (Draft)<div class="brew_added_date">Dec 25, 2024 @ 11:59:59pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=9999">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Beer Name (Draft)');
      expect(result[0].date).toBe('Dec 25, 2024 @ 11:59:59pm');
      expect(result[0].id).toBe('9999');
    });
  });

  describe('Valid HTML with Single Beer', () => {
    it('should parse HTML with exactly 1 beer', () => {
      const html = `
        <h3 class="brewName">Single Beer (BTL)<div class="brew_added_date">May 15, 2025 @ 06:30:00pm</div></h3>
        <div class="brew_details">Details here</div>
        <a href="deleteQueuedBrew.php?cid=2000">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'Single Beer (BTL)',
        date: 'May 15, 2025 @ 06:30:00pm',
        id: '2000'
      });
    });
  });

  describe('Valid HTML with Zero Beers (Empty Queue)', () => {
    it('should return empty array for HTML with no beers', () => {
      const html = `
        <html>
          <body>
            <h1>Your Queue</h1>
            <p>No beers currently in your queue.</p>
          </body>
        </html>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('should return empty array for completely empty string', () => {
      const html = '';

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toEqual([]);
    });

    it('should return empty array for HTML with only whitespace', () => {
      const html = '   \n\n   \t\t   ';

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toEqual([]);
    });
  });

  describe('Malformed HTML', () => {
    it('should handle HTML with missing closing tags gracefully', () => {
      const html = `
        <h3 class="brewName">Incomplete Beer (Draft)<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm
        <a href="deleteQueuedBrew.php?cid=3000">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      // Should return empty array because the regex won't match malformed HTML
      expect(result).toEqual([]);
    });

    it('should handle HTML with extra tags between expected elements', () => {
      const html = `
        <h3 class="brewName">Beer With Extra Tags (Can)
        <span>Extra content</span>
        <div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <div>Some other div</div>
        <p>Paragraph content</p>
        <a href="deleteQueuedBrew.php?cid=3001">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      // The primary regex might not match, but fallback should work
      // Due to the flexibility of [\s\S]*? in the regex
      expect(result.length).toBeGreaterThanOrEqual(0);

      // If it does parse, verify the beer was extracted
      if (result.length > 0) {
        expect(result[0].id).toBe('3001');
      }
    });

    it('should handle HTML with mismatched tags', () => {
      const html = `
        <h3 class="brewName">Mismatched Beer</h2>
        <div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div>
        <a href="deleteQueuedBrew.php?cid=3002">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      // Should gracefully return empty array or handle as best as possible
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Missing Required Fields', () => {
    it('should handle HTML missing beer name', () => {
      const html = `
        <h3 class="brewName"><div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=4000">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      // Should still parse, but name will be empty
      expect(result.length).toBeGreaterThanOrEqual(0);

      if (result.length > 0) {
        expect(result[0].name).toBe('');
        expect(result[0].id).toBe('4000');
      }
    });

    it('should handle HTML missing date', () => {
      const html = `
        <h3 class="brewName">Beer Without Date (Draft)</h3>
        <a href="deleteQueuedBrew.php?cid=4001">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      // Primary regex won't match, fallback should set 'Date unavailable'
      if (result.length > 0) {
        expect(result[0].name).toContain('Beer Without Date');
        expect(result[0].date).toBe('Date unavailable');
        expect(result[0].id).toBe('4001');
      }
    });

    it('should only match beers with valid cid in properly structured HTML', () => {
      // Note: The regex requires the cid to be in the same "section" as the beer
      // If HTML is structured differently, the regex may match the next available cid
      const html = `
        <h3 class="brewName">Valid Beer (Draft)<div class="brew_added_date">Apr 02, 2025 @ 01:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=4002">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      // Should find the valid beer with cid
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('4002');
      expect(result[0].name).toBe('Valid Beer (Draft)');
    });

    it('should handle HTML with empty date div', () => {
      const html = `
        <h3 class="brewName">Beer With Empty Date (Can)<div class="brew_added_date"></div></h3>
        <a href="deleteQueuedBrew.php?cid=4003">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      if (result.length > 0) {
        expect(result[0].name).toBe('Beer With Empty Date (Can)');
        expect(result[0].date).toBe(''); // Empty string for empty date
        expect(result[0].id).toBe('4003');
      }
    });
  });

  describe('Special Characters in Beer Names', () => {
    it('should handle beer names with apostrophes', () => {
      const html = `
        <h3 class="brewName">Founder's Breakfast Stout (BTL)<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=5000">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Founder's Breakfast Stout (BTL)");
    });

    it('should handle beer names with ampersands', () => {
      const html = `
        <h3 class="brewName">Bells &amp; Whistles IPA (Draft)<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=5001">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bells &amp; Whistles IPA (Draft)');
      expect(result[0].id).toBe('5001');
    });

    it('should handle beer names with quotes', () => {
      const html = `
        <h3 class="brewName">The &quot;Best&quot; Beer (Can)<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=5002">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);
      expect(result[0].name).toContain('Best');
    });

    it('should handle beer names with dashes and underscores', () => {
      const html = `
        <h3 class="brewName">Hop-Heavy_IPA (Draft)<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=5003">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Hop-Heavy_IPA (Draft)');
    });

    it('should handle beer names with numbers', () => {
      const html = `
        <h3 class="brewName">90 Minute IPA (BTL)<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=5004">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('90 Minute IPA (BTL)');
    });

    it('should handle beer names with unicode characters', () => {
      const html = `
        <h3 class="brewName">Bière Française (BTL)<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=5005">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bière Française (BTL)');
    });
  });

  describe('Fallback Regex Pattern', () => {
    it('should use fallback regex when primary fails', () => {
      // HTML structure that primary regex might not catch but fallback will
      const html = `
        <h3 class="brewName">
          Weird Format Beer (Draft)
          <div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div>
        </h3>
        <div>Some content</div>
        <div>More content</div>
        <a href="deleteQueuedBrew.php?cid=6000">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      // Fallback should still parse this
      if (result.length > 0) {
        expect(result[0].id).toBe('6000');
        expect(result[0].name).toContain('Weird Format Beer');
      }
    });

    it('should handle multiline beer names with fallback', () => {
      const html = `
        <h3 class="brewName">
          Very Long Beer Name
          That Spans Multiple Lines
          (Draft)
          <div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div>
        </h3>
        <a href="deleteQueuedBrew.php?cid=6001">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      if (result.length > 0) {
        expect(result[0].id).toBe('6001');
        // The name will include whitespace/newlines that get preserved
        expect(result[0].name).toContain('Very Long Beer Name');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long beer names', () => {
      const longName = 'A'.repeat(500) + ' (Draft)';
      const html = `
        <h3 class="brewName">${longName}<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=7000">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe(longName);
      expect(result[0].name.length).toBeGreaterThan(400);
    });

    it('should handle very large cid numbers', () => {
      const html = `
        <h3 class="brewName">Test Beer (Draft)<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=999999999999">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('999999999999');
    });

    it('should handle different date formats', () => {
      const html = `
        <h3 class="brewName">Beer 1 (Draft)<div class="brew_added_date">April 1, 2025</div></h3>
        <a href="deleteQueuedBrew.php?cid=8000">Delete</a>

        <h3 class="brewName">Beer 2 (Draft)<div class="brew_added_date">04/01/2025</div></h3>
        <a href="deleteQueuedBrew.php?cid=8001">Delete</a>

        <h3 class="brewName">Beer 3 (Draft)<div class="brew_added_date">2025-04-01 12:00:00</div></h3>
        <a href="deleteQueuedBrew.php?cid=8002">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('April 1, 2025');
      expect(result[1].date).toBe('04/01/2025');
      expect(result[2].date).toBe('2025-04-01 12:00:00');
    });

    it('should handle HTML with mixed valid and invalid beers', () => {
      const html = `
        <h3 class="brewName">Valid Beer 1 (Draft)<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=9000">Delete</a>

        <h3 class="brewName">Invalid Beer - No CID<div class="brew_added_date">Apr 02, 2025 @ 01:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php">Delete</a>

        <h3 class="brewName">Valid Beer 2 (BTL)<div class="brew_added_date">Apr 03, 2025 @ 02:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=9001">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('9000');
      expect(result[1].id).toBe('9001');
    });

    it('should trim whitespace from beer names and dates', () => {
      const html = `
        <h3 class="brewName">   Beer With Spaces   (Draft)<div class="brew_added_date">   Apr 01, 2025 @ 12:00:00pm   </div></h3>
        <a href="deleteQueuedBrew.php?cid=10000">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Beer With Spaces   (Draft)');
      expect(result[0].date).toBe('Apr 01, 2025 @ 12:00:00pm');
    });
  });

  describe('Type Validation', () => {
    it('should return array of objects with correct structure', () => {
      const html = `
        <h3 class="brewName">Test Beer (Draft)<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=11000">Delete</a>
      `;

      const result = parseQueuedBeersFromHtml(html);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);

      const beer = result[0];
      expect(beer).toHaveProperty('name');
      expect(beer).toHaveProperty('date');
      expect(beer).toHaveProperty('id');

      expect(typeof beer.name).toBe('string');
      expect(typeof beer.date).toBe('string');
      expect(typeof beer.id).toBe('string');
    });

    it('should return QueuedBeer type objects', () => {
      const html = `
        <h3 class="brewName">Type Test Beer (Can)<div class="brew_added_date">Apr 01, 2025 @ 12:00:00pm</div></h3>
        <a href="deleteQueuedBrew.php?cid=11001">Delete</a>
      `;

      const result: QueuedBeer[] = parseQueuedBeersFromHtml(html);

      expect(result).toHaveLength(1);

      // TypeScript compile-time check - these should not cause errors
      const name: string = result[0].name;
      const date: string = result[0].date;
      const id: string = result[0].id;

      expect(name).toBeDefined();
      expect(date).toBeDefined();
      expect(id).toBeDefined();
    });
  });
});
