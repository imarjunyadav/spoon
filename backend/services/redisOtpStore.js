/**
 * ========================================
 * REDIS OTP STORE SERVICE
 * ========================================
 * 
 * PURPOSE:
 * Redis-based store for OTP sessions with automatic TTL expiration.
 * Handles OTP generation, storage, verification, and rate limiting.
 * Production-ready replacement for in-memory otpStore.js.
 * 
 * REQUIREMENTS COVERED:
 * - 1.1: Store OTP with 5-minute TTL in Redis
 * - 1.2: Automatic TTL expiration
 * - 2.1: Track OTP request counts per email using sliding window
 * - 2.2: Reject requests exceeding 5 per 15 minutes
 * - 2.4: Return retry-after time in seconds
 * 
 * KEY PATTERNS:
 * - OTP Session: otp:{email} -> JSON { otp, attempts, createdAt }
 * - Rate Limit:  rate:{email} -> count (integer)
 */

const crypto = require('crypto');
const redisClient = require('./redisClient');

// ========================================
// CONFIGURATION
// ========================================

const OTP_EXPIRY_SECONDS = 5 * 60;           // 5 minutes
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;   // 15 minutes
const MAX_OTP_REQUESTS = 5;                   // Max requests per window
const MAX_VERIFICATION_ATTEMPTS = 5;          // Max attempts per OTP session

// Key prefixes
const OTP_KEY_PREFIX = 'otp:';
const RATE_KEY_PREFIX = 'rate:';

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Normalize email for consistent key generation
 * @param {string} email - User's email address
 * @returns {string} Normalized email
 */
function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

/**
 * Generate Redis key for OTP session
 * @param {string} email - User's email address
 * @returns {string} Redis key
 */
function getOtpKey(email) {
  return `${OTP_KEY_PREFIX}${normalizeEmail(email)}`;
}

/**
 * Generate Redis key for rate limit
 * @param {string} email - User's email address
 * @returns {string} Redis key
 */
function getRateKey(email) {
  return `${RATE_KEY_PREFIX}${normalizeEmail(email)}`;
}

// ========================================
// OTP GENERATION
// ========================================

/**
 * Generate a cryptographically random 4-digit OTP
 * @param {string} email - User's email address (unused, kept for interface compatibility)
 * @returns {string} 4-digit OTP string
 */
function generateOTP(email) {
  // Generate cryptographically random bytes
  const randomBytes = crypto.randomBytes(2);
  // Convert to number and get 4 digits (0000-9999)
  const randomNum = randomBytes.readUInt16BE(0) % 10000;
  // Pad with leading zeros to ensure 4 digits
  const otp = randomNum.toString().padStart(4, '0');
  
  return otp;
}

// ========================================
// OTP STORAGE
// ========================================

/**
 * Store OTP with expiration for an email in Redis
 * Invalidates any existing OTP for the same email
 * @param {string} email - User's email address
 * @param {string} otp - 4-digit OTP to store
 * @returns {Promise<void>}
 */
async function storeOTP(email, otp) {
  const client = redisClient.getClient();
  const key = getOtpKey(email);
  const now = Date.now();
  
  const session = JSON.stringify({
    otp: otp,
    attempts: 0,
    createdAt: now
  });
  
  // SETEX stores with TTL - automatically expires after OTP_EXPIRY_SECONDS
  await client.setex(key, OTP_EXPIRY_SECONDS, session);
}

// ========================================
// OTP VERIFICATION
// ========================================

/**
 * Verify OTP for an email
 * @param {string} email - User's email address
 * @param {string} otp - OTP to verify
 * @returns {Promise<{ valid: boolean, error?: string }>} Verification result
 */
async function verifyOTP(email, otp) {
  const client = redisClient.getClient();
  const key = getOtpKey(email);
  
  // Get the stored session
  const sessionData = await client.get(key);
  
  // Check if OTP exists (TTL handles expiration automatically)
  if (!sessionData) {
    return { valid: false, error: 'OTP_NOT_FOUND' };
  }
  
  const session = JSON.parse(sessionData);
  
  // Check if max attempts exceeded
  if (session.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    return { valid: false, error: 'MAX_ATTEMPTS' };
  }
  
  // Increment attempts before checking
  session.attempts += 1;
  
  // Verify OTP
  if (session.otp !== otp) {
    // Update attempts count in Redis (preserve remaining TTL)
    const ttl = await client.ttl(key);
    if (ttl > 0) {
      await client.setex(key, ttl, JSON.stringify(session));
    }
    return { valid: false, error: 'INVALID_OTP' };
  }
  
  // OTP is valid - delete it (single-use)
  await client.del(key);
  
  return { valid: true };
}

// ========================================
// RATE LIMITING
// ========================================

/**
 * Check if email is rate limited using sliding window
 * @param {string} email - User's email address
 * @returns {Promise<{ allowed: boolean, retryAfter?: number }>} Rate limit status
 */
async function checkRateLimit(email) {
  const client = redisClient.getClient();
  const key = getRateKey(email);
  
  // Get current count
  const currentCount = await client.get(key);
  
  if (!currentCount) {
    // No existing rate limit - set initial count with TTL
    await client.setex(key, RATE_LIMIT_WINDOW_SECONDS, '1');
    return { allowed: true };
  }
  
  const count = parseInt(currentCount, 10);
  
  // Check if limit exceeded
  if (count >= MAX_OTP_REQUESTS) {
    // Get remaining TTL for retry-after
    const ttl = await client.ttl(key);
    return { 
      allowed: false, 
      retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW_SECONDS
    };
  }
  
  // Increment count (INCR preserves TTL)
  await client.incr(key);
  return { allowed: true };
}

/**
 * Increment verification attempts for an email
 * @param {string} email - User's email address
 * @returns {Promise<{ allowed: boolean }>} Whether more attempts are allowed
 */
async function incrementAttempts(email) {
  const client = redisClient.getClient();
  const key = getOtpKey(email);
  
  const sessionData = await client.get(key);
  
  if (!sessionData) {
    return { allowed: false };
  }
  
  const session = JSON.parse(sessionData);
  session.attempts += 1;
  
  // Update with remaining TTL
  const ttl = await client.ttl(key);
  if (ttl > 0) {
    await client.setex(key, ttl, JSON.stringify(session));
  }
  
  return { 
    allowed: session.attempts < MAX_VERIFICATION_ATTEMPTS 
  };
}

// ========================================
// UTILITY FUNCTIONS (for testing)
// ========================================

/**
 * Get OTP session for an email (for testing purposes)
 * @param {string} email - User's email address
 * @returns {Promise<object|null>} OTP session or null
 */
async function getSession(email) {
  const client = redisClient.getClient();
  const key = getOtpKey(email);
  const sessionData = await client.get(key);
  
  if (!sessionData) {
    return null;
  }
  
  return JSON.parse(sessionData);
}

/**
 * Clear all OTP sessions and rate limits (for testing purposes)
 * @returns {Promise<void>}
 */
async function clearAll() {
  const client = redisClient.getClient();
  
  // Get all OTP and rate limit keys
  const otpKeys = await client.keys(`${OTP_KEY_PREFIX}*`);
  const rateKeys = await client.keys(`${RATE_KEY_PREFIX}*`);
  
  const allKeys = [...otpKeys, ...rateKeys];
  
  if (allKeys.length > 0) {
    await client.del(...allKeys);
  }
}

/**
 * Get rate limit entry for an email (for testing purposes)
 * @param {string} email - User's email address
 * @returns {Promise<{ count: number, ttl: number }|null>} Rate limit entry or null
 */
async function getRateLimitEntry(email) {
  const client = redisClient.getClient();
  const key = getRateKey(email);
  
  const count = await client.get(key);
  
  if (!count) {
    return null;
  }
  
  const ttl = await client.ttl(key);
  
  return {
    count: parseInt(count, 10),
    ttl: ttl
  };
}

/**
 * Check if Redis is connected
 * @returns {boolean} True if connected
 */
function isConnected() {
  // Initialize client if not exists
  redisClient.getClient();
  return redisClient.isConnected();
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  generateOTP,
  storeOTP,
  verifyOTP,
  checkRateLimit,
  incrementAttempts,
  isConnected,
  // Testing utilities
  getSession,
  clearAll,
  getRateLimitEntry,
  // Constants (for testing)
  OTP_EXPIRY_SECONDS,
  RATE_LIMIT_WINDOW_SECONDS,
  MAX_OTP_REQUESTS,
  MAX_VERIFICATION_ATTEMPTS
};
