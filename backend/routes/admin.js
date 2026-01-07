/**
 * ========================================
 * SPOON - ADMIN API ROUTES
 * ========================================
 * 
 * PURPOSE:
 * Handles admin role verification for the Spoon application.
 * Validates JWT tokens and checks admin status in database.
 * 
 * ENDPOINTS:
 * - GET /api/admin/verify - Verify if current user has admin privileges
 * 
 * REQUIREMENTS COVERED:
 * - 2.1: Expose GET /api/admin/verify endpoint
 * - 2.2: Extract user's email from token (not from request params)
 * - 2.3: NOT accept email as request parameter
 * - 2.4: Return 401 for missing/invalid/expired tokens
 * - 2.5: Return { isAdmin: false } for non-admin users
 * - 2.6: Return { isAdmin: true } for admin users
 */

const express = require('express');
const router = express.Router();
const adminService = require('../services/adminService');

// ========================================
// ENDPOINT: Verify Admin Status
// ========================================

/**
 * ENDPOINT: Verify admin status
 * 
 * METHOD: GET
 * PATH: /api/admin/verify
 * 
 * HEADERS:
 * Authorization: Bearer <supabase_access_token>
 * 
 * RESPONSES:
 * - 200: { isAdmin: boolean }
 * - 401: { error: 'UNAUTHORIZED', message: '...' }
 * - 401: { error: 'INVALID_TOKEN', message: '...' }
 * - 500: { error: 'DATABASE_ERROR', message: '...' }
 * 
 * NOTE: Email query params are ignored for security (email extracted from token only)
 */
router.get('/verify', async (req, res) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    // Check for missing Authorization header (Requirement 2.4)
    if (!authHeader) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'No authorization token provided'
      });
    }
    
    // Check for Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid authorization token format'
      });
    }
    
    // Extract token (remove "Bearer " prefix)
    const token = authHeader.slice(7);
    
    // Validate token and extract user email (Requirement 2.2, 5.2, 5.4)
    const tokenResult = await adminService.validateToken(token);
    
    if (tokenResult.error) {
      // Handle token validation errors (Requirement 2.4, 5.3)
      if (tokenResult.error === 'NO_TOKEN') {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'No authorization token provided'
        });
      }
      
      if (tokenResult.error === 'INVALID_TOKEN') {
        return res.status(401).json({
          error: 'INVALID_TOKEN',
          message: 'Token expired or invalid'
        });
      }
      
      if (tokenResult.error === 'SERVICE_UNAVAILABLE') {
        return res.status(500).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Authentication service unavailable'
        });
      }
      
      // Unknown error
      return res.status(500).json({
        error: 'SERVER_ERROR',
        message: 'An unexpected error occurred'
      });
    }
    
    // Get email from validated token (Requirement 2.2, 2.3)
    // NOTE: We intentionally ignore any email in query params or body
    const email = tokenResult.user.email;
    
    // Check admin status in database (Requirement 1.3, 2.5, 2.6)
    const adminResult = await adminService.isUserAdmin(email);
    
    if (adminResult.error) {
      // Handle database errors
      if (adminResult.error === 'DATABASE_ERROR') {
        return res.status(500).json({
          error: 'DATABASE_ERROR',
          message: 'Failed to verify admin status'
        });
      }
      
      if (adminResult.error === 'SERVICE_UNAVAILABLE') {
        return res.status(500).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Authentication service unavailable'
        });
      }
    }
    
    // Return admin status (Requirement 2.5, 2.6)
    return res.status(200).json({
      isAdmin: adminResult.isAdmin
    });
    
  } catch (error) {
    console.error('💥 Admin verify error:', error);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'An unexpected error occurred'
    });
  }
});

module.exports = router;
