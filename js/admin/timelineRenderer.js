/**
 * Spoon - Horizontal Stepper Renderer
 * 
 * Renders a modern horizontal status stepper for order tracking.
 * - Simple 3-step flow: Preparing → Ready → Picked Up.
 * - Shows timestamps for each step.
 * - Displays valid pickup codes only when order is Ready.
 */

const HorizontalStepperRenderer = {
  // Stepper stages configuration
  STAGES: [
    { dbStatus: 'PENDING', displayName: 'Preparing', icon: 'fa-utensils' },
    { dbStatus: 'COMPLETE', displayName: 'Ready', icon: 'fa-bowl-rice' },
    { dbStatus: 'PICKED_UP', displayName: 'Picked Up', icon: 'fa-circle-check' }
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
    return this.STAGES.map((stage, index) => {
      let state = 'pending';
      let showTimestamp = false;

      // Preparing Stage
      if (['PENDING', 'PLACED', 'PREPARING'].includes(currentStatus)) {
        if (index === 0) {
          state = 'current';
          showTimestamp = true;
        }
      }
      // Ready Stage
      else if (currentStatus === 'COMPLETE') {
        if (index === 0) {
          state = 'complete';
          showTimestamp = true;
        } else if (index === 1) {
          state = 'current';
          showTimestamp = true;
        }
      }
      // Picked Up Stage
      else if (currentStatus === 'PICKED_UP') {
        state = 'complete';
        showTimestamp = true;
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
    const currentStatus = order.status || 'PENDING';
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
      'PENDING': order.created_at,
      'COMPLETE': order.ready_at,
      'PICKED_UP': order.picked_up_at
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
   * Renders the hero verification code section.
   * Shows OTP only when order is Ready (COMPLETE).
   * @param {Object} order - Order object.
   * @returns {string} HTML string.
   */
  renderHeroCode(order) {
    const currentStatus = order.status || 'PENDING';
    const code = order.verification_code || '----';

    if (currentStatus === 'PICKED_UP') {
      return `
        <div class="hero-section hero-section--complete">
          <p class="hero-complete-message">Order completed successfully</p>
          <p class="hero-complete-submessage">Thank you for ordering</p>
        </div>
      `;
    }

    if (currentStatus === 'COMPLETE') {
      return `
        <div class="hero-section hero-section--ready">
          <span class="hero-label">Pickup Code</span>
          <div class="hero-code">${code}</div>
          <p class="hero-instruction">Show this code at the counter to collect your order</p>
        </div>
      `;
    }

    return `
      <div class="hero-section hero-section--waiting">
        <p class="hero-message">Your order is being prepared</p>
        <p class="hero-submessage">We'll notify you when it's ready for pickup</p>
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
