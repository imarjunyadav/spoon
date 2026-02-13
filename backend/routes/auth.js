/**
 * Spoon - Auth API Routes
 * 
 * Handles OTP-based email authentication with Redis storage.
 * 
 * Endpoints:
 * - POST /api/auth/send-otp - Generate and send OTP to email
 * - POST /api/auth/verify-otp - Verify OTP and authenticate user
 * - POST /api/auth/signup - Create new user in Supabase
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const redisOtpStore = require('../services/redisOtpStore');
const emailService = require('../services/emailService');
const userService = require('../services/userService');
const adminService = require('../services/adminService');

// ========================================
// EMAIL VALIDATION
// ========================================

/**
 * Validate email format.
 * 
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
 * Send OTP to email.
 * 
 * Method: POST
 * Path: /api/auth/send-otp
 * Body: { "email": "user@example.com" }
 * 
 * @returns {object} Success status
 */
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email format
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

    // Check Redis availability
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

    // Check rate limit
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

    // Generate OTP
    const otp = redisOtpStore.generateOTP(normalizedEmail);

    // Send OTP email FIRST (Authentication 4.3 - don't store if email fails)
    const emailResult = await emailService.sendOTPEmail(normalizedEmail, otp);

    if (!emailResult.success) {
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
 * Verify OTP and authenticate user.
 * 
 * Method: POST
 * Path: /api/auth/verify-otp
 * Body: { "email": "user@example.com", "otp": "1234" }
 * 
 * @returns {object} { success: true, isNewUser: boolean, user?: object }
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

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

    // Check Redis availability
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

    // Verify OTP
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

    // Check if user exists in Supabase
    const userResult = await userService.getUserByEmail(normalizedEmail);

    if (userResult.error && userResult.error !== 'USER_NOT_FOUND') {
      // Database error but OTP was valid - still allow login
      console.error(`⚠️ Error checking user in Supabase: ${userResult.error}`);
    }

    const isNewUser = !userResult.user;

    // Generate session token
    const sessionToken = crypto.randomUUID();

    // Update active session in database
    const updateResult = await userService.updateSession(normalizedEmail, sessionToken);

    if (!updateResult.success && updateResult.error === 'USER_NOT_FOUND') {
      // For new users, updateSession fails because they're not in DB yet.
      // This is expected — /signup will set the session token.
      // For existing users, this is an error.
      if (!isNewUser) {
        console.error(`❌ Failed to update session for existing user ${normalizedEmail}`);
      }
    }

    res.json({
      success: true,
      isNewUser: isNewUser,
      email: normalizedEmail,
      user: userResult.user || null,
      sessionToken: sessionToken
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
 * Create new user.
 * 
 * Method: POST
 * Path: /api/auth/signup
 * Body: { "email": "user@example.com", "name": "John Doe" }
 * 
 * @returns {object} { success: true, user: object }
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EMAIL',
          message: 'Please enter a valid email address'
        }
      });
    }

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

    // Generate session token
    const sessionToken = crypto.randomUUID();

    // Create user in Supabase with session token
    const result = await userService.createUser(normalizedEmail, name.trim(), sessionToken);

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
      user: result.user,
      sessionToken: sessionToken
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

// ========================================
// ENDPOINT: Validate Session (Heartbeat/Check)
// ========================================

/**
 * Validate session token.
 * 
 * Method: POST
 * Path: /api/auth/validate-session
 * Body: { "email": "...", "sessionToken": "...", "type": "app"|"admin" }
 * 
 * @returns {object} { valid: boolean }
 */
router.post('/validate-session', async (req, res) => {
  try {
    const { email, sessionToken, type = 'app' } = req.body;

    if (!email || !sessionToken) {
      return res.status(400).json({ valid: false, error: 'MISSING_FIELDS' });
    }

    const { valid, error } = await userService.validateSession(email, sessionToken, type);

    if (error) {
      console.error('Validate session error:', error);
      return res.status(500).json({ valid: false, error });
    }

    res.json({ valid });

  } catch (error) {
    console.error('Validate session exception:', error);
    res.status(500).json({ valid: false, error: 'SERVER_ERROR' });
  }
});

// ========================================
// ENDPOINT: Sync Session (Admin Bridge)
// ========================================

/**
 * Sync Supabase Auth with Admin Session.
 * Implements "Sticky Session" - returns existing token if valid.
 * 
 * Method: POST
 * Path: /api/auth/sync-session
 * Headers: Authorization: Bearer <supabase_jwt>
 * Body: { "existingToken": "uuid" } (Optional)
 * 
 * @returns {object} { sessionToken: "uuid" }
 */
router.post('/sync-session', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const { existingToken } = req.body; // Client sends current local token if any

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    const token = authHeader.slice(7);
    const tokenResult = await adminService.validateToken(token);

    if (tokenResult.error) {
      return res.status(401).json({ error: tokenResult.error });
    }

    const email = tokenResult.user.email;
    const SESSION_TYPE = 'admin'; // sync-session is exclusively for Admin

    // --- STICKY SESSION LOGIC ---
    // If client provided a token, check if it's still valid in DB
    if (existingToken) {
      const { valid } = await userService.validateSession(email, existingToken, SESSION_TYPE);
      if (valid) {
        // Resume existing session
        console.log(`♻️ Resuming sticky admin session for ${email}`);
        return res.json({
          success: true,
          email,
          sessionToken: existingToken,
          restored: true
        });
      }
    }

    // --- NEW SESSION LOGIC ---
    // Generate new session token
    const sessionToken = crypto.randomUUID();

    // Update active session in database
    const updateResult = await userService.updateSession(email, sessionToken, SESSION_TYPE);

    if (!updateResult.success) {
      if (updateResult.error === 'USER_NOT_FOUND') {
        // Auto-create user record if missing (Safety net for Admins)
        console.warn(`⚠️ User record missing for ${email}. Auto-creating...`);
        // Note: createUser default slot is 'active_session_token' (app). 
        // We need to insert then update, or update createUser to support cols.
        // For simplicity, create then update.
        await userService.createUser(email, 'Admin User');
        await userService.updateSession(email, sessionToken, SESSION_TYPE);
      } else {
        throw new Error(`Failed to update session: ${updateResult.error}`);
      }
    }

    console.log(`✅ New Admin session synced for ${email}`);

    res.json({
      success: true,
      email,
      sessionToken,
      restored: false
    });

  } catch (error) {
    console.error('Sync session exception:', error);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

module.exports = router;
module.exports.isValidEmail = isValidEmail;
