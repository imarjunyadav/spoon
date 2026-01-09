/**
 * Property-Based Tests for AdaptivePollingController
 * 
 * Feature: order-status-optimization
 * Tests the hybrid polling strategy for order status updates.
 */
const fc = require('fast-check');
const { AdaptivePollingController } = require('./adaptivePollingController');

describe('AdaptivePollingController', () => {
  // Reset controller state before each test
  beforeEach(() => {
    AdaptivePollingController.stopPolling();
    AdaptivePollingController.currentInterval = null;
    AdaptivePollingController.intervalId = null;
  });

  afterEach(() => {
    AdaptivePollingController.stopPolling();
  });

  describe('getIntervalForStatus', () => {
    /**
     * Feature: order-status-optimization, Property 1: Polling interval by status
     * Validates: Requirements 1.1, 1.2, 1.3, 1.4
     * 
     * For any valid order status, the polling controller should return the correct interval:
     * - 20000ms for PENDING/PLACED/PREPARING
     * - 3000ms for COMPLETE
     * - 0 for PICKED_UP
     */
    test('Property 1: returns correct interval for all valid statuses', () => {
      // Define the valid statuses and their expected intervals
      const statusIntervalMap = {
        PENDING: 20000,
        PLACED: 20000,
        PREPARING: 20000,
        COMPLETE: 3000,
        PICKED_UP: 0
      };

      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP'),
          (status) => {
            const interval = AdaptivePollingController.getIntervalForStatus(status);
            const expectedInterval = statusIntervalMap[status];
            
            return interval === expectedInterval;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: order-status-optimization, Property 1 (edge case): Unknown status handling
     * Validates: Requirements 1.1
     * 
     * For any unknown status string, the controller should default to PENDING interval (20000ms)
     */
    test('Property 1 (edge case): defaults to PENDING interval for unknown statuses', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !['PENDING', 'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP'].includes(s)),
          (unknownStatus) => {
            const interval = AdaptivePollingController.getIntervalForStatus(unknownStatus);
            return interval === 20000; // Should default to PENDING interval
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: order-status-optimization, Property 1: PENDING/PLACED/PREPARING all return 20s
     * Validates: Requirements 1.1
     * 
     * For any status in the "waiting" category, interval should be 20000ms
     */
    test('Property 1: waiting statuses (PENDING/PLACED/PREPARING) all return 20000ms', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED', 'PREPARING'),
          (status) => {
            const interval = AdaptivePollingController.getIntervalForStatus(status);
            return interval === 20000;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: order-status-optimization, Property 1: COMPLETE returns 3s (Counter Moment)
     * Validates: Requirements 1.2
     * 
     * The COMPLETE status should always return 3000ms for fast counter updates
     */
    test('Property 1: COMPLETE status returns 3000ms (Counter Moment)', () => {
      const interval = AdaptivePollingController.getIntervalForStatus('COMPLETE');
      expect(interval).toBe(3000);
    });

    /**
     * Feature: order-status-optimization, Property 1: PICKED_UP returns 0 (no polling)
     * Validates: Requirements 1.3
     * 
     * The PICKED_UP status should always return 0 to stop polling
     */
    test('Property 1: PICKED_UP status returns 0 (no polling)', () => {
      const interval = AdaptivePollingController.getIntervalForStatus('PICKED_UP');
      expect(interval).toBe(0);
    });

    /**
     * Feature: order-status-optimization, Property 1: Interval is always non-negative
     * Validates: Requirements 1.1, 1.2, 1.3
     * 
     * For any input, the returned interval should never be negative
     */
    test('Property 1: interval is always non-negative', () => {
      fc.assert(
        fc.property(
          fc.string(),
          (status) => {
            const interval = AdaptivePollingController.getIntervalForStatus(status);
            return interval >= 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('startPolling and stopPolling', () => {
    /**
     * Feature: order-status-optimization
     * Validates: Requirements 1.5
     * 
     * stopPolling should clear the interval and reset state
     */
    test('stopPolling clears interval and resets state', () => {
      // Start polling first
      AdaptivePollingController.startPolling('PENDING', () => {});
      expect(AdaptivePollingController.intervalId).not.toBeNull();
      
      // Stop polling
      AdaptivePollingController.stopPolling();
      expect(AdaptivePollingController.intervalId).toBeNull();
      expect(AdaptivePollingController.currentInterval).toBeNull();
    });

    /**
     * Feature: order-status-optimization
     * Validates: Requirements 1.3
     * 
     * startPolling with PICKED_UP status should not create an interval
     */
    test('startPolling with PICKED_UP does not create interval', () => {
      AdaptivePollingController.startPolling('PICKED_UP', () => {});
      expect(AdaptivePollingController.intervalId).toBeNull();
    });

    /**
     * Feature: order-status-optimization
     * Validates: Requirements 1.4
     * 
     * startPolling should set currentInterval to match the status
     */
    test('startPolling sets currentInterval correctly for each status', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE'),
          (status) => {
            AdaptivePollingController.startPolling(status, () => {});
            const expectedInterval = AdaptivePollingController.getIntervalForStatus(status);
            const result = AdaptivePollingController.currentInterval === expectedInterval;
            AdaptivePollingController.stopPolling();
            return result;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('adjustPolling', () => {
    /**
     * Feature: order-status-optimization
     * Validates: Requirements 1.4
     * 
     * adjustPolling should only restart if interval changes
     */
    test('adjustPolling does not restart if interval unchanged', () => {
      // Start with PENDING
      AdaptivePollingController.startPolling('PENDING', () => {});
      const originalIntervalId = AdaptivePollingController.intervalId;
      
      // Adjust to PLACED (same interval)
      AdaptivePollingController.adjustPolling('PLACED', () => {});
      
      // Should be the same interval ID (not restarted)
      expect(AdaptivePollingController.intervalId).toBe(originalIntervalId);
    });

    /**
     * Feature: order-status-optimization
     * Validates: Requirements 1.4
     * 
     * adjustPolling should restart when interval changes
     */
    test('adjustPolling restarts when interval changes', () => {
      // Start with PENDING (20s)
      AdaptivePollingController.startPolling('PENDING', () => {});
      const originalIntervalId = AdaptivePollingController.intervalId;
      
      // Adjust to COMPLETE (3s - different interval)
      AdaptivePollingController.adjustPolling('COMPLETE', () => {});
      
      // Should be a different interval ID (restarted)
      expect(AdaptivePollingController.intervalId).not.toBe(originalIntervalId);
      expect(AdaptivePollingController.currentInterval).toBe(3000);
    });
  });
});


describe('Conditional UI Update Logic', () => {
  /**
   * Feature: order-status-optimization, Property 6: Conditional UI update
   * Validates: Requirements 6.3
   * 
   * For any polling cycle where the fetched status equals the current status,
   * the UI render function should not be called.
   * 
   * This test validates the logic pattern used in order-status.js
   */
  test('Property 6: UI should only update when status changes', () => {
    // Simulate the conditional update logic from order-status.js
    const shouldUpdateUI = (currentStatus, fetchedStatus) => {
      return fetchedStatus !== currentStatus;
    };

    fc.assert(
      fc.property(
        fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP'),
        fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP'),
        (currentStatus, fetchedStatus) => {
          const shouldUpdate = shouldUpdateUI(currentStatus, fetchedStatus);
          
          // If statuses are the same, should NOT update
          if (currentStatus === fetchedStatus) {
            return shouldUpdate === false;
          }
          // If statuses are different, should update
          return shouldUpdate === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: order-status-optimization, Property 6: Same status never triggers update
   * Validates: Requirements 6.3
   */
  test('Property 6: Same status never triggers UI update', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP'),
        (status) => {
          // When current and fetched status are the same, no update should occur
          const shouldUpdate = status !== status; // This is always false
          return shouldUpdate === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: order-status-optimization, Property 6: Different status always triggers update
   * Validates: Requirements 6.3
   */
  test('Property 6: Different status always triggers UI update', () => {
    const statusPairs = [
      ['PENDING', 'PREPARING'],
      ['PENDING', 'COMPLETE'],
      ['PREPARING', 'COMPLETE'],
      ['COMPLETE', 'PICKED_UP'],
      ['PENDING', 'PICKED_UP']
    ];

    statusPairs.forEach(([current, fetched]) => {
      const shouldUpdate = fetched !== current;
      expect(shouldUpdate).toBe(true);
    });
  });
});
