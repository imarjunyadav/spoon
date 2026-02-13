/**
 * Spoon - Session Authentication Middleware
 * 
 * Enforces strict "Single Device Login" and Role-Based Session policies.
 * 
 * - requireAdminSession: Validates 'x-admin-session-token' against 'admin_session_token' in DB.
 * - requireAppSession: Validates 'x-session-token' against 'active_session_token' in DB.
 */

const userService = require('../services/userService');
const adminService = require('../services/adminService');

/**
 * Middleware: Require valid Admin Session
 * Checks 'Authorization' (Bearer) AND 'x-admin-session-token'.
 */
const requireAdminSession = async (req, res, next) => {
    try {
        // 1. JWT Validation (Base Auth)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authorization required' });
        }

        const jwtToken = authHeader.slice(7);
        const tokenResult = await adminService.validateToken(jwtToken);

        if (tokenResult.error) {
            return res.status(401).json({ success: false, error: tokenResult.error });
        }

        const email = tokenResult.user.email;

        // 2. Session Token Validation (Strict Enforcement)
        const sessionToken = req.headers['x-admin-session-token'];

        if (!sessionToken) {
            console.warn(`⚠️ Admin request missing session token: ${email}`);
            return res.status(401).json({
                success: false,
                error: 'Session token required. Please refresh.',
                code: 'SESSION_REQUIRED'
            });
        }

        const { valid, error } = await userService.validateSession(email, sessionToken, 'admin');

        if (error) {
            console.error('Admin session check error:', error);
            return res.status(500).json({ success: false, error: 'Session check failed' });
        }

        if (!valid) {
            console.warn(`🚫 Invalid admin session for ${email}`);
            return res.status(401).json({
                success: false,
                error: 'Session expired or invalidated. Please login again.',
                code: 'SESSION_INVALID'
            });
        }

        // Attach user info
        req.user = { email, role: 'admin' };
        next();

    } catch (err) {
        console.error('requireAdminSession exception:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

/**
 * Middleware: Require valid App Session (User)
 * Checks 'x-user-email' AND 'x-session-token'.
 * (Alternative to existing userAuth.js, but explicit for critical actions)
 */
const requireAppSession = async (req, res, next) => {
    try {
        const email = req.headers['x-user-email'];
        const token = req.headers['x-session-token'];

        if (!email || !token) {
            return res.status(401).json({ success: false, error: 'Authentication required' });
        }

        // Validate against 'active_session_token' (default type='app')
        const { valid, error } = await userService.validateSession(email, token, 'app');

        if (error) {
            console.error('App session check error:', error);
            return res.status(500).json({ success: false, error: 'Session check failed' });
        }

        if (!valid) {
            return res.status(401).json({
                success: false,
                error: 'Session expired. Please login again.',
                code: 'SESSION_INVALID'
            });
        }

        req.user = { email, role: 'app' };
        next();

    } catch (err) {
        console.error('requireAppSession exception:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

module.exports = {
    requireAdminSession,
    requireAppSession
};
