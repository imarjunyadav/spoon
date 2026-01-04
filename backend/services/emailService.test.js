/**
 * Property-Based Tests for Email Service
 * 
 * Feature: email-otp-verification
 * 
 * These tests validate the correctness properties defined in the design document
 * using fast-check for property-based testing.
 */

const fc = require('fast-check');
const { generateOTPEmailTemplate } = require('./emailService');

// Test configuration: minimum 100 iterations per property
const PBT_CONFIG = { numRuns: 100 };

// OTP generator (4-digit string)
const otpArb = fc.integer({ min: 0, max: 9999 }).map(n => n.toString().padStart(4, '0'));

describe('Email Service Property-Based Tests', () => {

  /**
   * Feature: email-otp-verification, Property 5: Email Content Contains OTP
   * For any 4-digit OTP string, the generated email body SHALL contain that exact OTP string.
   * Validates: Requirements 2.2
   */
  test('Property 5: Email Content Contains OTP', () => {
    fc.assert(
      fc.property(otpArb, (otp) => {
        const emailHtml = generateOTPEmailTemplate(otp);
        
        // Email content must be a string
        expect(typeof emailHtml).toBe('string');
        
        // Email content must contain the exact OTP
        expect(emailHtml).toContain(otp);
      }),
      PBT_CONFIG
    );
  });
});
