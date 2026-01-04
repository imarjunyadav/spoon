/**
 * Property-Based Tests for OTP Store Service
 * 
 * Feature: email-otp-verification
 * 
 * These tests validate the correctness properties defined in the design document
 * using fast-check for property-based testing.
 */

const fc = require('fast-check');
const otpStore = require('./otpStore');

// Test configuration: minimum 100 iterations per property
const PBT_CONFIG = { numRuns: 100 };

// Email generator for valid email addresses
const emailArb = fc.emailAddress();

// OTP generator (4-digit string)
const otpArb = fc.integer({ min: 0, max: 9999 }).map(n => n.toString().padStart(4, '0'));

describe('OTP Store Property-Based Tests', () => {
  
  // Clear state before each test
  beforeEach(() => {
    otpStore.clearAll();
  });

  /**
   * Feature: email-otp-verification, Property 1: OTP Format Invariant
   * For any valid email address, when an OTP is generated, the result SHALL be 
   * a string of exactly 4 numeric digits (0-9).
   * Validates: Requirements 1.1
   */
  test('Property 1: OTP Format Invariant', () => {
    fc.assert(
      fc.property(emailArb, (email) => {
        const otp = otpStore.generateOTP(email);
        
        // Must be a string
        expect(typeof otp).toBe('string');
        // Must be exactly 4 characters
        expect(otp.length).toBe(4);
        // Must contain only digits 0-9
        expect(/^[0-9]{4}$/.test(otp)).toBe(true);
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: email-otp-verification, Property 3: OTP Storage Round-Trip
   * For any valid email address, generating an OTP and then verifying with that 
   * same OTP (before expiration) SHALL return success.
   * Validates: Requirements 1.3, 3.1, 3.2
   */
  test('Property 3: OTP Storage Round-Trip', () => {
    fc.assert(
      fc.property(emailArb, (email) => {
        // Generate and store OTP
        const otp = otpStore.generateOTP(email);
        otpStore.storeOTP(email, otp);
        
        // Verify with the same OTP should succeed
        const result = otpStore.verifyOTP(email, otp);
        
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: email-otp-verification, Property 4: OTP Replacement Invalidation
   * For any email address, when a new OTP is generated while a previous one exists, 
   * verifying with the old OTP SHALL fail.
   * Validates: Requirements 1.4
   */
  test('Property 4: OTP Replacement Invalidation', () => {
    fc.assert(
      fc.property(emailArb, (email) => {
        // Generate and store first OTP
        const oldOtp = otpStore.generateOTP(email);
        otpStore.storeOTP(email, oldOtp);
        
        // Generate and store new OTP (should invalidate old one)
        const newOtp = otpStore.generateOTP(email);
        otpStore.storeOTP(email, newOtp);
        
        // If old and new OTP are different, old should fail
        if (oldOtp !== newOtp) {
          const result = otpStore.verifyOTP(email, oldOtp);
          expect(result.valid).toBe(false);
          expect(result.error).toBe('INVALID_OTP');
        }
        
        // New OTP should still work
        const newResult = otpStore.verifyOTP(email, newOtp);
        expect(newResult.valid).toBe(true);
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: email-otp-verification, Property 6: Wrong OTP Rejection
   * For any email with a stored OTP, submitting any OTP that differs from the 
   * stored value SHALL return an invalid OTP error.
   * Validates: Requirements 3.3
   */
  test('Property 6: Wrong OTP Rejection', () => {
    fc.assert(
      fc.property(emailArb, otpArb, otpArb, (email, correctOtp, wrongOtp) => {
        // Only test when OTPs are different
        fc.pre(correctOtp !== wrongOtp);
        
        // Store the correct OTP
        otpStore.storeOTP(email, correctOtp);
        
        // Verify with wrong OTP should fail
        const result = otpStore.verifyOTP(email, wrongOtp);
        
        expect(result.valid).toBe(false);
        expect(result.error).toBe('INVALID_OTP');
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: email-otp-verification, Property 7: Single-Use Enforcement
   * For any successfully verified OTP, attempting to verify with the same OTP 
   * again SHALL fail.
   * Validates: Requirements 3.5
   */
  test('Property 7: Single-Use Enforcement', () => {
    fc.assert(
      fc.property(emailArb, (email) => {
        // Generate and store OTP
        const otp = otpStore.generateOTP(email);
        otpStore.storeOTP(email, otp);
        
        // First verification should succeed
        const firstResult = otpStore.verifyOTP(email, otp);
        expect(firstResult.valid).toBe(true);
        
        // Second verification with same OTP should fail
        const secondResult = otpStore.verifyOTP(email, otp);
        expect(secondResult.valid).toBe(false);
        expect(secondResult.error).toBe('OTP_NOT_FOUND');
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: email-otp-verification, Property 8: Rate Limit Enforcement
   * For any email address, after 5 OTP requests within a 15-minute window, 
   * the 6th request SHALL be rejected with a rate limit error.
   * Validates: Requirements 4.1, 4.2
   */
  test('Property 8: Rate Limit Enforcement', () => {
    fc.assert(
      fc.property(emailArb, (email) => {
        // First 5 requests should be allowed
        for (let i = 0; i < otpStore.MAX_OTP_REQUESTS; i++) {
          const result = otpStore.checkRateLimit(email);
          expect(result.allowed).toBe(true);
        }
        
        // 6th request should be rate limited
        const rateLimitedResult = otpStore.checkRateLimit(email);
        expect(rateLimitedResult.allowed).toBe(false);
        expect(rateLimitedResult.retryAfter).toBeDefined();
        expect(typeof rateLimitedResult.retryAfter).toBe('number');
        expect(rateLimitedResult.retryAfter).toBeGreaterThan(0);
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: email-otp-verification, Property 9: Verification Attempt Limit
   * For any OTP session, after 5 failed verification attempts, further verification 
   * attempts SHALL be blocked until a new OTP is generated.
   * Validates: Requirements 4.3
   */
  test('Property 9: Verification Attempt Limit', () => {
    fc.assert(
      fc.property(emailArb, otpArb, (email, wrongOtp) => {
        // Generate and store a correct OTP
        const correctOtp = otpStore.generateOTP(email);
        otpStore.storeOTP(email, correctOtp);
        
        // Ensure wrong OTP is different from correct OTP
        const actualWrongOtp = correctOtp === wrongOtp 
          ? ((parseInt(wrongOtp) + 1) % 10000).toString().padStart(4, '0')
          : wrongOtp;
        
        // Make MAX_VERIFICATION_ATTEMPTS failed attempts
        for (let i = 0; i < otpStore.MAX_VERIFICATION_ATTEMPTS; i++) {
          const result = otpStore.verifyOTP(email, actualWrongOtp);
          expect(result.valid).toBe(false);
          expect(result.error).toBe('INVALID_OTP');
        }
        
        // Next attempt should be blocked with MAX_ATTEMPTS error
        const blockedResult = otpStore.verifyOTP(email, actualWrongOtp);
        expect(blockedResult.valid).toBe(false);
        expect(blockedResult.error).toBe('MAX_ATTEMPTS');
        
        // Even correct OTP should be blocked now
        const correctAttempt = otpStore.verifyOTP(email, correctOtp);
        expect(correctAttempt.valid).toBe(false);
        expect(correctAttempt.error).toBe('MAX_ATTEMPTS');
      }),
      PBT_CONFIG
    );
  });
});
