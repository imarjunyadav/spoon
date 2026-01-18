/**
 * HorizontalStepperRenderer
 * Renders a modern horizontal status stepper for order tracking.
 * 
 * Design: Simple 3-step flow - Preparing → Ready → Picked Up
 * Clean, honest status without complex timing logic.
 * Icons: Food-centric, friendly, human-focused
 */
const HorizontalStepperRenderer = {
  // Stepper stages configuration - Simple 3-step flow with custom food-centric icons
  STAGES: [
    { dbStatus: 'PENDING', displayName: 'Preparing', icon: 'fa-utensils' },      // Chef cooking (fork & knife)
    { dbStatus: 'COMPLETE', displayName: 'Ready', icon: 'fa-bowl-rice' },        // Hot bowl of rice (steaming food)
    { dbStatus: 'PICKED_UP', displayName: 'Picked Up', icon: 'fa-circle-check' } // Clean checkmark
  ],

  // Colors
  COLORS: {
    complete: '#2E7D32',  // Green (same as Add button)
    pending: '#eb1700'    // Theme red
  },

  /**
   * Calculates the visual state for each stepper step.
   * 
   * Simple 3-step logic:
   * - PENDING/PLACED/PREPARING: Step 1 (Preparing) is current
   * - COMPLETE: Steps 1-2 complete, Step 2 (Ready) is current
   * - PICKED_UP: All steps complete
   * 
   * @param {string} currentStatus - Current order status
   * @returns {Array<{stage: Object, state: string, showTimestamp: boolean}>}
   */
  calculateStepStates(currentStatus) {
    return this.STAGES.map((stage, index) => {
      let state = 'pending';
      let showTimestamp = false;

      // PENDING/PLACED/PREPARING: First step is current
      if (currentStatus === 'PENDING' || currentStatus === 'PLACED' || currentStatus === 'PREPARING') {
        if (index === 0) {
          state = 'current';
          showTimestamp = true;
        }
      }
      // COMPLETE: First step complete, second is current
      else if (currentStatus === 'COMPLETE') {
        if (index === 0) {
          state = 'complete';
          showTimestamp = true;
        } else if (index === 1) {
          state = 'current';
          showTimestamp = true;
        }
      }
      // PICKED_UP: All steps complete
      else if (currentStatus === 'PICKED_UP') {
        state = 'complete';
        showTimestamp = true;
      }

      return { stage, state, showTimestamp };
    });
  },

  /**
   * Renders the horizontal stepper HTML.
   * 
   * Visual Flow:
   * - Current step: Theme red (#eb1700) with pulsing animation
   * - Completed steps: Green (#2E7D32) static
   * - Pending steps: Theme red (#eb1700) static
   * 
   * Timestamps:
   * - Preparing: order.created_at
   * - Ready: order.ready_at
   * - Picked Up: order.picked_up_at
   * 
   * @param {Object} order - Order object with status, verification_code, created_at, ready_at, picked_up_at
   * @returns {string} - HTML string for the stepper
   */
  renderStepper(order) {
    const currentStatus = order.status || 'PENDING';
    const stepStates = this.calculateStepStates(currentStatus);
    
    // Format timestamp helper
    const formatTime = (dateStr) => {
      if (!dateStr) return '';
      return new Date(dateStr).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: 'numeric', 
        hour12: true 
      });
    };
    
    // Map each step to its correct timestamp (simple 3-step)
    const stepTimestamps = {
      'PENDING': order.created_at,      // Preparing
      'COMPLETE': order.ready_at,       // Ready
      'PICKED_UP': order.picked_up_at   // Picked Up
    };

    let stepsHTML = '';
    
    stepStates.forEach(({ stage, state, showTimestamp }, index) => {
      const isComplete = state === 'complete';
      const isCurrent = state === 'current';
      
      // State classes for CSS styling
      let stepClass = 'stepper-step--pending';
      if (isComplete) stepClass = 'stepper-step--complete';
      if (isCurrent) stepClass = 'stepper-step--current';
      
      // Get the correct timestamp for this step
      const timestamp = showTimestamp ? formatTime(stepTimestamps[stage.dbStatus]) : '';
      
      // Connector line (not for last step)
      let connectorHTML = '';
      if (index < this.STAGES.length - 1) {
        const nextState = stepStates[index + 1];
        
        // Determine connector state class
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
   * 
   * CRITICAL OTP VISIBILITY RULE:
   * - OTP ONLY appears when status is COMPLETE (Ready for Pickup)
   * - OTP DISAPPEARS when status is PICKED_UP (show "Order Complete" instead)
   * 
   * @param {Object} order - Order object
   * @returns {string} - HTML string for the hero code
   */
  renderHeroCode(order) {
    const currentStatus = order.status || 'PENDING';
    const code = order.verification_code || '----';

    // PICKED_UP: Show clean "Order Complete" message (NO OTP)
    if (currentStatus === 'PICKED_UP') {
      return `
        <div class="hero-section hero-section--complete">
          <p class="hero-complete-message">Order completed successfully</p>
          <p class="hero-complete-submessage">Thank you for ordering</p>
        </div>
      `;
    }

    // COMPLETE: Show the hero verification code (OTP visible)
    if (currentStatus === 'COMPLETE') {
      return `
        <div class="hero-section hero-section--ready">
          <span class="hero-label">Pickup Code</span>
          <div class="hero-code">${code}</div>
          <p class="hero-instruction">Show this code at the counter to collect your order</p>
        </div>
      `;
    }

    // PENDING/PLACED/PREPARING: Show waiting message (NO OTP)
    return `
      <div class="hero-section hero-section--waiting">
        <p class="hero-message">Your order is being prepared</p>
        <p class="hero-submessage">We'll notify you when it's ready for pickup</p>
      </div>
    `;
  },

  /**
   * Checks if the rendered output contains a verification code.
   * @param {string} html - Rendered HTML string
   * @returns {boolean}
   */
  hasVerificationCode(html) {
    return html.includes('hero-code');
  },

  /**
   * Checks if the rendered output contains a thank you message.
   * @param {string} html - Rendered HTML string
   * @returns {boolean}
   */
  hasThankYouMessage(html) {
    return html.includes('hero-thanks');
  },

  /**
   * Checks if the rendered output contains any description paragraphs.
   * @param {string} html - Rendered HTML string
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
