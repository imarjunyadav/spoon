/**
 * SessionGuard
 * 
 * Enforces "One Active Device" policy using a hybrid approach:
 * 1. Heartbeat: Checks session validity every 15 seconds.
 * 2. Visibility: Checks session when tab becomes visible (after 5s away).
 * 3. Focus: Checks session when window regains focus.
 * 
 * Logic:
 * - Reads 'spoon-session-token' from localStorage.
 * - Calls /api/auth/validate-session.
 * - If invalid: Logs out the user.
 */
class SessionGuard {
    constructor() {
        this.HEARTBEAT_INTERVAL = 15000; // 15 seconds
        this.VISIBILITY_TIMEOUT = 5000;  // 5 seconds

        this.heartbeatTimer = null;
        this.lastVisibilityChange = Date.now();
        this.isChecking = false;
        this.isActive = false;

        // Bind methods
        this.checkSession = this.checkSession.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleFocus = this.handleFocus.bind(this);
    }

    /**
     * Start the guard. Call this on page load.
     */
    start() {
        // Prevent duplicate starts
        if (this.isActive) {
            console.log('🛡️ SessionGuard already active, skipping start');
            return;
        }

        this.isActive = true;

        // 1. Start Heartbeat (don't check immediately — let the page settle)
        this.heartbeatTimer = setInterval(this.checkSession, this.HEARTBEAT_INTERVAL);

        // 2. Listen for Visibility Changes (Tab switching)
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        // 3. Listen for Focus (Window switching)
        window.addEventListener('focus', this.handleFocus);

        console.log('🛡️ SessionGuard active (15s heartbeat)');
    }

    /**
     * Stop the guard.
     */
    stop() {
        this.isActive = false;
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('focus', this.handleFocus);
        console.log('🛡️ SessionGuard stopped');
    }

    async checkSession() {
        if (this.isChecking) return;

        // Only check if user is nominally logged in
        if (!localStorage.getItem('spoon-is-logged-in')) return;

        const email = localStorage.getItem('spoon-user-email');
        const sessionToken = localStorage.getItem('spoon-session-token');

        if (!email || !sessionToken) {
            // Missing credentials, can't validate
            return;
        }

        this.isChecking = true;

        try {
            const apiBaseUrl = window.SPOON_CONFIG?.API_BASE_URL || '';
            const response = await fetch(`${apiBaseUrl}/api/auth/validate-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, sessionToken })
            });

            if (!response.ok) {
                // Server error — skip this check, try again next heartbeat
                return;
            }

            const data = await response.json();

            if (data.valid === false) {
                console.warn('🚫 Session invalidated by heartbeat check');
                this.handleLogout(email);
            }

        } catch (error) {
            console.warn('Session check failed (network/server):', error);
        } finally {
            this.isChecking = false;
        }
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.lastVisibilityChange = Date.now();
        } else {
            // If returning after being hidden for > threshold
            const timeHidden = Date.now() - this.lastVisibilityChange;
            if (timeHidden > this.VISIBILITY_TIMEOUT) {
                console.log('👁️ Tab visible after background. Checking session...');
                this.checkSession();
            }
        }
    }

    handleFocus() {
        // Debounce slightly to avoid double-fire with visibility
        if (Date.now() - this.lastVisibilityChange > 1000) {
            this.checkSession();
        }
    }

    handleLogout(email) {
        console.warn('🚫 Session Invalidated. Logging out.');

        this.stop();

        // Clear the login flag IMMEDIATELY to prevent any race conditions
        localStorage.removeItem('spoon-is-logged-in');

        // Dispatch event for custom handling (e.g. Admin Panel)
        const event = new CustomEvent('session:invalidated', { detail: { email } });
        window.dispatchEvent(event);

        // Default behavior: Force logout after a short delay
        // (allows event listeners like Admin's handleSessionInvalidated to react first)
        setTimeout(() => {
            // If no external handler has redirected us, do it ourselves
            if (!document.hidden && window.location.pathname.indexOf('login') === -1) {
                this.performDefaultLogout(email);
            }
        }, 1000);
    }

    performDefaultLogout(email) {
        // Clear all auth state
        localStorage.removeItem('spoon-is-logged-in');
        localStorage.removeItem('spoon-user-email');
        localStorage.removeItem('spoon-session-token');
        localStorage.removeItem('spoon-user');
        localStorage.removeItem('spoon-email');

        // Redirect
        alert(`Your session has expired because this account (${email}) signed in on another device.`);
        window.location.href = 'login.html';
    }
}

// Export singleton
const sessionGuard = new SessionGuard();
// Auto-start if user is logged in (for simple script tag inclusion)
if (typeof window !== 'undefined') {
    window.sessionGuard = sessionGuard;
    // Auto-start on DOMContentLoaded if user appears to be logged in
    document.addEventListener('DOMContentLoaded', () => {
        if (localStorage.getItem('spoon-is-logged-in')) {
            sessionGuard.start();
        }
    });
}
