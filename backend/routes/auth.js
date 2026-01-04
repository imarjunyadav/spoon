/**
 * ========================================
 * SPOON - AUTH API ROUTES
 * ========================================
 * 
 * PURPOSE:
 * Handles OTP-based email authentication with Redis storage
 * 
 * ENDPOINTS:
 * - POST /api/auth/send-otp - Generate and send OTP to email
 * - POST /api/auth/verify-otp - Verify OTP and authenticate user
 * - POST /api/auth/signup - Create new user in Supabase
 * 
 * REQUIREMENTS COVERED:
 * - 1.5: Return service unavailable error when Redis connection fails
 * - 3.1: Validate OTP against stored value
 * - 3.2: Return success on valid OTP
 * - 3.3: Return invalid OTP error
 * - 3.4: Return expiration error
 * - 4.1: Return service unavailable error when Redis is unavailable
 * - 4.2: Return rate limit error with retry time
 * - 5.1: Validate email format
 * - 5.2: Return validation error for invalid email
 * - 6.1: Create user in Supabase on signup
 * - 6.2: Check if user exists in Supabase after OTP verification
 */

const express = require('express');
const router = express.Router();
const redisOtpStore = require('../services/redisOtpStore');
const emailService = require('../services/emailService');
const userService = require('../services/userService');

// ========================================
// EMAIL VALIDATION
// ========================================

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // Basic email regex: must have @ and valid domain
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

// ========================================
// ENDPOINT: Send OTP
// ========================================

/**
 * ENDPOINT: Send OTP to email
 * 
 * METHOD: POST
 * PATH: /api/auth/send-otp
 * 
 * REQUEST BODY:
 * { "email": "user@example.com" }
 * 
 * RESPONSES:
 * - 200: { success: true, message: "OTP sent successfully" }
 * - 400: { success: false, error: { code: "INVALID_EMAIL", message: "..." } }
 * - 429: { success: false, error: { code: "RATE_LIMITED", message: "...", retryAfter: number } }
 * - 500: { success: false, error: { code: "EMAIL_SEND_FAILED", message: "..." } }
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email format (Requirement 5.1, 5.2)
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EMAIL',
          message: 'Please enter a valid email address'
        }
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check Redis availability (Requirement 1.5, 4.1)
    if (!redisOtpStore.isConnected()) {
      console.error('❌ Redis unavailable for send-otp');
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable. Please try again in a few moments.'
        }
      });
    }

    // Check rate limit (Requirement 4.1, 4.2)
    const rateLimitResult = await redisOtpStore.checkRateLimit(normalizedEmail);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Please try again in ${rateLimitResult.retryAfter} seconds`,
          retryAfter: rateLimitResult.retryAfter
        }
      });
    }

    // Generate OTP (Requirement 1.1, 1.3, 1.4)
    const otp = redisOtpStore.generateOTP(normalizedEmail);

    // Send OTP email FIRST (Requirement 4.3 - don't store if email fails)
    const emailResult = await emailService.sendOTPEmail(normalizedEmail, otp);

    if (!emailResult.success) {
      // Requirement 4.3: Email failed - do NOT store OTP
      console.error(`❌ Failed to send OTP email to ${normalizedEmail}:`, emailResult.error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'EMAIL_SEND_FAILED',
          message: 'Failed to send verification email. Please try again.'
        }
      });
    }

    // Store OTP in Redis only after email sent successfully
    await redisOtpStore.storeOTP(normalizedEmail, otp);

    console.log(`✅ OTP sent to ${normalizedEmail}`);
    
    res.json({
      success: true,
      message: 'OTP sent successfully'
    });

  } catch (error) {
    console.error('💥 Send OTP error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An unexpected error occurred. Please try again.'
      }
    });
  }
});

// ========================================
// ENDPOINT: Verify OTP
// ========================================

/**
 * ENDPOINT: Verify OTP
 * 
 * METHOD: POST
 * PATH: /api/auth/verify-otp
 * 
 * REQUEST BODY:
 * { "email": "user@example.com", "otp": "1234" }
 * 
 * RESPONSES:
 * - 200: { success: true, isNewUser: boolean, user?: object }
 * - 400: { success: false, error: { code: "INVALID_EMAIL|INVALID_OTP|OTP_EXPIRED|OTP_NOT_FOUND|MAX_ATTEMPTS", message: "..." } }
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Validate email format (Requirement 5.1, 5.2)
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EMAIL',
          message: 'Please enter a valid email address'
        }
      });
    }

    // Validate OTP format
    if (!otp || typeof otp !== 'string' || !/^\d{4}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_OTP',
          message: 'Please enter a valid 4-digit OTP'
        }
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check Redis availability (Requirement 1.5, 4.1)
    if (!redisOtpStore.isConnected()) {
      console.error('❌ Redis unavailable for verify-otp');
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service temporarily unavailable. Please try again in a few moments.'
        }
      });
    }

    // Verify OTP (Requirement 3.1, 3.2, 3.3, 3.4, 3.5, 4.3)
    const verifyResult = await redisOtpStore.verifyOTP(normalizedEmail, otp);

    if (!verifyResult.valid) {
      const errorMessages = {
        'OTP_NOT_FOUND': 'No OTP found for this email. Please request a new one.',
        'OTP_EXPIRED': 'OTP has expired. Please request a new one.',
        'INVALID_OTP': 'Invalid OTP. Please check and try again.',
        'MAX_ATTEMPTS': 'Too many failed attempts. Please request a new OTP.'
      };

      return res.status(400).json({
        success: false,
        error: {
          code: verifyResult.error,
          message: errorMessages[verifyResult.error] || 'Verification failed'
        }
      });
    }

    // OTP verified successfully
    console.log(`✅ OTP verified for ${normalizedEmail}`);

    // Check if user exists in Supabase (Requirement 3.2, 6.2)
    const userResult = await userService.getUserByEmail(normalizedEmail);
    
    if (userResult.error && userResult.error !== 'USER_NOT_FOUND') {
      // Database error but OTP was valid - still allow login
      console.error(`⚠️ Error checking user in Supabase: ${userResult.error}`);
    }

    const isNewUser = !userResult.user;

    res.json({
      success: true,
      isNewUser: isNewUser,
      email: normalizedEmail,
      user: userResult.user || null
    });

  } catch (error) {
    console.error('💥 Verify OTP error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An unexpected error occurred. Please try again.'
      }
    });
  }
});

// ========================================
// ENDPOINT: Signup
// ========================================

/**
 * ENDPOINT: Create new user
 * 
 * METHOD: POST
 * PATH: /api/auth/signup
 * 
 * REQUEST BODY:
 * { "email": "user@example.com", "name": "John Doe" }
 * 
 * RESPONSES:
 * - 201: { success: true, user: object }
 * - 400: { success: false, error: { code: "INVALID_EMAIL|INVALID_NAME", message: "..." } }
 * - 409: { success: false, error: { code: "USER_EXISTS", message: "..." } }
 * - 503: { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "..." } }
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, name } = req.body;

    // Validate email format (Requirement 5.1, 5.2)
    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EMAIL',
          message: 'Please enter a valid email address'
        }
      });
    }

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_NAME',
          message: 'Please enter a valid name'
        }
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Create user in Supabase (Requirement 3.1, 6.1)
    const result = await userService.createUser(normalizedEmail, name.trim());

    if (result.error) {
      const errorResponses = {
        'USER_EXISTS': { status: 409, message: 'An account with this email already exists' },
        'INVALID_EMAIL': { status: 400, message: 'Please enter a valid email address' },
        'INVALID_NAME': { status: 400, message: 'Please enter a valid name' },
        'DATABASE_ERROR': { status: 500, message: 'Failed to create account. Please try again.' },
        'SERVICE_UNAVAILABLE': { status: 503, message: 'Service temporarily unavailable. Please try again in a few moments.' }
      };

      const errorResponse = errorResponses[result.error] || { status: 500, message: 'An unexpected error occurred' };

      return res.status(errorResponse.status).json({
        success: false,
        error: {
          code: result.error,
          message: errorResponse.message
        }
      });
    }

    console.log(`✅ User created: ${normalizedEmail}`);

    res.status(201).json({
      success: true,
      user: result.user
    });

  } catch (error) {
    console.error('💥 Signup error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'An unexpected error occurred. Please try again.'
      }
    });
  }
});

// Export for testing
module.exports = router;
module.exports.isValidEmail = isValidEmail;
