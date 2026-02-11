/**
 * Spoon - User Authentication Middleware
 * 
 * Verifies the user session token and email from request headers.
 * Uses userService.validateSession which checks the database and enforces
 * the "One Active Device" policy.
 * 
 * Usage:
 * const requireAuth = require('../middleware/userAuth');
 * router.get('/protected-route', requireAuth, (req, res) => { ... });
 */

const userService = require('../services/userService');

const requireAuth = async (req, res, next) => {
    try {
        // Expecting custom headers for session authentication
        // Standard Authorization header is sometimes used for Admin/Bearer
        // Using X- headers avoids conflict and is clear for this custom session scheme
        const email = req.headers['x-user-email'];
        const token = req.headers['x-session-token'];

        if (!email || !token) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required. Please log in.'
            });
        }

        // Validate session against DB (checks token match + expiration)
        const { valid, error } = await userService.validateSession(email, token);

        if (error) {
            console.error('Auth middleware error:', error);
            // Fail closed securely
            return res.status(500).json({
                success: false,
                error: 'Authentication service unavailable'
            });
        }

        if (!valid) {
            return res.status(401).json({
                success: false,
                error: 'Session expired or invalid. Please log in again.'
            });
        }

        // Attach user context to request
        // This is safer than reading from body/query in the route handler
        req.user = {
            email: email,
            token: token
        };

        next();

    } catch (err) {
        console.error('Auth middleware exception:', err);
        return res.status(500).json({
            success: false,
            error: 'Internal server error during authentication'
        });
    }
};

module.exports = requireAuth;
