/**
 * Spoon - Admin API Routes
 * 
 * Handles admin role verification and stock management.
 * Validates JWT tokens and checks admin status in database.
 * 
 * Endpoints:
 * - GET /api/admin/verify - Verify if current user has admin privileges
 * - PATCH /api/admin/stock/:itemId - Update menu item availability
 */

const express = require('express');
const router = express.Router();
const adminService = require('../services/adminService');
const { requireAdminSession } = require('../middleware/sessionAuth');

// ========================================
// ENDPOINT: Verify Admin Status
// ========================================

/**
 * Verify admin status for the current user.
 * 
 * Method: GET
 * Path: /api/admin/verify
 * Headers: Authorization: Bearer <token>
 * 
 * @returns {object} { isAdmin: boolean }
 */
router.get('/verify', async (req, res) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'No authorization token provided'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid authorization token format'
      });
    }

    const token = authHeader.slice(7);

    // Validate token and extract user email
    const tokenResult = await adminService.validateToken(token);

    if (tokenResult.error) {
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

      return res.status(500).json({
        error: 'SERVER_ERROR',
        message: 'An unexpected error occurred'
      });
    }

    // Get email from validated token
    // Note: We intentionally ignore any email in query params or body
    const email = tokenResult.user.email;

    // Check admin status in database
    const adminResult = await adminService.isUserAdmin(email);

    if (adminResult.error) {
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

// ========================================
// ENDPOINT: Update Menu Item Stock
// ========================================

/**
 * Update menu item availability.
 * 
 * Method: PATCH
 * Path: /api/admin/stock/:itemId
 * Headers: Authorization: Bearer <token>
 * Headers: x-admin-session-token: <session_token>
 * Body: { "is_available": boolean }
 * 
 * @returns {object} Updated item status
 */
router.patch('/stock/:itemId', requireAdminSession, async (req, res) => {
  const { itemId } = req.params;
  // User info is attached by middleware
  const email = req.user.email;

  try {

    // Admin check is now handled by requireAdminSession middleware
    // but strict check via isUserAdminService inside middleware guarantees it.
    // Double check handled by middleware.

    const { is_available } = req.body;

    if (is_available === undefined) {
      console.log(`[${new Date().toISOString()}] Stock update FAILED - Missing is_available - User: ${email} - Item: ${itemId}`);
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'is_available field is required'
      });
    }

    if (typeof is_available !== 'boolean') {
      console.log(`[${new Date().toISOString()}] Stock update FAILED - is_available not boolean - User: ${email} - Item: ${itemId}`);
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'is_available must be a boolean'
      });
    }

    const updateResult = await adminService.updateMenuItemStock(itemId, is_available);

    if (!updateResult.success) {
      if (updateResult.error === 'NOT_FOUND') {
        console.log(`[${new Date().toISOString()}] Stock update FAILED - Item not found - User: ${email} - Item: ${itemId}`);
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Menu item not found'
        });
      }

      console.log(`[${new Date().toISOString()}] Stock update FAILED - Database error - User: ${email} - Item: ${itemId}`);
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: 'Failed to update stock'
      });
    }

    // Success - log audit entry
    console.log(`[${new Date().toISOString()}] Stock update SUCCESS - User: ${email} - Item: ${itemId} - is_available: ${is_available}`);

    return res.status(200).json({
      success: true,
      itemId,
      is_available
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Stock update ERROR - Item: ${itemId}`, error);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: 'An unexpected error occurred'
    });
  }
});

module.exports = router;
