/**
 * Spoon - Horizontal Stepper Renderer
 * 
 * Renders a modern horizontal status stepper for order tracking.
 * - Simple 3-step flow: Preparing → Ready → Picked Up.
 * - Shows timestamps for each step.
 * - Displays valid pickup codes only when order is Ready.
 */

const HorizontalStepperRenderer = {
  // Stepper stages configuration (v2 states)
  STAGES: [
    { dbStatus: 'pending', displayName: 'Received', icon: 'fa-clock' }, // changed from 'In Queue'
    { dbStatus: 'kitchen', displayName: 'Cooking', icon: 'fa-fire-burner' }, // changed from 'Preparing'
    { dbStatus: 'prepared', displayName: 'Ready', icon: 'fa-bell' },
    { dbStatus: 'completed', displayName: 'Collected', icon: 'fa-circle-check' }
  ],

  COLORS: {
    complete: '#2E7D32',  // Green
    pending: '#eb1700'    // Red
  },

  /**
   * Calculates the visual state for each stepper step.
   * @param {string} currentStatus - Current order status.
   * @returns {Array<{stage: Object, state: string, showTimestamp: boolean}>}
   */
  calculateStepStates(currentStatus) {
    // Note: status order assumed: pending -> kitchen -> prepared -> completed
    const statusMap = {
      'pending': 0,
      'kitchen': 1,
      'prepared': 2,
      'completed': 3,
      'cancelled': -1
    };
    
    const currentIndex = statusMap[currentStatus] !== undefined ? statusMap[currentStatus] : 0;

    return this.STAGES.map((stage, index) => {
      let state = 'pending';
      let showTimestamp = false;

      if (index < currentIndex) {
        state = 'complete';
        showTimestamp = true;
      } else if (index === currentIndex) {
        state = 'current';
        showTimestamp = true;
      }

      // If cancelled, show what happened up to where it stopped
      if (currentStatus === 'cancelled') {
         state = 'pending'; 
         showTimestamp = false; 
      }

      return { stage, state, showTimestamp };
    });
  },

  /**
   * Renders the horizontal stepper HTML.
   * @param {Object} order - Order object.
   * @returns {string} HTML string.
   */
  renderStepper(order) {
    const currentStatus = order.status || 'pending';
    const stepStates = this.calculateStepStates(currentStatus);

    const formatTime = (dateStr) => {
      if (!dateStr) return '';
      return new Date(dateStr).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
      });
    };

    const stepTimestamps = {
      'pending': order.created_at,
      'kitchen': order.kitchen_at || order.created_at, // Fallback
      'prepared': order.prepared_at,
      'completed': order.completed_at
    };

    let stepsHTML = '';

    stepStates.forEach(({ stage, state, showTimestamp }, index) => {
      const isComplete = state === 'complete';
      const isCurrent = state === 'current';

      let stepClass = 'stepper-step--pending';
      if (isComplete) stepClass = 'stepper-step--complete';
      if (isCurrent) stepClass = 'stepper-step--current';

      const timestamp = showTimestamp ? formatTime(stepTimestamps[stage.dbStatus]) : '';

      let connectorHTML = '';
      if (index < this.STAGES.length - 1) {
        let connectorClass = 'stepper-connector--pending';
        if (isComplete) {
          connectorClass = 'stepper-connector--complete';
        } else if (isCurrent) {
          connectorClass = 'stepper-connector--current';
        }
        connectorHTML = `<div class="stepper-connector ${connectorClass}"></div>`;
      }

      stepsHTML += `
        <div class="stepper-step ${stepClass}">
          <div class="stepper-icon">
            <i class="fa-solid ${stage.icon}"></i>
          </div>
          <span class="stepper-label">${stage.displayName}</span>
          <span class="stepper-time">${timestamp}</span>
        </div>
        ${connectorHTML}
      `;
    });

    return `
      <div class="horizontal-stepper">
        ${stepsHTML}
      </div>
    `;
  },

  /**
   * Renders the hero verification code section based on v2 logic.
   * @param {Object} order - Order object.
   * @returns {string} HTML string.
   */
  renderHeroCode(order) {
    const currentStatus = order.status || 'pending';

    if (currentStatus === 'completed') {
      return `
        <div class="hero-section hero-section--complete">
          <p class="hero-complete-message">Order completed successfully</p>
          <p class="hero-complete-submessage">Thank you for ordering with Spoon!</p>
        </div>
      `;
    }

    if (currentStatus === 'cancelled') {
       return `
        <div class="hero-section" style="background: #ffebee;">
          <p class="hero-complete-message" style="color: #d32f2f;">Order Cancelled</p>
          <p class="hero-complete-submessage" style="color: #c62828;">${order.refund_amount ? '₹' + order.refund_amount + ' refunded to wallet as coins' : 'Refund processed'}</p>
        </div>
      `;
    }

    if (currentStatus === 'prepared') {
      if (order.arrived_at) {
        // Slot is revealed
        return `
          <div class="hero-section hero-section--ready" style="text-align:center;">
            <span class="hero-label">Collect your order at</span>
            <div class="hero-code" style="font-size: 32px; letter-spacing: 0;">Slot ${order.slot_number}</div>
            <p class="hero-instruction">Show this screen to the staff</p>
          </div>
        `;
      } else {
        // Needs user to arrive
        return `
          <div class="hero-section hero-section--ready" style="text-align:center;">
            <p class="hero-complete-message" style="margin-bottom: 12px; font-size: 18px;">Your food is hot and ready!</p>
            <button id="btn-arrive" onclick="window.markArrived()" style="background:var(--brand-primary); color:white; border:none; padding:12px 24px; border-radius:12px; font-size:16px; font-weight:600; cursor:pointer; width:100%; box-shadow:0 4px 12px rgba(235, 23, 0, 0.2);">
               I am available to collect
            </button>
            <p class="hero-instruction" style="margin-top: 12px; font-size: 12px;">Tap when you reach the counter to reveal your slot number</p>
          </div>
        `;
      }
    }

    // Pending / Kitchen
    return `
      <div class="hero-section hero-section--waiting">
        <p class="hero-message">${currentStatus === 'kitchen' ? 'Your order is being cooked' : 'Your order is in the queue'}</p>
        <p class="hero-submessage">We'll notify you when it's ready for collection</p>
      </div>
    `;
  },

  /**
   * Checks if HTML contains a verification code.
   * @param {string} html 
   * @returns {boolean}
   */
  hasVerificationCode(html) {
    return html.includes('hero-code');
  },

  /**
   * Checks if HTML contains a thank you message.
   * @param {string} html 
   * @returns {boolean}
   */
  hasThankYouMessage(html) {
    return html.includes('hero-thanks');
  },

  /**
   * Checks if HTML contains description paragraphs.
   * @param {string} html 
   * @returns {boolean}
   */
  hasDescription(html) {
    return html.includes('timeline-step__description');
  }
};

// Alias for backward compatibility
const MinimalistTimelineRenderer = HorizontalStepperRenderer;

// Export for Node.js/testing environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HorizontalStepperRenderer, MinimalistTimelineRenderer };
}
