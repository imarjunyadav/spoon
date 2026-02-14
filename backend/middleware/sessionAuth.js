const adminService = require('../services/adminService');

/**
 * Middleware: Require valid Admin Session
 * 
 * RELAXED SECURITY MODEL (JWT ONLY):
 * - Validates Supabase JWT (Bearer Token).
 * - Checks if user has 'admin' status.
 * - DOES NOT enforce "Single Device" via DB token (removed for usability).
 */
const requireAdminSession = async (req, res, next) => {
    try {
        // 1. JWT Validation
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'Authorization required' });
        }

        const jwtToken = authHeader.slice(7);
        const tokenResult = await adminService.validateToken(jwtToken);

        if (tokenResult.error) {
            return res.status(401).json({ success: false, error: tokenResult.error });
        }

        // 2. Admin Role Validation
        const email = tokenResult.user.email;
        const adminResult = await adminService.isUserAdmin(email);

        if (adminResult.error || !adminResult.isAdmin) {
            return res.status(403).json({ success: false, error: 'Admin access required' });
        }

        // Attach user info
        req.user = { email, role: 'admin' };
        next();

    } catch (err) {
        console.error('requireAdminSession exception:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
};

module.exports = {
    requireAdminSession
};
