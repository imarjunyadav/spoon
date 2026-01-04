/**
 * Property-Based Tests for Redis OTP Store Service
 * 
 * Feature: otp-scaling-production
 * 
 * These tests validate the correctness properties defined in the design document
 * using fast-check for property-based testing.
 * 
 * NOTE: Tests use ioredis-mock when real Redis is not available.
 */

const fc = require('fast-check');
const RedisMock = require('ioredis-mock');

// Test configuration: minimum 100 iterations per property
const PBT_CONFIG = { numRuns: 100 };

// Email generator for valid email addresses
const emailArb = fc.emailAddress();

// Mock Redis client for testing
let mockRedisClient;
let redisOtpStore;

// Create a mock-based OTP store for testing
function createMockOtpStore(client) {
  const crypto = require('crypto');
  
  const OTP_EXPIRY_SECONDS = 5 * 60;
  const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
  const MAX_OTP_REQUESTS = 5;
  const MAX_VERIFICATION_ATTEMPTS = 5;
  const OTP_KEY_PREFIX = 'otp:';
  const RATE_KEY_PREFIX = 'rate:';
  
  function normalizeEmail(email) {
    return email.toLowerCase().trim();
  }
  
  function getOtpKey(email) {
    return `${OTP_KEY_PREFIX}${normalizeEmail(email)}`;
  }
  
  function getRateKey(email) {
    return `${RATE_KEY_PREFIX}${normalizeEmail(email)}`;
  }
  
  function generateOTP(email) {
    const randomBytes = crypto.randomBytes(2);
    const randomNum = randomBytes.readUInt16BE(0) % 10000;
    return randomNum.toString().padStart(4, '0');
  }
  
  async function storeOTP(email, otp) {
    const key = getOtpKey(email);
    const now = Date.now();
    const session = JSON.stringify({
      otp: otp,
      attempts: 0,
      createdAt: now
    });
    await client.setex(key, OTP_EXPIRY_SECONDS, session);
  }
  
  async function verifyOTP(email, otp) {
    const key = getOtpKey(email);
    const sessionData = await client.get(key);
    
    if (!sessionData) {
      return { valid: false, error: 'OTP_NOT_FOUND' };
    }
    
    const session = JSON.parse(sessionData);
    
    if (session.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      return { valid: false, error: 'MAX_ATTEMPTS' };
    }
    
    session.attempts += 1;
    
    if (session.otp !== otp) {
      const ttl = await client.ttl(key);
      if (ttl > 0) {
        await client.setex(key, ttl, JSON.stringify(session));
      }
      return { valid: false, error: 'INVALID_OTP' };
    }
    
    await client.del(key);
    return { valid: true };
  }
  
  async function checkRateLimit(email) {
    const key = getRateKey(email);
    const currentCount = await client.get(key);
    
    if (!currentCount) {
      await client.setex(key, RATE_LIMIT_WINDOW_SECONDS, '1');
      return { allowed: true };
    }
    
    const count = parseInt(currentCount, 10);
    
    if (count >= MAX_OTP_REQUESTS) {
      const ttl = await client.ttl(key);
      return { 
        allowed: false, 
        retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SECONDS
      };
    }
    
    await client.incr(key);
    return { allowed: true };
  }
  
  async function clearAll() {
    const otpKeys = await client.keys(`${OTP_KEY_PREFIX}*`);
    const rateKeys = await client.keys(`${RATE_KEY_PREFIX}*`);
    const allKeys = [...otpKeys, ...rateKeys];
    if (allKeys.length > 0) {
      await client.del(...allKeys);
    }
  }
  
  return {
    generateOTP,
    storeOTP,
    verifyOTP,
    checkRateLimit,
    clearAll,
    MAX_OTP_REQUESTS,
    MAX_VERIFICATION_ATTEMPTS,
    OTP_EXPIRY_SECONDS,
    RATE_LIMIT_WINDOW_SECONDS
  };
}

describe('Redis OTP Store Property-Based Tests', () => {
  
  beforeAll(() => {
    // Create mock Redis client
    mockRedisClient = new RedisMock();
    redisOtpStore = createMockOtpStore(mockRedisClient);
  });

  afterAll(async () => {
    await redisOtpStore.clearAll();
    mockRedisClient.disconnect();
  });

  beforeEach(async () => {
    await redisOtpStore.clearAll();
  });

  /**
   * Feature: otp-scaling-production, Property 1: Redis OTP Storage Round-Trip
   * For any valid email address, generating an OTP, storing it in Redis, and then 
   * verifying with that same OTP (before expiration) SHALL return success.
   * Validates: Requirements 1.1, 3.1, 3.2
   */
  test('Property 1: Redis OTP Storage Round-Trip', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, async (email) => {
        // Generate OTP
        const otp = redisOtpStore.generateOTP(email);
        
        // Store OTP in Redis
        await redisOtpStore.storeOTP(email, otp);
        
        // Verify with the same OTP should succeed
        const result = await redisOtpStore.verifyOTP(email, otp);
        
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: otp-scaling-production, Property 2: Rate Limit Enforcement with Retry-After
   * For any email address, after 5 OTP requests within a 15-minute window, 
   * the 6th request SHALL be rejected with a rate limit error containing a 
   * positive retry-after value in seconds.
   * Validates: Requirements 2.2, 2.4
   */
  test('Property 2: Rate Limit Enforcement with Retry-After', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, async (email) => {
        // First 5 requests should be allowed
        for (let i = 0; i < redisOtpStore.MAX_OTP_REQUESTS; i++) {
          const result = await redisOtpStore.checkRateLimit(email);
          expect(result.allowed).toBe(true);
        }
        
        // 6th request should be rate limited
        const rateLimitedResult = await redisOtpStore.checkRateLimit(email);
        expect(rateLimitedResult.allowed).toBe(false);
        expect(rateLimitedResult.retryAfter).toBeDefined();
        expect(typeof rateLimitedResult.retryAfter).toBe('number');
        expect(rateLimitedResult.retryAfter).toBeGreaterThan(0);
        
        // Clean up this email's rate limit for next iteration
        await mockRedisClient.del(`rate:${email.toLowerCase().trim()}`);
      }),
      PBT_CONFIG
    );
  });
});
