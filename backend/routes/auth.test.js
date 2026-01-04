/**
 * Property-Based Tests for Auth Routes
 * 
 * Feature: email-otp-verification
 * 
 * These tests validate the email validation correctness property defined 
 * in the design document using fast-check for property-based testing.
 */

const fc = require('fast-check');
const { isValidEmail } = require('./auth');

// Test configuration: minimum 100 iterations per property
const PBT_CONFIG = { numRuns: 100 };

describe('Auth Routes Property-Based Tests', () => {

  /**
   * Feature: email-otp-verification, Property 10: Invalid Email Rejection
   * For any string that is not a valid email format, requesting an OTP SHALL 
   * return a validation error and no OTP SHALL be stored.
   * Validates: Requirements 5.1, 5.2
   */
  describe('Property 10: Invalid Email Rejection', () => {
    
    /**
     * Valid emails should pass validation
     */
    test('Valid emails are accepted', () => {
      fc.assert(
        fc.property(fc.emailAddress(), (email) => {
          expect(isValidEmail(email)).toBe(true);
        }),
        PBT_CONFIG
      );
    });

    /**
     * Strings without @ symbol should be rejected
     */
    test('Strings without @ are rejected', () => {
      // Generate strings that don't contain @
      const noAtArb = fc.string().filter(s => !s.includes('@') && s.length > 0);
      
      fc.assert(
        fc.property(noAtArb, (invalidEmail) => {
          expect(isValidEmail(invalidEmail)).toBe(false);
        }),
        PBT_CONFIG
      );
    });

    /**
     * Strings with @ but no domain should be rejected
     */
    test('Strings with @ but no domain are rejected', () => {
      // Generate strings like "user@" or "@"
      const noDomainArb = fc.tuple(
        fc.string({ minLength: 0, maxLength: 20 }),
        fc.constant('@')
      ).map(([local, at]) => local + at);
      
      fc.assert(
        fc.property(noDomainArb, (invalidEmail) => {
          expect(isValidEmail(invalidEmail)).toBe(false);
        }),
        PBT_CONFIG
      );
    });

    /**
     * Strings with @ but no local part should be rejected
     */
    test('Strings with @ but no local part are rejected', () => {
      // Generate strings like "@domain.com"
      const noLocalArb = fc.tuple(
        fc.constant('@'),
        fc.domain()
      ).map(([at, domain]) => at + domain);
      
      fc.assert(
        fc.property(noLocalArb, (invalidEmail) => {
          expect(isValidEmail(invalidEmail)).toBe(false);
        }),
        PBT_CONFIG
      );
    });

    /**
     * Strings with @ but invalid domain (no TLD) should be rejected
     */
    test('Strings with @ but no TLD are rejected', () => {
      // Generate strings like "user@domain" (no dot in domain)
      const noTldArb = fc.tuple(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('@') && !s.includes(' ')),
        fc.constant('@'),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes('.') && !s.includes('@') && !s.includes(' '))
      ).map(([local, at, domain]) => local + at + domain);
      
      fc.assert(
        fc.property(noTldArb, (invalidEmail) => {
          expect(isValidEmail(invalidEmail)).toBe(false);
        }),
        PBT_CONFIG
      );
    });

    /**
     * Empty strings and null/undefined should be rejected
     */
    test('Empty, null, and undefined values are rejected', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
    });

    /**
     * Strings with spaces should be rejected (after trim, if still invalid)
     */
    test('Whitespace-only strings are rejected', () => {
      // Generate whitespace-only strings using array of whitespace chars
      const whitespaceArb = fc.array(
        fc.constantFrom(' ', '\t', '\n', '\r'),
        { minLength: 1, maxLength: 10 }
      ).map(arr => arr.join(''));
      
      fc.assert(
        fc.property(whitespaceArb, (whitespace) => {
          expect(isValidEmail(whitespace)).toBe(false);
        }),
        PBT_CONFIG
      );
    });
  });
});
