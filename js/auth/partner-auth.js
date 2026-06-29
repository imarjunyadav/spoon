/**
 * Spoon - Partner Sign-In (password-based)
 *
 * Calls POST /api/auth/partner-login and, on success, persists the session using
 * the SAME localStorage keys the OTP flow uses (see js/auth/otp.js), so the
 * post-login experience is identical. This endpoint is disabled by default on the
 * server (returns 404) unless explicitly enabled via environment configuration.
 */
(function () {
    'use strict';

    const form = document.getElementById('partner-form');
    const emailEl = document.getElementById('email-input');
    const passEl = document.getElementById('password-input');
    const errEl = document.getElementById('form-error');
    const btn = document.getElementById('submit-btn');

    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errEl.textContent = '';

        const email = (emailEl.value || '').trim();
        const password = passEl.value || '';

        if (!email || !password) {
            errEl.textContent = 'Please enter your email and password.';
            return;
        }

        btn.disabled = true;
        const originalLabel = btn.textContent;
        btn.textContent = 'Signing in…';

        try {
            const apiBaseUrl = window.SPOON_CONFIG?.API_BASE_URL || '';
            const response = await fetch(`${apiBaseUrl}/api/auth/partner-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const result = await response.json().catch(() => ({}));

            if (response.ok && result.success) {
                // Mirror the existing-user branch of js/auth/otp.js exactly.
                const loggedInEmail = result.email || email;
                localStorage.setItem('spoon-user-email', loggedInEmail);
                localStorage.setItem('spoon-is-logged-in', 'true');
                // Marker (set ONLY here) so the session guard never routes this
                // account to the OTP flow. Normal users never have this key.
                localStorage.setItem('spoon-partner-session', '1');
                if (result.user) {
                    localStorage.setItem('spoon-user', JSON.stringify(result.user));
                    localStorage.setItem(`user-${loggedInEmail}`, JSON.stringify(result.user));
                }
                if (result.sessionToken) {
                    localStorage.setItem('spoon-session-token', result.sessionToken);
                }
                window.location.replace('index.html');
                return;
            }

            // Distinguish rate-limiting from bad credentials.
            if (response.status === 429) {
                errEl.textContent = 'Too many login attempts. Please wait a few minutes and try again.';
            } else {
                // Generic message for every other failure (no enumeration / no oracle).
                errEl.textContent = 'Invalid credentials. Please try again.';
            }
        } catch (err) {
            console.error('Partner sign-in failed:', err);
            errEl.textContent = 'Unable to connect to server. Please try again.';
        } finally {
            btn.disabled = false;
            btn.textContent = originalLabel;
        }
    });
})();
