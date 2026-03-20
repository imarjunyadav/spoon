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
    { dbStatus: 'pending', displayName: 'Received', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20zm15-5H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2z"/></svg>' },
    { dbStatus: 'kitchen', displayName: 'Cooking', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c-3.5 3.5-5 5.9-5 8.9 0 2.8 2.2 5 5 5s5-2.2 5-5c0-3-1.5-5.4-5-8.9zm0 11.1c-1.1 0-2-.9-2-2 0-1.2 1-2.4 2-3.8 1 1.4 2 2.6 2 3.8 0 1.1-.9 2-2 2z"/></svg>' },
    { dbStatus: 'prepared', displayName: 'Ready', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.5 11h13c.8 0 1.5.7 1.5 1.5V13c0 2.8-2.2 5-5 5H9c-2.8 0-5-2.2-5-5v-.5C4 11.7 4.7 11 5.5 11zM11 5c.6 0 1 .4 1 1v3c0 .6-.4 1-1 1s-1-.4-1-1V6c0-.6.4-1 1-1zm4 0c.6 0 1 .4 1 1v3c0 .6-.4 1-1 1s-1-.4-1-1V6c0-.6.4-1 1-1zm-8 0c.6 0 1 .4 1 1v3c0 .6-.4 1-1 1s-1-.4-1-1V6c0-.6.4-1 1-1z"/></svg>' },
    { dbStatus: 'completed', displayName: 'Collected', svg: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>' }
  ],

  CANCELLED_SVG: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>',

  COLORS: {
    complete: '#2E7D32',  // Green
    pending: '#eb1700'    // Red
  },

  /**
   * Calculates the visual state for each stepper step.
   * @param {string} currentStatus - Current order status.
   * @returns {Array<{stage: Object, state: string, showTimestamp: boolean}>}
   */
  calculateStepStates(order) {
    const currentStatus = order.status || 'pending';
    const statusMap = {
      'pending': 0,
      'kitchen': 1,
      'prepared': 2,
      'completed': 3,
      'cancelled': -1
    };

    const currentIndex = statusMap[currentStatus] !== undefined ? statusMap[currentStatus] : 0;

    let cancelIndex = -1;
    if (currentStatus === 'cancelled') {
      if (order.prepared_at) cancelIndex = 2;
      else if (order.kitchen_at) cancelIndex = 1;
      else cancelIndex = 0;
    }

    return this.STAGES.map((stage, index) => {
      let state = 'pending';
      let showTimestamp = false;
      let isCancelledNode = false;

      if (currentStatus === 'completed' || index < currentIndex) {
        state = 'complete';
        showTimestamp = true;
      } else if (index === currentIndex && currentStatus !== 'cancelled') {
        state = 'current';
        showTimestamp = true;
      }

      if (currentStatus === 'cancelled') {
        if (index <= cancelIndex) {
          state = 'complete';
          showTimestamp = true;
        } else if (index === 3) {
          state = 'current';
          isCancelledNode = true;
          showTimestamp = true;
        } else {
          state = 'pending';
          showTimestamp = false;
        }
      }

      return { stage, state, showTimestamp, isCancelledNode };
    });
  },

  /**
   * Renders the horizontal stepper HTML.
   * @param {Object} order - Order object.
   * @returns {string} HTML string.
   */
  renderStepper(order) {
    const currentStatus = order.status || 'pending';
    const stepStates = this.calculateStepStates(order);

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
      'kitchen': order.kitchen_at || order.created_at,
      'prepared': order.prepared_at,
      'completed': order.completed_at
    };

    let stepsHTML = '';

    // Calculate the cancel index again to properly slice the dotted lines
    let cancelIndex = -1;
    if (currentStatus === 'cancelled') {
      if (order.prepared_at) cancelIndex = 2;
      else if (order.kitchen_at) cancelIndex = 1;
      else cancelIndex = 0;
    }

    stepStates.forEach(({ stage, state, showTimestamp, isCancelledNode }, index) => {
      const isComplete = state === 'complete';
      const isCurrent = state === 'current';

      let stepClass = 'stepper-step--pending';
      if (isComplete) stepClass = 'stepper-step--complete';
      if (isCurrent) stepClass = 'stepper-step--current';

      let timestamp = showTimestamp ? formatTime(stepTimestamps[stage.dbStatus]) : '';
      if (isCancelledNode && (order.cancelled_at || order.updated_at)) {
        timestamp = formatTime(order.cancelled_at || order.updated_at);
      }

      let connectorHTML = '';
      if (index < this.STAGES.length - 1) {
        let connectorClass = 'stepper-connector--pending';

        if (currentStatus === 'cancelled' && index >= cancelIndex) {
          // Line starting from the cancellation point (or any node after) must be grey static.
          connectorClass = 'stepper-connector--pending';
        } else if (isComplete) {
          connectorClass = 'stepper-connector--complete';
        } else if (isCurrent) {
          connectorClass = 'stepper-connector--current';
        }

        connectorHTML = `<div class="stepper-connector ${connectorClass}"></div>`;
      }

      const iconSVG = isCancelledNode ? this.CANCELLED_SVG : stage.svg;
      const displayName = isCancelledNode ? 'Cancelled' : stage.displayName;

      stepsHTML += `
        <div class="stepper-step ${stepClass}">
          <div class="stepper-icon">
             ${iconSVG}
          </div>
          <span class="stepper-label">${displayName}</span>
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
      let cancelReasonText = 'Order Cancelled';
      // Calculate how long it was uncollected
      if (order.prepared_at && (order.cancelled_at || order.updated_at)) {
        const prepTime = new Date(order.prepared_at).getTime();
        const cancelTime = new Date(order.cancelled_at || order.updated_at).getTime();
        let waitedMins = Math.floor((cancelTime - prepTime) / 60000);

        if (isNaN(waitedMins)) {
          cancelReasonText = "Your order was ready but went uncollected. Refunded as spoon coins. Reorder anytime!";
        } else {
          if (waitedMins < 1) waitedMins = 1; // display at least 1 min to prevent '0 mins'
          cancelReasonText = "Your order was ready for " + waitedMins + " mins but went uncollected. Refunded as spoon coins. Reorder anytime!";
        }
      } else {
        cancelReasonText = order.refund_amount ? "Rs " + order.refund_amount + " refunded to wallet as coins" : "Refund processed";
      }

      return `
        <div class="hero-section" style="background: #ffffff; text-align: center;">
          <p class="hero-complete-message" style="color: #c62828;">Order Cancelled</p>
          <p class="hero-complete-submessage" style="color: #555555; font-size: 14px; line-height: 1.4; margin-top: 10px;">${cancelReasonText}</p>
        </div>
      `;
    }

    if (currentStatus === 'prepared') {
      if (order.arrived_at) {
        // Slot is revealed (Screen 3)
        return `
          <div class="hero-section hero-section--ready" style="text-align:center;">
            <span class="hero-label">Say your order with</span>
            <div class="hero-code" style="font-size: 64px; font-weight: 800; line-height: 1; margin: 15px 0; letter-spacing: 0; color: #333;">${order.slot_number}</div>
            <p class="hero-instruction" style="color: #eb1700; font-weight: 600;">Do not share this with anyone</p>
          </div>
        `;
      } else {
        // Needs user to arrive
        return `
          <!-- Screen 1: Walk to counter -->
          <div id="arrive-screen-1" class="hero-section hero-section--ready" style="text-align:center;">
            <p class="hero-complete-message" style="margin-bottom: 12px; font-size: 18px;">Your food is ready!</p>
            <p class="hero-instruction" style="margin-bottom: 20px; font-size: 13px; font-weight: normal; color:#666;">Walk to the counter first, then tap the button below.</p>
            <button onclick="document.getElementById('arrive-screen-1').style.display='none'; document.getElementById('arrive-screen-2').style.display='block';" style="background:var(--brand-primary); color:white; border:none; padding:14px 24px; border-radius:12px; font-size:16px; font-weight:600; cursor:pointer; width:100%; box-shadow:0 4px 12px rgba(235, 23, 0, 0.2);">
               I'm at the counter, reveal my slot
            </button>
            <p style="margin-top: 16px; font-size: 12px; color: #888; line-height: 1.4; text-align: center;">
              <span style="display: block; font-weight: bold;">Reach the counter within 4 mins.</span>
              we keep orders moving so everyone gets served fresh & fast. uncollected orders will be cancelled & refunded as spoon coins.
            </p>
          </div>

          <!-- Screen 2: Confirmation -->
          <div id="arrive-screen-2" class="hero-section hero-section--ready" style="text-align:center; display:none; background:white;">
            <p class="hero-complete-message" style="margin-bottom: 12px; font-size: 15px;">Are you standing right in front of the counter?</p>
            <p class="hero-instruction" style="margin-bottom: 24px; font-size: 11px; color:#555;">Slot will be revealed only once. Do not tap unless you are there.</p>
            <div style="display:flex; gap:12px;">
                <button id="btn-arrive" onclick="window.markArrived()" style="background:var(--brand-primary); color:white; border:none; padding:12px 10px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; flex: 1; box-shadow:0 2px 8px rgba(235, 23, 0, 0.2);">
                    Yes, I'm right here
                </button>
                <button onclick="document.getElementById('arrive-screen-2').style.display='none'; document.getElementById('arrive-screen-1').style.display='block';" style="background:#e0e0e0; color:#333; border:none; padding:12px 10px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; flex: 1;">
                    Not yet
                </button>
            </div>
          </div>
        `;
      }
    }

    // Pending / Kitchen
    return `
      <div class="hero-section hero-section--waiting">
        <p class="hero-message">${currentStatus === 'kitchen' ? "We're cooking your order!" : "We've got your order!"}</p>
        <p class="hero-submessage">${currentStatus === 'kitchen' ? "We'll send you an email when it's ready." : "Sit back, we'll mail you when it's ready."}</p>
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
