/**
 * AdaptivePollingController
 * Implements hybrid polling strategy for order status updates.
 * 
 * This module manages polling intervals based on order status to optimize
 * server load while maintaining fast updates during critical moments.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */
const AdaptivePollingController = {
  // Polling intervals in milliseconds based on order status
  // Requirements: 1.1, 1.2, 1.3
  INTERVALS: {
    PENDING: 20000,    // 20 seconds - user is waiting/walking
    PLACED: 20000,     // 20 seconds - same as PENDING
    PREPARING: 20000,  // 20 seconds - kitchen is working
    COMPLETE: 3000,    // 3 seconds - Counter Moment (critical for fast pickup confirmation)
    PICKED_UP: 0       // No polling - order complete
  },

  // Current polling state
  currentInterval: null,
  intervalId: null,

  /**
   * Get the appropriate polling interval for a given order status.
   * 
   * @param {string} status - Order status ('PENDING'|'PLACED'|'PREPARING'|'COMPLETE'|'PICKED_UP')
   * @returns {number} - Polling interval in milliseconds (0 = no polling)
   * 
   * Requirements: 1.1, 1.2, 1.3
   */
  getIntervalForStatus(status) {
    // Only check own properties to avoid prototype pollution
    if (Object.prototype.hasOwnProperty.call(this.INTERVALS, status)) {
      return this.INTERVALS[status];
    }
    // Default to PENDING interval for unknown statuses
    return this.INTERVALS.PENDING;
  },

  /**
   * Start or restart polling with the appropriate interval for the given status.
   * 
   * @param {string} status - Current order status
   * @param {Function} pollCallback - Function to call on each poll
   * 
   * Requirements: 1.4, 1.5
   */
  startPolling(status, pollCallback) {
    // Clear any existing interval first
    this.stopPolling();

    const interval = this.getIntervalForStatus(status);
    
    // Don't start polling if interval is 0 (PICKED_UP status)
    if (interval === 0) {
      console.log('⏹️ No polling needed for status:', status);
      return;
    }

    console.log(`⏰ Starting adaptive polling for status "${status}" at ${interval}ms interval`);
    
    this.currentInterval = interval;
    this.intervalId = setInterval(() => {
      if (typeof pollCallback === 'function') {
        pollCallback();
      }
    }, interval);
  },

  /**
   * Stop all polling and clear the interval.
   * 
   * Requirements: 1.3, 1.5
   */
  stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.currentInterval = null;
      console.log('⏹️ Polling stopped');
    }
  },

  /**
   * Adjust polling interval when status changes.
   * Only restarts polling if the new interval differs from current.
   * 
   * @param {string} newStatus - New order status
   * @param {Function} pollCallback - Function to call on each poll
   * 
   * Requirements: 1.4
   */
  adjustPolling(newStatus, pollCallback) {
    const newInterval = this.getIntervalForStatus(newStatus);
    
    // If interval hasn't changed, no need to restart
    if (newInterval === this.currentInterval) {
      return;
    }

    console.log(`🔄 Adjusting polling: ${this.currentInterval}ms → ${newInterval}ms for status "${newStatus}"`);
    this.startPolling(newStatus, pollCallback);
  }
};

// Export for Node.js/testing environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AdaptivePollingController };
}
