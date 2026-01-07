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
 * - PATCH /api/admin/stock/:itemId - Update menu item availability
 * 
 * REQUIREMENTS COVERED:
 * - 2.1: Expose GET /api/admin/verify endpoint
 * - 2.2: Extract user's email from token (not from request params)
 * - 2.3: NOT accept email as request parameter
 * - 2.4: Return 401 for missing/invalid/expired tokens
 * - 2.5: Return { isAdmin: false } for non-admin users
 * - 2.6: Return { isAdmin: true } for admin users
 * 
 * STOCK MANAGEMENT REQUIREMENTS:
 * - 1.1: Expose PATCH /api/admin/stock/:itemId endpoint
 * - 1.2-1.4: Require valid Bearer token
 * - 1.5: Return 403 for non-admin users
 * - 1.6-1.7: Validate is_available is boolean
 * - 2.1-2.5: Update menu item availability
 * - 4.1-4.3: Audit logging
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

// ========================================
// ENDPOINT: Update Menu Item Stock
// ========================================

/**
 * ENDPOINT: Update menu item availability
 * 
 * METHOD: PATCH
 * PATH: /api/admin/stock/:itemId
 * 
 * HEADERS:
 * Authorization: Bearer <supabase_access_token>
 * Content-Type: application/json
 * 
 * BODY:
 * { "is_available": boolean }
 * 
 * RESPONSES:
 * - 200: { success: true, itemId: string, is_available: boolean }
 * - 400: { error: 'INVALID_REQUEST', message: '...' }
 * - 401: { error: 'UNAUTHORIZED', message: '...' }
 * - 401: { error: 'INVALID_TOKEN', message: '...' }
 * - 403: { error: 'FORBIDDEN', message: '...' }
 * - 404: { error: 'NOT_FOUND', message: '...' }
 * - 500: { error: 'DATABASE_ERROR', message: '...' }
 * 
 * Requirements: 1.1-1.7, 2.1-2.5, 4.1-4.3
 */
router.patch('/stock/:itemId', async (req, res) => {
  const { itemId } = req.params;
  
  try {
    // Extract token from Authorization header (Requirement 1.2)
    const authHeader = req.headers.authorization;
    
    // Check for missing Authorization header (Requirement 1.3)
    if (!authHeader) {
      console.log(`[${new Date().toISOString()}] Stock update FAILED - No authorization token - Item: ${itemId}`);
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'No authorization token provided'
      });
    }
    
    // Check for Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      console.log(`[${new Date().toISOString()}] Stock update FAILED - Invalid token format - Item: ${itemId}`);
      return res.status(401).json({
        error: 'INVALID_TOKEN',
        message: 'Invalid authorization token format'
      });
    }
    
    // Extract token (remove "Bearer " prefix)
    const token = authHeader.slice(7);
    
    // Validate token and extract user email (Requirement 1.4)
    const tokenResult = await adminService.validateToken(token);
    
    if (tokenResult.error) {
      if (tokenResult.error === 'NO_TOKEN') {
        console.log(`[${new Date().toISOString()}] Stock update FAILED - No token - Item: ${itemId}`);
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'No authorization token provided'
        });
      }
      
      if (tokenResult.error === 'INVALID_TOKEN') {
        console.log(`[${new Date().toISOString()}] Stock update FAILED - Invalid/expired token - Item: ${itemId}`);
        return res.status(401).json({
          error: 'INVALID_TOKEN',
          message: 'Token expired or invalid'
        });
      }
      
      if (tokenResult.error === 'SERVICE_UNAVAILABLE') {
        console.log(`[${new Date().toISOString()}] Stock update FAILED - Service unavailable - Item: ${itemId}`);
        return res.status(500).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'Authentication service unavailable'
        });
      }
      
      console.log(`[${new Date().toISOString()}] Stock update FAILED - Unknown error - Item: ${itemId}`);
      return res.status(500).json({
        error: 'SERVER_ERROR',
        message: 'An unexpected error occurred'
      });
    }
    
    const email = tokenResult.user.email;
    
    // Check admin status (Requirement 1.5)
    const adminResult = await adminService.isUserAdmin(email);
    
    if (adminResult.error) {
      console.log(`[${new Date().toISOString()}] Stock update FAILED - Admin check error: ${adminResult.error} - User: ${email} - Item: ${itemId}`);
      return res.status(500).json({
        error: adminResult.error === 'DATABASE_ERROR' ? 'DATABASE_ERROR' : 'SERVICE_UNAVAILABLE',
        message: adminResult.error === 'DATABASE_ERROR' ? 'Failed to verify admin status' : 'Authentication service unavailable'
      });
    }
    
    if (!adminResult.isAdmin) {
      console.log(`[${new Date().toISOString()}] Stock update FAILED - User not admin - User: ${email} - Item: ${itemId}`);
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Admin access required'
      });
    }
    
    // Validate request body (Requirement 1.6, 1.7)
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
    
    // Update stock (Requirement 2.1, 2.5)
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
    
    // Success - log audit entry (Requirement 4.1, 4.2)
    console.log(`[${new Date().toISOString()}] Stock update SUCCESS - User: ${email} - Item: ${itemId} - is_available: ${is_available}`);
    
    // Return success response (Requirement 2.3)
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
