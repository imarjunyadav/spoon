/**
 * SessionGuard
 * 
 * Enforces "One Active Device" policy using a hybrid approach:
 * 1. Heartbeat: Checks session validity every 30 seconds.
 * 2. Visibility: Checks session when tab becomes visible (after 5s away).
 * 3. Focus: Checks session when window regains focus.
 * 
 * Logic:
 * - Reads 'spoon-session-token' from localStorage.
 * - Calls /api/auth/validate-session.
 * - If invalid: Validates once more (double-check), then logs out.
 */
class SessionGuard {
    constructor() {
        this.HEARTBEAT_INTERVAL = 30000; // 30 seconds
        this.VISIBILITY_TIMEOUT = 5000;  // 5 seconds

        this.heartbeatTimer = null;
        this.lastVisibilityChange = Date.now();
        this.isChecking = false;

        // Bind methods
        this.checkSession = this.checkSession.bind(this);
        this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
        this.handleFocus = this.handleFocus.bind(this);
    }

    /**
     * Start the guard. Call this on page load.
     */
    start() {
        // 1. Initial Check
        this.checkSession();

        // 2. Start Heartbeat
        this.heartbeatTimer = setInterval(this.checkSession, this.HEARTBEAT_INTERVAL);

        // 3. Listen for Visibility Changes (Tab switching)
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        // 4. Listen for Focus (Window switching)
        window.addEventListener('focus', this.handleFocus);

        console.log('🛡️ SessionGuard active');
    }

    /**
     * Stop the guard.
     */
    stop() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('focus', this.handleFocus);
    }

    async checkSession() {
        if (this.isChecking) return;

        // Only check if user is nominally logged in
        if (!localStorage.getItem('spoon-is-logged-in')) return;

        const email = localStorage.getItem('spoon-user-email');
        const sessionToken = localStorage.getItem('spoon-session-token');

        if (!email || !sessionToken) {
            // Missing credentials, potentially already logged out
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
                // If 500, we ignore (server issue). If 400/404, might be issue.
                // Assuming Validate Endpoint returns 200 { valid: false } if invalid.
                // But if it returns 401/403, we should logout.
                // Our implementation returns 200 { valid: boolean } or 500 error.
                return;
            }

            const data = await response.json();

            if (data.valid === false) {
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

        // Dispatch event for custom handling (e.g. Admin Panel)
        const event = new CustomEvent('session:invalidated', { detail: { email } });
        window.dispatchEvent(event);

        // Default behavior: Force logout if not prevented
        // We set a small timeout to allow event listeners to react
        setTimeout(() => {
            // Check if processed by external handler (optional pattern, but simple for now)
            if (localStorage.getItem('spoon-is-logged-in')) {
                this.performDefaultLogout(email);
            }
        }, 500);
    }

    performDefaultLogout(email) {
        // Clear Auth
        localStorage.removeItem('spoon-is-logged-in');
        localStorage.removeItem('spoon-user-email');
        localStorage.removeItem('spoon-session-token');
        localStorage.removeItem('spoon-user');

        // Redirect
        alert(`Your session has expired because this account (${email}) signed in on another device.`);
        window.location.href = 'login.html';
    }
}

// Export singleton
const sessionGuard = new SessionGuard();
// Auto-start if not a module (for simple script tags)
if (typeof window !== 'undefined') {
    window.sessionGuard = sessionGuard;
    // Optional: Auto-start on load?
    // Let's explicitly start it in the page scripts or inline.
}
