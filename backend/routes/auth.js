/**
 * ========================================
 * SPOON - AUTH API ROUTES
 * ========================================
 * 
 * PURPOSE:
 * Handles OTP-based email authentication
 * 
 * ENDPOINTS:
 * - POST /api/auth/send-otp - Generate and send OTP to email
 * - POST /api/auth/verify-otp - Verify OTP and authenticate user
 * 
 * REQUIREMENTS COVERED:
 * - 3.1: Validate OTP against stored value
 * - 3.2: Return success on valid OTP
 * - 3.3: Return invalid OTP error
 * - 3.4: Return expiration error
 * - 4.2: Return rate limit error with retry time
 * - 5.1: Validate email format
 * - 5.2: Return validation error for invalid email
 */

const express = require('express');
const router = express.Router();
const otpStore = require('../services/otpStore');
const emailService = require('../services/emailService');

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

    // Check rate limit (Requirement 4.1, 4.2)
    const rateLimitResult = otpStore.checkRateLimit(normalizedEmail);
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

    // Generate and store OTP (Requirement 1.1, 1.3, 1.4)
    const otp = otpStore.generateOTP(normalizedEmail);
    otpStore.storeOTP(normalizedEmail, otp);

    // Send OTP email (Requirement 2.1, 2.2, 2.3, 2.4)
    const emailResult = await emailService.sendOTPEmail(normalizedEmail, otp);

    if (!emailResult.success) {
      // Requirement 2.5: Handle email delivery failure
      console.error(`❌ Failed to send OTP email to ${normalizedEmail}:`, emailResult.error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'EMAIL_SEND_FAILED',
          message: 'Failed to send verification email. Please try again.'
        }
      });
    }

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

    // Verify OTP (Requirement 3.1, 3.2, 3.3, 3.4, 3.5, 4.3)
    const verifyResult = otpStore.verifyOTP(normalizedEmail, otp);

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
    // For MVP, check localStorage on frontend for existing user
    // In production, this would check Supabase users table
    console.log(`✅ OTP verified for ${normalizedEmail}`);

    res.json({
      success: true,
      isNewUser: true, // Frontend will determine based on localStorage
      email: normalizedEmail
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

// Export for testing
module.exports = router;
module.exports.isValidEmail = isValidEmail;
