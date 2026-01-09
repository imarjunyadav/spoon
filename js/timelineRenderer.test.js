/**
 * Property-Based Tests for HorizontalStepperRenderer
 * 
 * Feature: order-status-optimization
 * Tests the horizontal stepper rendering logic for order status display.
 */
const fc = require('fast-check');
const { HorizontalStepperRenderer } = require('./timelineRenderer');

describe('HorizontalStepperRenderer', () => {
  describe('calculateStepStates', () => {
    /**
     * Feature: order-status-optimization, Property 2: Timeline step state calculation
     * Validates: Requirements 3.1, 3.2, 3.3
     * 
     * For any order with PENDING status, the stepper should mark
     * "Order Placed" and "In the Kitchen" as complete/current, and rest as pending.
     */
    test('Property 2: PENDING status marks Order Placed and In the Kitchen as complete/current', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED'),
          (status) => {
            const states = HorizontalStepperRenderer.calculateStepStates(status);
            
            // Order Placed (index 0) should be complete
            const orderPlacedState = states[0];
            expect(orderPlacedState.state).toBe('complete');
            expect(orderPlacedState.showTimestamp).toBe(true);
            
            // In the Kitchen (index 1) should be current (auto-checked)
            const preparingState = states[1];
            expect(preparingState.state).toBe('current');
            expect(preparingState.showTimestamp).toBe(true);
            
            // Ready for Pickup (index 2) should be pending
            const readyState = states[2];
            expect(readyState.state).toBe('pending');
            expect(readyState.showTimestamp).toBe(false);
            
            // Picked Up (index 3) should be pending
            const completedState = states[3];
            expect(completedState.state).toBe('pending');
            expect(completedState.showTimestamp).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: order-status-optimization, Property 3: COMPLETE status visual mapping
     * Validates: Requirements 4.1, 4.2
     * 
     * For any order with COMPLETE status, the stepper should mark
     * "Order Placed", "In the Kitchen", and "Ready for Pickup" as complete/current.
     */
    test('Property 3: COMPLETE status marks first 3 steps as complete/current', () => {
      const states = HorizontalStepperRenderer.calculateStepStates('COMPLETE');
      
      // Order Placed (index 0) should be complete
      expect(states[0].state).toBe('complete');
      expect(states[0].showTimestamp).toBe(true);
      
      // In the Kitchen (index 1) should be complete
      expect(states[1].state).toBe('complete');
      expect(states[1].showTimestamp).toBe(true);
      
      // Ready for Pickup (index 2) should be current
      expect(states[2].state).toBe('current');
      expect(states[2].showTimestamp).toBe(true);
      
      // Picked Up (index 3) should be pending
      expect(states[3].state).toBe('pending');
      expect(states[3].showTimestamp).toBe(false);
    });

    /**
     * Feature: order-status-optimization, Property 4: PICKED_UP status visual mapping
     * Validates: Requirements 5.1, 5.2
     * 
     * For any order with PICKED_UP status, all stepper steps should be marked as complete.
     */
    test('Property 4: PICKED_UP status marks all steps as complete', () => {
      const states = HorizontalStepperRenderer.calculateStepStates('PICKED_UP');
      
      // All steps should be complete
      states.forEach((stepState) => {
        expect(stepState.state).toBe('complete');
        expect(stepState.showTimestamp).toBe(true);
      });
    });

    /**
     * Feature: order-status-optimization, Property 2: Always returns exactly 4 steps
     * Validates: Requirements 2.4
     * 
     * For any status, the stepper should always have exactly 4 steps.
     */
    test('Property 2: Always returns exactly 4 steps', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP'),
          (status) => {
            const states = HorizontalStepperRenderer.calculateStepStates(status);
            return states.length === 4;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: order-status-optimization
     * Validates: Requirements 3.1, 3.2, 3.3, 4.1, 5.1
     * 
     * For any valid status, each step state should be one of: 'complete', 'current', 'pending'
     */
    test('All step states are valid values', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP'),
          (status) => {
            const states = HorizontalStepperRenderer.calculateStepStates(status);
            const validStates = ['complete', 'current', 'pending'];
            
            return states.every(stepState => validStates.includes(stepState.state));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('renderStepper', () => {
    const createMockOrder = (status, verificationCode = 'ABC1') => ({
      status,
      verification_code: verificationCode,
      created_at: new Date().toISOString(),
      ready_at: status === 'COMPLETE' || status === 'PICKED_UP' ? new Date().toISOString() : null,
      picked_up_at: status === 'PICKED_UP' ? new Date().toISOString() : null
    });

    /**
     * Feature: order-status-optimization, Property 5: Stepper structure compliance
     * Validates: Requirements 2.1, 2.2, 2.3
     * 
     * For any rendered stepper, the output should contain horizontal-stepper class.
     */
    test('Property 5: Rendered stepper has horizontal layout', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP'),
          (status) => {
            const order = createMockOrder(status);
            const html = HorizontalStepperRenderer.renderStepper(order);
            return html.includes('horizontal-stepper') && html.includes('stepper-step');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: order-status-optimization, Property 5: Stepper contains all stage labels
     * Validates: Requirements 2.1, 2.2
     * 
     * For any rendered stepper, the output should contain all 4 stage labels.
     */
    test('Property 5: Rendered stepper contains all stage labels', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP'),
          (status) => {
            const order = createMockOrder(status);
            const html = HorizontalStepperRenderer.renderStepper(order);
            
            return html.includes('Order Placed') && 
                   html.includes('In the Kitchen') &&
                   html.includes('Ready') &&
                   html.includes('Picked Up');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: order-status-optimization, Property 5: Stepper uses correct colors
     * Validates: Requirements for green (#2E7D32) and red (#eb1700) colors
     */
    test('Property 5: Stepper uses correct color scheme', () => {
      const order = createMockOrder('COMPLETE');
      const html = HorizontalStepperRenderer.renderStepper(order);
      
      // Should contain green color for completed steps
      expect(html).toContain('#2E7D32');
      // Should contain red color for current/pending steps
      expect(html).toContain('#eb1700');
    });

    /**
     * Feature: order-status-optimization, Property 5: Stepper has connector lines
     * Validates: Horizontal layout with connector lines between steps
     */
    test('Property 5: Stepper has connector lines between steps', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE', 'PICKED_UP'),
          (status) => {
            const order = createMockOrder(status);
            const html = HorizontalStepperRenderer.renderStepper(order);
            // Should have 3 connector lines (between 4 steps)
            const connectorCount = (html.match(/stepper-connector/g) || []).length;
            return connectorCount === 3;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: order-status-optimization, Property 5: Current step has correct class
     * Validates: Current step should have stepper-step--current class for pulsing animation
     */
    test('Property 5: Current step has stepper-step--current class', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE'),
          (status) => {
            const order = createMockOrder(status);
            const html = HorizontalStepperRenderer.renderStepper(order);
            // Should have at least one current step (except PICKED_UP which is all complete)
            return html.includes('stepper-step--current');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: order-status-optimization, Property 5: PICKED_UP has all complete steps
     * Validates: All steps should be complete when order is picked up
     */
    test('Property 5: PICKED_UP status has all complete steps', () => {
      const order = createMockOrder('PICKED_UP');
      const html = HorizontalStepperRenderer.renderStepper(order);
      
      // Should have 4 complete steps
      const completeCount = (html.match(/stepper-step--complete/g) || []).length;
      expect(completeCount).toBe(4);
      
      // Should NOT have any current or pending steps
      expect(html).not.toContain('stepper-step--current');
      expect(html).not.toContain('stepper-step--pending');
    });
  });

  describe('renderHeroCode', () => {
    const createMockOrder = (status, verificationCode = 'XYZ9') => ({
      status,
      verification_code: verificationCode,
      created_at: new Date().toISOString(),
      ready_at: status === 'COMPLETE' || status === 'PICKED_UP' ? new Date().toISOString() : null,
      picked_up_at: status === 'PICKED_UP' ? new Date().toISOString() : null
    });

    /**
     * Feature: order-status-optimization, Property 3: Hero code display for COMPLETE ONLY
     * Validates: Requirements 4.2
     * 
     * CRITICAL: OTP ONLY appears when status is COMPLETE (Ready for Pickup).
     */
    test('Property 3: Hero code appears ONLY for COMPLETE status', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 4, maxLength: 4 }).filter(s => /^[A-Z0-9]+$/i.test(s)),
          (code) => {
            const order = createMockOrder('COMPLETE', code);
            const html = HorizontalStepperRenderer.renderHeroCode(order);
            
            return HorizontalStepperRenderer.hasVerificationCode(html) && 
                   html.includes(code) &&
                   html.includes('hero-section--ready');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: order-status-optimization, Property 4: PICKED_UP hides OTP
     * Validates: Requirements 5.2
     * 
     * CRITICAL: When status is PICKED_UP, OTP DISAPPEARS. Show "Order Complete" instead.
     */
    test('Property 4: PICKED_UP status hides OTP and shows Order Complete', () => {
      const order = createMockOrder('PICKED_UP', 'ABC1');
      const html = HorizontalStepperRenderer.renderHeroCode(order);
      
      // OTP should NOT be visible
      expect(HorizontalStepperRenderer.hasVerificationCode(html)).toBe(false);
      expect(html).not.toContain('ABC1');
      
      // Should show thank you message
      expect(HorizontalStepperRenderer.hasThankYouMessage(html)).toBe(true);
      expect(html).toContain('Thank you');
      expect(html).toContain('Order Complete');
      expect(html).toContain('hero-section--complete');
    });

    /**
     * Feature: order-status-optimization, Property 3: No hero code for PENDING/PLACED/PREPARING
     * Validates: Requirements 4.2
     * 
     * When status is PENDING/PLACED/PREPARING, hero section should show waiting message, not code.
     */
    test('Property 3: Waiting message appears for PENDING/PLACED/PREPARING status', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED', 'PREPARING'),
          (status) => {
            const order = createMockOrder(status);
            const html = HorizontalStepperRenderer.renderHeroCode(order);
            
            return !HorizontalStepperRenderer.hasVerificationCode(html) &&
                   html.includes('hero-section--waiting') &&
                   html.includes('being prepared');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: order-status-optimization, Property 4: Thank you only for PICKED_UP
     * Validates: Requirements 5.2
     * 
     * Thank you message should only appear for PICKED_UP status.
     */
    test('Property 4: Thank you message only for PICKED_UP', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('PENDING', 'PLACED', 'PREPARING', 'COMPLETE'),
          (status) => {
            const order = createMockOrder(status);
            const html = HorizontalStepperRenderer.renderHeroCode(order);
            
            return !HorizontalStepperRenderer.hasThankYouMessage(html);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('STAGES configuration', () => {
    /**
     * Feature: order-status-optimization, Property 5: Exactly 4 stages
     * Validates: Requirements 2.4
     */
    test('Property 5: STAGES has exactly 4 entries', () => {
      expect(HorizontalStepperRenderer.STAGES.length).toBe(4);
    });

    /**
     * Feature: order-status-optimization, Property 5: Stages have correct structure
     * Validates: Requirements 2.1, 2.3
     */
    test('Property 5: Each stage has dbStatus, displayName, icon (no description)', () => {
      HorizontalStepperRenderer.STAGES.forEach(stage => {
        expect(stage).toHaveProperty('dbStatus');
        expect(stage).toHaveProperty('displayName');
        expect(stage).toHaveProperty('icon');
        expect(stage).not.toHaveProperty('description');
      });
    });

    /**
     * Feature: order-status-optimization, Property 5: Stages have correct display names
     * Validates: New horizontal stepper stage names
     */
    test('Property 5: Stages have correct display names', () => {
      const expectedNames = ['Order Placed', 'In the Kitchen', 'Ready', 'Picked Up'];
      HorizontalStepperRenderer.STAGES.forEach((stage, index) => {
        expect(stage.displayName).toBe(expectedNames[index]);
      });
    });
  });

  describe('COLORS configuration', () => {
    /**
     * Feature: order-status-optimization, Property 5: Correct color values
     * Validates: Green (#2E7D32) and red (#eb1700) colors
     */
    test('Property 5: COLORS has correct values', () => {
      expect(HorizontalStepperRenderer.COLORS.complete).toBe('#2E7D32');
      expect(HorizontalStepperRenderer.COLORS.pending).toBe('#eb1700');
    });
  });
});
