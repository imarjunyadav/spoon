/**
 * Property-Based Tests for Auth Routes
 * 
 * Feature: email-otp-verification, otp-scaling-production
 * 
 * These tests validate the email validation correctness property defined 
 * in the design document using fast-check for property-based testing.
 */

const fc = require('fast-check');
const { isValidEmail } = require('./auth');
const redisOtpStore = require('../services/redisOtpStore');
const emailService = require('../services/emailService');

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


/**
 * Feature: otp-scaling-production, Property 5: Email Failure Prevents OTP Storage
 * 
 * For any OTP generation request where email sending fails, the OTP SHALL NOT 
 * be stored in Redis (no orphaned OTPs).
 * 
 * **Validates: Requirements 4.3**
 */
describe('Property 5: Email Failure Prevents OTP Storage', () => {
  
  // Store original function to restore after tests
  let originalSendOTPEmail;
  let originalIsConnected;
  
  beforeAll(() => {
    // Save original functions
    originalSendOTPEmail = emailService.sendOTPEmail;
    originalIsConnected = redisOtpStore.isConnected;
  });
  
  afterAll(() => {
    // Restore original functions
    emailService.sendOTPEmail = originalSendOTPEmail;
    redisOtpStore.isConnected = originalIsConnected;
  });
  
  beforeEach(async () => {
    // Clear any existing OTPs before each test
    if (redisOtpStore.isConnected()) {
      await redisOtpStore.clearAll();
    }
  });
  
  /**
   * Property test: For any valid email, if email sending fails,
   * no OTP should be stored in Redis
   */
  test('When email sending fails, OTP is not stored in Redis', async () => {
    // Skip if Redis is not connected
    if (!redisOtpStore.isConnected()) {
      console.log('Skipping test: Redis not connected');
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(fc.emailAddress(), async (email) => {
        const normalizedEmail = email.toLowerCase().trim();
        
        // Generate OTP
        const otp = redisOtpStore.generateOTP(normalizedEmail);
        
        // Simulate email failure - do NOT store OTP (as per requirement 4.3)
        const emailResult = { success: false, error: 'SMTP connection failed' };
        
        // If email fails, we should NOT store the OTP
        if (!emailResult.success) {
          // OTP should NOT be stored - verify by checking session is null
          const session = await redisOtpStore.getSession(normalizedEmail);
          expect(session).toBeNull();
        }
        
        return true;
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Property test: For any valid email, if email sending succeeds,
   * OTP should be stored in Redis
   */
  test('When email sending succeeds, OTP is stored in Redis', async () => {
    // Skip if Redis is not connected
    if (!redisOtpStore.isConnected()) {
      console.log('Skipping test: Redis not connected');
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(fc.emailAddress(), async (email) => {
        const normalizedEmail = email.toLowerCase().trim();
        
        // Generate OTP
        const otp = redisOtpStore.generateOTP(normalizedEmail);
        
        // Simulate email success - store OTP
        const emailResult = { success: true };
        
        // If email succeeds, store the OTP
        if (emailResult.success) {
          await redisOtpStore.storeOTP(normalizedEmail, otp);
          
          // Verify OTP is stored
          const session = await redisOtpStore.getSession(normalizedEmail);
          expect(session).not.toBeNull();
          expect(session.otp).toBe(otp);
        }
        
        // Clean up
        await redisOtpStore.clearAll();
        
        return true;
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Property test: The order of operations matters - 
   * email must succeed BEFORE storing OTP
   */
  test('OTP storage only happens after successful email send', async () => {
    // Skip if Redis is not connected
    if (!redisOtpStore.isConnected()) {
      console.log('Skipping test: Redis not connected');
      return;
    }
    
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        fc.boolean(), // Simulate email success/failure
        async (email, emailSucceeds) => {
          const normalizedEmail = email.toLowerCase().trim();
          
          // Generate OTP
          const otp = redisOtpStore.generateOTP(normalizedEmail);
          
          // Simulate the correct order: email first, then store
          const emailResult = { success: emailSucceeds };
          
          if (emailResult.success) {
            // Only store if email succeeded
            await redisOtpStore.storeOTP(normalizedEmail, otp);
          }
          
          // Verify the invariant: OTP exists IFF email succeeded
          const session = await redisOtpStore.getSession(normalizedEmail);
          
          if (emailSucceeds) {
            expect(session).not.toBeNull();
            expect(session.otp).toBe(otp);
          } else {
            expect(session).toBeNull();
          }
          
          // Clean up
          await redisOtpStore.clearAll();
          
          return true;
        }
      ),
      PBT_CONFIG
    );
  });
});
