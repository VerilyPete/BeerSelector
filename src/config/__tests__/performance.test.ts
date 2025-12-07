/**
 * Performance Benchmark Tests for Config Module
 *
 * These tests establish performance baselines and detect regressions in the config module.
 * All operations should be fast (<1ms for individual operations, <10ms for bulk operations).
 *
 * Benchmarking methodology:
 * 1. Warmup iterations to allow V8 JIT compilation
 * 2. Multiple iterations for accurate averaging
 * 3. High-resolution timing with performance.now()
 * 4. Strict but reasonable thresholds
 */

import { config, AppEnvironment } from '../config';

/**
 * Performance measurement utilities
 */

/**
 * Measures the average execution time of a function over multiple iterations
 * @param fn - Function to measure
 * @param iterations - Number of iterations to run
 * @param warmupIterations - Number of warmup iterations (default: 100)
 * @returns Average execution time in milliseconds
 */
function measureAverageTime(
  fn: () => void,
  iterations: number = 1000,
  warmupIterations: number = 100
): number {
  // Warmup to allow V8 JIT compilation
  for (let i = 0; i < warmupIterations; i++) {
    fn();
  }

  // Actual measurements
  const startTime = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const endTime = performance.now();

  return (endTime - startTime) / iterations;
}

/**
 * Measures the total execution time of a function
 * @param fn - Function to measure
 * @returns Execution time in milliseconds
 */
function measureTime(fn: () => void): number {
  const startTime = performance.now();
  fn();
  const endTime = performance.now();
  return endTime - startTime;
}

/**
 * Helper function to provide detailed performance degradation warnings
 * @param metricName - Name of the performance metric being tested
 * @param measuredTime - Actual measured time in milliseconds
 * @param threshold - Expected threshold in milliseconds
 */
function warnIfPerformanceDegraded(
  metricName: string,
  measuredTime: number,
  threshold: number
): void {
  if (measuredTime >= threshold) {
    const excessPercent = ((measuredTime / threshold - 1) * 100).toFixed(1);
    console.warn(
      `\n⚠️ Performance degradation detected:\n` +
        `  Metric: ${metricName}\n` +
        `  Measured: ${measuredTime.toFixed(6)}ms\n` +
        `  Threshold: ${threshold}ms\n` +
        `  Excess: ${excessPercent}%\n`
    );
  }
}

/**
 * Performance thresholds (in milliseconds)
 *
 * CI environments are typically slower than local development machines,
 * so we apply a 10x multiplier to all thresholds when running in CI.
 * This prevents flaky tests on slower CI runners while maintaining
 * strict performance requirements for local development.
 */
const CI_MULTIPLIER = process.env.CI ? 10 : 1;
const PERFORMANCE_THRESHOLDS = {
  // Individual operations should be extremely fast
  SIMPLE_GETTER: 0.001 * CI_MULTIPLIER, // 1μs local, 10μs in CI
  ENVIRONMENT_SWITCH: 0.01 * CI_MULTIPLIER, // 10μs local, 100μs in CI
  URL_CONSTRUCTION: 0.01 * CI_MULTIPLIER, // 10μs local, 100μs in CI
  NETWORK_CONFIG_GETTER: 0.005 * CI_MULTIPLIER, // 5μs local, 50μs in CI
  EXTERNAL_SERVICES_GETTER: 0.01 * CI_MULTIPLIER, // 10μs local, 100μs in CI

  // Bulk operations (1000 iterations)
  BULK_OPERATIONS_1000: 10 * CI_MULTIPLIER, // 10ms local, 100ms in CI

  // URL construction with parameters
  URL_WITH_PARAMS: 0.02 * CI_MULTIPLIER, // 20μs local, 200μs in CI
};

describe('Config Module Performance Benchmarks', () => {
  // Store original environment to restore after tests
  let originalEnv: AppEnvironment;

  beforeAll(() => {
    originalEnv = config.getEnvironment();
  });

  afterEach(() => {
    // Restore environment after each test
    config.setEnvironment(originalEnv);
  });

  afterAll(() => {
    // Final restore
    config.setEnvironment(originalEnv);
  });

  describe('Config Access Speed Benchmarks', () => {
    it('should access config.api.baseUrl in <1μs on average', () => {
      const avgTime = measureAverageTime(() => {
        const _baseUrl = config.api.baseUrl;
      }, 1000);

      warnIfPerformanceDegraded(
        'config.api.baseUrl access',
        avgTime,
        PERFORMANCE_THRESHOLDS.SIMPLE_GETTER
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_GETTER);
    });

    it('should access config.environment in <1μs on average', () => {
      const avgTime = measureAverageTime(() => {
        const _env = config.environment;
      }, 1000);

      warnIfPerformanceDegraded(
        'config.environment access',
        avgTime,
        PERFORMANCE_THRESHOLDS.SIMPLE_GETTER
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_GETTER);
    });

    it('should access config.api.endpoints in <1μs on average', () => {
      const avgTime = measureAverageTime(() => {
        const _endpoints = config.api.endpoints;
      }, 1000);

      warnIfPerformanceDegraded(
        'config.api.endpoints access',
        avgTime,
        PERFORMANCE_THRESHOLDS.SIMPLE_GETTER
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_GETTER);
    });

    it('should access config.api.referers in <1μs on average', () => {
      const avgTime = measureAverageTime(() => {
        const _referers = config.api.referers;
      }, 1000);

      warnIfPerformanceDegraded(
        'config.api.referers access',
        avgTime,
        PERFORMANCE_THRESHOLDS.SIMPLE_GETTER
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_GETTER);
    });

    it('should call config.getEnvironment() in <1μs on average', () => {
      const avgTime = measureAverageTime(() => {
        config.getEnvironment();
      }, 1000);

      warnIfPerformanceDegraded(
        'config.getEnvironment() call',
        avgTime,
        PERFORMANCE_THRESHOLDS.SIMPLE_GETTER
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_GETTER);
    });
  });

  describe('URL Construction Performance', () => {
    it('should construct URL with getFullUrl() in <10μs on average', () => {
      const avgTime = measureAverageTime(() => {
        config.api.getFullUrl('memberQueues');
      }, 1000);

      warnIfPerformanceDegraded(
        'getFullUrl() without params',
        avgTime,
        PERFORMANCE_THRESHOLDS.URL_CONSTRUCTION
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.URL_CONSTRUCTION);
    });

    it('should construct URL with params in <20μs on average', () => {
      const avgTime = measureAverageTime(() => {
        config.api.getFullUrl('deleteQueuedBrew', { cid: '12345' });
      }, 1000);

      warnIfPerformanceDegraded(
        'getFullUrl() with params',
        avgTime,
        PERFORMANCE_THRESHOLDS.URL_WITH_PARAMS
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.URL_WITH_PARAMS);
    });

    it('should construct URL with multiple params in <20μs on average', () => {
      const avgTime = measureAverageTime(() => {
        config.api.getFullUrl('memberQueues', {
          page: '1',
          limit: '50',
          sort: 'name',
        });
      }, 1000);

      warnIfPerformanceDegraded(
        'getFullUrl() with multiple params',
        avgTime,
        PERFORMANCE_THRESHOLDS.URL_WITH_PARAMS
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.URL_WITH_PARAMS);
    });

    it('should handle 100 sequential URL constructions in <10ms', () => {
      const totalTime = measureTime(() => {
        for (let i = 0; i < 100; i++) {
          config.api.getFullUrl('memberQueues');
        }
      });

      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATIONS_1000 / 10);
    });

    it('should handle 1000 sequential URL constructions in <10ms', () => {
      const totalTime = measureTime(() => {
        for (let i = 0; i < 1000; i++) {
          config.api.getFullUrl('memberQueues');
        }
      });

      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATIONS_1000);
    });
  });

  describe('Environment Switching Performance', () => {
    it('should switch environment in <10μs on average', () => {
      const environments: AppEnvironment[] = ['development', 'staging', 'production'];
      let envIndex = 0;

      const avgTime = measureAverageTime(() => {
        config.setEnvironment(environments[envIndex % 3]);
        envIndex++;
      }, 1000);

      warnIfPerformanceDegraded(
        'setEnvironment()',
        avgTime,
        PERFORMANCE_THRESHOLDS.ENVIRONMENT_SWITCH
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.ENVIRONMENT_SWITCH);
    });

    it('should switch between all 3 environments efficiently', () => {
      const totalTime = measureTime(() => {
        config.setEnvironment('development');
        config.setEnvironment('staging');
        config.setEnvironment('production');
        config.setEnvironment('development');
        config.setEnvironment('staging');
        config.setEnvironment('production');
      });

      // 6 switches should take less than 1ms total
      expect(totalTime).toBeLessThan(0.1);
    });

    it('should maintain performance after environment switch', () => {
      // Switch environment
      config.setEnvironment('staging');

      // Measure URL construction after switch
      const avgTime = measureAverageTime(() => {
        config.api.getFullUrl('memberQueues');
      }, 1000);

      warnIfPerformanceDegraded(
        'getFullUrl() after environment switch',
        avgTime,
        PERFORMANCE_THRESHOLDS.URL_CONSTRUCTION
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.URL_CONSTRUCTION);
    });

    it('should not degrade performance with repeated switching', () => {
      const environments: AppEnvironment[] = ['development', 'staging', 'production'];

      // Perform 100 environment switches
      const totalTime = measureTime(() => {
        for (let i = 0; i < 100; i++) {
          config.setEnvironment(environments[i % 3]);
        }
      });

      // 100 switches should take less than 10ms
      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATIONS_1000);
    });
  });

  describe('Network Configuration Performance', () => {
    it('should access config.network.timeout in <5μs on average', () => {
      const avgTime = measureAverageTime(() => {
        const _timeout = config.network.timeout;
      }, 1000);

      warnIfPerformanceDegraded(
        'config.network.timeout access',
        avgTime,
        PERFORMANCE_THRESHOLDS.NETWORK_CONFIG_GETTER
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.NETWORK_CONFIG_GETTER);
    });

    it('should access config.network.retries in <5μs on average', () => {
      const avgTime = measureAverageTime(() => {
        const _retries = config.network.retries;
      }, 1000);

      warnIfPerformanceDegraded(
        'config.network.retries access',
        avgTime,
        PERFORMANCE_THRESHOLDS.NETWORK_CONFIG_GETTER
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.NETWORK_CONFIG_GETTER);
    });

    it('should access config.network.retryDelay in <5μs on average', () => {
      const avgTime = measureAverageTime(() => {
        const _retryDelay = config.network.retryDelay;
      }, 1000);

      warnIfPerformanceDegraded(
        'config.network.retryDelay access',
        avgTime,
        PERFORMANCE_THRESHOLDS.NETWORK_CONFIG_GETTER
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.NETWORK_CONFIG_GETTER);
    });

    it('should access all network config properties efficiently', () => {
      const avgTime = measureAverageTime(() => {
        const _timeout = config.network.timeout;
        const _retries = config.network.retries;
        const _retryDelay = config.network.retryDelay;
      }, 1000);

      const threshold = PERFORMANCE_THRESHOLDS.NETWORK_CONFIG_GETTER * 3;
      warnIfPerformanceDegraded('all network config properties access', avgTime, threshold);
      // All three accesses should still be fast
      expect(avgTime).toBeLessThan(threshold);
    });
  });

  describe('External Services Configuration Performance', () => {
    it('should access config.external.untappd.baseUrl in <10μs on average', () => {
      const avgTime = measureAverageTime(() => {
        const _baseUrl = config.external.untappd.baseUrl;
      }, 1000);

      warnIfPerformanceDegraded(
        'config.external.untappd.baseUrl access',
        avgTime,
        PERFORMANCE_THRESHOLDS.EXTERNAL_SERVICES_GETTER
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.EXTERNAL_SERVICES_GETTER);
    });

    it('should access config.external.untappd.loginUrl in <10μs on average', () => {
      const avgTime = measureAverageTime(() => {
        const _loginUrl = config.external.untappd.loginUrl;
      }, 1000);

      warnIfPerformanceDegraded(
        'config.external.untappd.loginUrl access',
        avgTime,
        PERFORMANCE_THRESHOLDS.EXTERNAL_SERVICES_GETTER
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.EXTERNAL_SERVICES_GETTER);
    });

    it('should construct Untappd search URL in <20μs on average', () => {
      const avgTime = measureAverageTime(() => {
        config.external.untappd.searchUrl('Test Beer Name');
      }, 1000);

      warnIfPerformanceDegraded(
        'untappd.searchUrl()',
        avgTime,
        PERFORMANCE_THRESHOLDS.URL_WITH_PARAMS
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.URL_WITH_PARAMS);
    });

    it('should handle complex beer names efficiently', () => {
      const complexName =
        'Super Long Beer Name With (Lots) Of (Parentheses) And Special Characters!';

      const avgTime = measureAverageTime(() => {
        config.external.untappd.searchUrl(complexName);
      }, 1000);

      const threshold = PERFORMANCE_THRESHOLDS.URL_WITH_PARAMS * 2;
      warnIfPerformanceDegraded('untappd.searchUrl() with complex name', avgTime, threshold);
      // Should still be fast even with complex names
      expect(avgTime).toBeLessThan(threshold);
    });
  });

  describe('Custom API URL Performance', () => {
    afterEach(() => {
      // Reset to environment default
      config.setEnvironment(originalEnv);
    });

    it('should set custom API URL in <10μs', () => {
      const totalTime = measureTime(() => {
        config.setCustomApiUrl('https://custom-api.example.com');
      });

      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.ENVIRONMENT_SWITCH);
    });

    it('should access baseUrl after custom URL set efficiently', () => {
      config.setCustomApiUrl('https://custom-api.example.com');

      const avgTime = measureAverageTime(() => {
        const _baseUrl = config.api.baseUrl;
      }, 1000);

      warnIfPerformanceDegraded(
        'baseUrl access after setCustomApiUrl()',
        avgTime,
        PERFORMANCE_THRESHOLDS.SIMPLE_GETTER
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_GETTER);
    });

    it('should construct URLs with custom baseUrl efficiently', () => {
      config.setCustomApiUrl('https://custom-api.example.com');

      const avgTime = measureAverageTime(() => {
        config.api.getFullUrl('memberQueues');
      }, 1000);

      warnIfPerformanceDegraded(
        'getFullUrl() with custom baseUrl',
        avgTime,
        PERFORMANCE_THRESHOLDS.URL_CONSTRUCTION
      );
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLDS.URL_CONSTRUCTION);
    });
  });

  describe('Memory and Stability Benchmarks', () => {
    it('should not accumulate memory with repeated URL constructions', () => {
      // Create a baseline
      const baseline = measureAverageTime(() => {
        config.api.getFullUrl('memberQueues');
      }, 1000);

      // Perform many operations (simulating memory buildup)
      for (let i = 0; i < 10000; i++) {
        config.api.getFullUrl('memberQueues');
      }

      // Measure again - should be similar to baseline
      const afterBulk = measureAverageTime(() => {
        config.api.getFullUrl('memberQueues');
      }, 1000);

      // Performance should not degrade more than 50%
      // If baseline is 0 (too fast to measure), ensure afterBulk is still under threshold
      if (baseline === 0) {
        expect(afterBulk).toBeLessThan(PERFORMANCE_THRESHOLDS.URL_CONSTRUCTION);
      } else {
        expect(afterBulk).toBeLessThan(baseline * 1.5);
      }
    });

    it('should not accumulate memory with repeated environment switches', () => {
      const environments: AppEnvironment[] = ['development', 'staging', 'production'];

      // Create a baseline
      const baseline = measureAverageTime(() => {
        config.setEnvironment(environments[0]);
      }, 100);

      // Perform many switches (simulating memory buildup)
      for (let i = 0; i < 1000; i++) {
        config.setEnvironment(environments[i % 3]);
      }

      // Measure again - should be similar to baseline
      const afterBulk = measureAverageTime(() => {
        config.setEnvironment(environments[0]);
      }, 100);

      // Performance should not degrade more than 50%
      // If baseline is 0 (too fast to measure), ensure afterBulk is still under threshold
      if (baseline === 0) {
        expect(afterBulk).toBeLessThan(PERFORMANCE_THRESHOLDS.ENVIRONMENT_SWITCH);
      } else {
        expect(afterBulk).toBeLessThan(baseline * 1.5);
      }
    });

    it('should maintain performance with mixed operations', () => {
      const environments: AppEnvironment[] = ['development', 'staging', 'production'];

      const totalTime = measureTime(() => {
        for (let i = 0; i < 100; i++) {
          // Mix of operations
          config.setEnvironment(environments[i % 3]);
          config.api.getFullUrl('memberQueues');
          config.api.getFullUrl('deleteQueuedBrew', { cid: '123' });
          const _baseUrl = config.api.baseUrl;
          const _timeout = config.network.timeout;
          config.external.untappd.searchUrl('Test Beer');
        }
      });

      // 600 mixed operations (100 iterations * 6 operations) should complete quickly
      expect(totalTime).toBeLessThan(20); // 20ms for 600 operations
    });
  });

  describe('Performance Baselines Documentation', () => {
    it('should document current performance characteristics', () => {
      // This test serves as documentation of expected performance
      const measurements = {
        simpleGetter: measureAverageTime(() => config.api.baseUrl, 1000),
        environmentGetter: measureAverageTime(() => config.getEnvironment(), 1000),
        urlConstruction: measureAverageTime(() => config.api.getFullUrl('memberQueues'), 1000),
        urlWithParams: measureAverageTime(
          () => config.api.getFullUrl('deleteQueuedBrew', { cid: '123' }),
          1000
        ),
        environmentSwitch: measureAverageTime(() => config.setEnvironment('development'), 1000),
        networkConfigGetter: measureAverageTime(() => config.network.timeout, 1000),
        externalServicesGetter: measureAverageTime(() => config.external.untappd.baseUrl, 1000),
        untappdSearchUrl: measureAverageTime(
          () => config.external.untappd.searchUrl('Test Beer'),
          1000
        ),
      };

      // Log measurements for documentation purposes
      // Note: These are measured in milliseconds, which are very small numbers (< 0.001ms typically)
      console.log('\n=== Config Module Performance Baselines ===');
      console.log(
        `Simple Getter (config.api.baseUrl): ${measurements.simpleGetter.toFixed(6)}ms avg`
      );
      console.log(`Environment Getter: ${measurements.environmentGetter.toFixed(6)}ms avg`);
      console.log(`URL Construction: ${measurements.urlConstruction.toFixed(6)}ms avg`);
      console.log(`URL with Params: ${measurements.urlWithParams.toFixed(6)}ms avg`);
      console.log(`Environment Switch: ${measurements.environmentSwitch.toFixed(6)}ms avg`);
      console.log(`Network Config Getter: ${measurements.networkConfigGetter.toFixed(6)}ms avg`);
      console.log(
        `External Services Getter: ${measurements.externalServicesGetter.toFixed(6)}ms avg`
      );
      console.log(`Untappd Search URL: ${measurements.untappdSearchUrl.toFixed(6)}ms avg`);
      console.log('==========================================\n');

      // All measurements should meet our thresholds
      warnIfPerformanceDegraded(
        'baseline: simpleGetter',
        measurements.simpleGetter,
        PERFORMANCE_THRESHOLDS.SIMPLE_GETTER
      );
      expect(measurements.simpleGetter).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_GETTER);
      warnIfPerformanceDegraded(
        'baseline: environmentGetter',
        measurements.environmentGetter,
        PERFORMANCE_THRESHOLDS.SIMPLE_GETTER
      );
      expect(measurements.environmentGetter).toBeLessThan(PERFORMANCE_THRESHOLDS.SIMPLE_GETTER);
      warnIfPerformanceDegraded(
        'baseline: urlConstruction',
        measurements.urlConstruction,
        PERFORMANCE_THRESHOLDS.URL_CONSTRUCTION
      );
      expect(measurements.urlConstruction).toBeLessThan(PERFORMANCE_THRESHOLDS.URL_CONSTRUCTION);
      warnIfPerformanceDegraded(
        'baseline: urlWithParams',
        measurements.urlWithParams,
        PERFORMANCE_THRESHOLDS.URL_WITH_PARAMS
      );
      expect(measurements.urlWithParams).toBeLessThan(PERFORMANCE_THRESHOLDS.URL_WITH_PARAMS);
      warnIfPerformanceDegraded(
        'baseline: environmentSwitch',
        measurements.environmentSwitch,
        PERFORMANCE_THRESHOLDS.ENVIRONMENT_SWITCH
      );
      expect(measurements.environmentSwitch).toBeLessThan(
        PERFORMANCE_THRESHOLDS.ENVIRONMENT_SWITCH
      );
      warnIfPerformanceDegraded(
        'baseline: networkConfigGetter',
        measurements.networkConfigGetter,
        PERFORMANCE_THRESHOLDS.NETWORK_CONFIG_GETTER
      );
      expect(measurements.networkConfigGetter).toBeLessThan(
        PERFORMANCE_THRESHOLDS.NETWORK_CONFIG_GETTER
      );
      warnIfPerformanceDegraded(
        'baseline: externalServicesGetter',
        measurements.externalServicesGetter,
        PERFORMANCE_THRESHOLDS.EXTERNAL_SERVICES_GETTER
      );
      expect(measurements.externalServicesGetter).toBeLessThan(
        PERFORMANCE_THRESHOLDS.EXTERNAL_SERVICES_GETTER
      );
      warnIfPerformanceDegraded(
        'baseline: untappdSearchUrl',
        measurements.untappdSearchUrl,
        PERFORMANCE_THRESHOLDS.URL_WITH_PARAMS
      );
      expect(measurements.untappdSearchUrl).toBeLessThan(PERFORMANCE_THRESHOLDS.URL_WITH_PARAMS);
    });
  });

  describe('Edge Case Performance', () => {
    it('should handle all endpoints efficiently in a loop', () => {
      const endpoints: (keyof typeof config.api.endpoints)[] = [
        'memberQueues',
        'deleteQueuedBrew',
        'addToQueue',
        'addToRewardQueue',
        'memberDashboard',
        'memberRewards',
        'kiosk',
        'visitor',
      ];

      const totalTime = measureTime(() => {
        endpoints.forEach(endpoint => {
          config.api.getFullUrl(endpoint);
        });
      });

      // All 8 endpoints should be constructed very quickly
      expect(totalTime).toBeLessThan(0.5); // 0.5ms for 8 operations
    });

    it('should handle alternating operations efficiently', () => {
      const totalTime = measureTime(() => {
        for (let i = 0; i < 50; i++) {
          // Alternate between different operations
          if (i % 2 === 0) {
            config.api.getFullUrl('memberQueues');
          } else {
            config.api.getFullUrl('deleteQueuedBrew', { cid: String(i) });
          }
        }
      });

      // 50 alternating operations should be fast
      expect(totalTime).toBeLessThan(5); // 5ms for 50 operations
    });

    it('should handle concurrent-like access patterns', () => {
      // Simulate multiple components accessing config simultaneously
      const totalTime = measureTime(() => {
        for (let i = 0; i < 100; i++) {
          // Multiple getters in quick succession
          const _baseUrl = config.api.baseUrl;
          const _endpoints = config.api.endpoints;
          const _referers = config.api.referers;
          const _timeout = config.network.timeout;
          const _env = config.environment;
        }
      });

      // 500 total accesses (100 * 5) should be extremely fast
      expect(totalTime).toBeLessThan(5); // 5ms for 500 accesses
    });
  });
});
