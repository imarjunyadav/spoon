/**
 * ========================================
 * OTP STORE SERVICE
 * ========================================
 * 
 * PURPOSE:
 * In-memory store for OTP sessions with automatic cleanup.
 * Handles OTP generation, storage, verification, and rate limiting.
 * 
 * REQUIREMENTS COVERED:
 * - 1.1: Generate random 4-digit OTP
 * - 1.2: Cryptographically random OTP
 * - 1.3: Store OTP with 5-minute expiration
 * - 1.4: Invalidate previous OTP on new request
 * - 3.1: Validate OTP against stored value
 * - 3.5: Invalidate OTP after successful verification
 * - 4.1: Rate limit 5 requests per 15 minutes
 * - 4.3: Limit verification attempts to 5 per session
 */

const crypto = require('crypto');

// ========================================
// CONFIGURATION
// ========================================

const OTP_EXPIRY_MS = 5 * 60 * 1000;        // 5 minutes
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_OTP_REQUESTS = 5;                  // Max requests per window
const MAX_VERIFICATION_ATTEMPTS = 5;         // Max attempts per OTP session
const CLEANUP_INTERVAL_MS = 60 * 1000;       // Cleanup every 1 minute

// ========================================
// IN-MEMORY STORES
// ========================================

/**
 * OTP Sessions Map
 * Key: email (string)
 * Value: { otp, expiresAt, attempts, createdAt }
 */
const otpSessions = new Map();

/**
 * Rate Limit Map
 * Key: email (string)
 * Value: { count, windowStart }
 */
const rateLimits = new Map();

// ========================================
// OTP GENERATION
// ========================================

/**
 * Generate a cryptographically random 4-digit OTP
 * @param {string} email - User's email address
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
 * Store OTP with expiration for an email
 * Invalidates any existing OTP for the same email
 * @param {string} email - User's email address
 * @param {string} otp - 4-digit OTP to store
 */
function storeOTP(email, otp) {
  const normalizedEmail = email.toLowerCase().trim();
  const now = Date.now();
  
  // Store new OTP session (replaces any existing one - Requirement 1.4)
  otpSessions.set(normalizedEmail, {
    otp: otp,
    email: normalizedEmail,
    expiresAt: now + OTP_EXPIRY_MS,
    attempts: 0,
    createdAt: now
  });
}

// ========================================
// OTP VERIFICATION
// ========================================

/**
 * Verify OTP for an email
 * @param {string} email - User's email address
 * @param {string} otp - OTP to verify
 * @returns {{ valid: boolean, error?: string }} Verification result
 */
function verifyOTP(email, otp) {
  const normalizedEmail = email.toLowerCase().trim();
  const session = otpSessions.get(normalizedEmail);
  const now = Date.now();
  
  // Check if OTP exists
  if (!session) {
    return { valid: false, error: 'OTP_NOT_FOUND' };
  }
  
  // Check if OTP has expired
  if (now > session.expiresAt) {
    otpSessions.delete(normalizedEmail);
    return { valid: false, error: 'OTP_EXPIRED' };
  }
  
  // Check if max attempts exceeded (Requirement 4.3)
  if (session.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    return { valid: false, error: 'MAX_ATTEMPTS' };
  }
  
  // Increment attempts before checking
  session.attempts += 1;
  
  // Verify OTP
  if (session.otp !== otp) {
    return { valid: false, error: 'INVALID_OTP' };
  }
  
  // OTP is valid - invalidate it (single-use, Requirement 3.5)
  otpSessions.delete(normalizedEmail);
  
  return { valid: true };
}

// ========================================
// RATE LIMITING
// ========================================

/**
 * Check if email is rate limited
 * @param {string} email - User's email address
 * @returns {{ allowed: boolean, retryAfter?: number }} Rate limit status
 */
function checkRateLimit(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const now = Date.now();
  const entry = rateLimits.get(normalizedEmail);
  
  // No existing rate limit entry
  if (!entry) {
    rateLimits.set(normalizedEmail, {
      count: 1,
      windowStart: now
    });
    return { allowed: true };
  }
  
  // Check if window has expired
  if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    // Reset window
    rateLimits.set(normalizedEmail, {
      count: 1,
      windowStart: now
    });
    return { allowed: true };
  }
  
  // Check if limit exceeded
  if (entry.count >= MAX_OTP_REQUESTS) {
    const retryAfter = entry.windowStart + RATE_LIMIT_WINDOW_MS - now;
    return { 
      allowed: false, 
      retryAfter: Math.ceil(retryAfter / 1000) // Return seconds
    };
  }
  
  // Increment count
  entry.count += 1;
  return { allowed: true };
}

/**
 * Increment verification attempts for an email
 * @param {string} email - User's email address
 * @returns {{ allowed: boolean }} Whether more attempts are allowed
 */
function incrementAttempts(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const session = otpSessions.get(normalizedEmail);
  
  if (!session) {
    return { allowed: false };
  }
  
  session.attempts += 1;
  
  return { 
    allowed: session.attempts < MAX_VERIFICATION_ATTEMPTS 
  };
}

// ========================================
// CLEANUP
// ========================================

/**
 * Clean up expired OTP sessions and rate limit entries
 */
function cleanupExpired() {
  const now = Date.now();
  
  // Clean expired OTP sessions
  for (const [email, session] of otpSessions.entries()) {
    if (now > session.expiresAt) {
      otpSessions.delete(email);
    }
  }
  
  // Clean expired rate limit windows
  for (const [email, entry] of rateLimits.entries()) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimits.delete(email);
    }
  }
}

// Start automatic cleanup interval
const cleanupInterval = setInterval(cleanupExpired, CLEANUP_INTERVAL_MS);

// Prevent cleanup interval from keeping Node.js process alive
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

// ========================================
// UTILITY FUNCTIONS (for testing)
// ========================================

/**
 * Get OTP session for an email (for testing purposes)
 * @param {string} email - User's email address
 * @returns {object|undefined} OTP session or undefined
 */
function getSession(email) {
  const normalizedEmail = email.toLowerCase().trim();
  return otpSessions.get(normalizedEmail);
}

/**
 * Clear all sessions and rate limits (for testing purposes)
 */
function clearAll() {
  otpSessions.clear();
  rateLimits.clear();
}

/**
 * Get rate limit entry for an email (for testing purposes)
 * @param {string} email - User's email address
 * @returns {object|undefined} Rate limit entry or undefined
 */
function getRateLimitEntry(email) {
  const normalizedEmail = email.toLowerCase().trim();
  return rateLimits.get(normalizedEmail);
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
  cleanupExpired,
  // Testing utilities
  getSession,
  clearAll,
  getRateLimitEntry,
  // Constants (for testing)
  OTP_EXPIRY_MS,
  RATE_LIMIT_WINDOW_MS,
  MAX_OTP_REQUESTS,
  MAX_VERIFICATION_ATTEMPTS
};
