/**
 * ========================================
 * SPOON - OTP VERIFICATION SCRIPT
 * ========================================
 *
 * PURPOSE:
 * This script handles the client-side logic for the OTP verification screen.
 * 
 * WHAT IT DOES:
 * 1. Reads the email from the URL
 * 2. Manages the 4-digit OTP input with auto-focus and backspace handling
 * 3. Controls a countdown timer for the "Resend OTP" functionality
 * 4. Calls backend API to verify OTP
 * 5. Handles success/error responses and redirects appropriately
 * 6. Checks if user exists in Supabase and stores user data
 * 
 * REQUIREMENTS COVERED:
 * - 6.2: Check with backend if user exists in Supabase after OTP verification
 * - 6.3: Retrieve and store user data from backend response for existing users
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. DOM ELEMENT REFERENCES ---
    const subtitle = document.getElementById('otp-subtitle');
    const otpInputs = document.querySelectorAll('.otp-input');
    const resendLink = document.getElementById('resend-link');
    const timerSpan = document.getElementById('otp-timer');
    const otpForm = document.getElementById('otp-form');

    // --- 2. STATE & CONFIG ---
    let userEmail = '';
    const TIMER_DURATION = 30; // 30 seconds
    let timer = TIMER_DURATION;
    let timerInterval;
    let isSubmitting = false;

    // --- 3. API FUNCTIONS ---

    /**
     * FUNCTION: verifyOTP
     * 
     * PURPOSE: Call backend API to verify the OTP
     * 
     * PARAMETERS:
     * @param {string} email - User's email address
     * @param {string} otp - 4-digit OTP entered by user
     * 
     * RETURNS:
     * @returns {Promise<{success: boolean, isNewUser?: boolean, user?: object, error?: object}>}
     */
    async function verifyOTP(email, otp) {
        const apiBaseUrl = window.SPOON_CONFIG?.API_BASE_URL || '';

        const response = await fetch(`${apiBaseUrl}/api/auth/verify-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, otp })
        });

        return response.json();
    }

    /**
     * FUNCTION: resendOTPApi
     * 
     * PURPOSE: Call backend API to resend OTP
     * 
     * PARAMETERS:
     * @param {string} email - User's email address
     * 
     * RETURNS:
     * @returns {Promise<{success: boolean, message?: string, error?: object}>}
     */
    async function resendOTPApi(email) {
        const apiBaseUrl = window.SPOON_CONFIG?.API_BASE_URL || '';

        const response = await fetch(`${apiBaseUrl}/api/auth/send-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        return response.json();
    }

    // --- 4. OTP INPUT HANDLING ---

    /**
     * Handles all user input within the OTP boxes.
     */
    function handleOtpInput() {
        otpInputs.forEach((input, index) => {
            input.addEventListener('input', () => {
                // If a digit is entered, move focus to the next input box
                if (input.value && index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }

                // If the last digit is entered, trigger form submission
                if (index === otpInputs.length - 1 && input.value) {
                    otpForm.requestSubmit();
                }
            });

            input.addEventListener('keydown', (e) => {
                // If backspace is pressed on an empty input, move focus to the previous input
                if (e.key === 'Backspace' && !input.value && index > 0) {
                    otpInputs[index - 1].focus();
                }
            });
        });
    }

    /**
     * FUNCTION: handleOtpPaste
     * 
     * PURPOSE: Handle pasting OTP from clipboard (e.g., from email)
     */
    function handleOtpPaste() {
        otpInputs.forEach((input, index) => {
            input.addEventListener('paste', (e) => {
                e.preventDefault();

                const pastedData = e.clipboardData.getData('text');
                const digits = pastedData.replace(/\D/g, '');

                if (digits.length === 0) return;

                for (let i = 0; i < digits.length && (index + i) < otpInputs.length; i++) {
                    otpInputs[index + i].value = digits[i];
                }

                const nextEmptyIndex = Array.from(otpInputs).findIndex(inp => !inp.value);
                if (nextEmptyIndex !== -1) {
                    otpInputs[nextEmptyIndex].focus();
                } else {
                    otpInputs[otpInputs.length - 1].focus();

                    const allFilled = Array.from(otpInputs).every(inp => inp.value);
                    if (allFilled) {
                        otpForm.requestSubmit();
                    }
                }
            });
        });
    }

    // --- 5. TIMER FUNCTIONS ---

    /**
     * Starts the 30-second countdown timer.
     */
    function startTimer() {
        timer = TIMER_DURATION;
        resendLink.classList.add('disabled');
        timerSpan.style.display = 'inline';
        timerSpan.textContent = `(0:${String(timer).padStart(2, '0')})`;

        timerInterval = setInterval(() => {
            timer--;
            timerSpan.textContent = `(0:${String(timer).padStart(2, '0')})`;
            if (timer <= 0) {
                clearInterval(timerInterval);
                resendLink.classList.remove('disabled');
                timerSpan.style.display = 'none';
            }
        }, 1000);
    }

    // --- 6. EVENT HANDLERS ---

    /**
     * Handles resending the OTP via backend API.
     */
    async function handleResendOtp(e) {
        e.preventDefault();
        if (resendLink.classList.contains('disabled')) return;

        // Disable link while processing
        resendLink.classList.add('disabled');
        resendLink.textContent = 'Sending...';

        try {
            const result = await resendOTPApi(userEmail);

            if (result.success) {
                alert('A new OTP has been sent to your email.');
                startTimer();
            } else {
                const errorMessage = getErrorMessage(result.error);
                alert(errorMessage);
                // Re-enable resend link on error
                resendLink.classList.remove('disabled');
            }
        } catch (error) {
            console.error('Failed to resend OTP:', error);
            alert('Unable to connect to server. Please try again.');
            resendLink.classList.remove('disabled');
        } finally {
            resendLink.textContent = 'Resend';
        }
    }

    /**
     * Verifies the OTP via backend API and handles the response.
     * 
     * REQUIREMENTS COVERED:
     * - 6.2: Check with backend if user exists in Supabase after OTP verification
     * - 6.3: Retrieve and store user data from backend response for existing users
     */
    async function handleOtpVerification(e) {
        e.preventDefault();

        // Prevent double submission
        if (isSubmitting) return;

        let otp = '';
        otpInputs.forEach(input => otp += input.value);

        if (otp.length !== otpInputs.length) {
            alert('Please enter a valid 4-digit OTP.');
            return;
        }

        isSubmitting = true;
        setInputsDisabled(true);

        try {
            const result = await verifyOTP(userEmail, otp);

            if (result.success) {
                // Store email in localStorage
                localStorage.setItem('spoon-user-email', userEmail);

                if (result.isNewUser) {
                    // New user: redirect to signup page with verified email
                    window.location.href = `signup.html?email=${encodeURIComponent(userEmail)}`;
                } else {
                    // Existing user: set login flag and store user data (Requirement 6.2, 6.3)
                    localStorage.setItem('spoon-is-logged-in', 'true');
                    if (result.user) {
                        // Store user data from backend response
                        localStorage.setItem('spoon-user', JSON.stringify(result.user));
                        // Also store with email key for consistency
                        localStorage.setItem(`user-${userEmail}`, JSON.stringify(result.user));
                    }
                    if (result.sessionToken) {
                        localStorage.setItem('spoon-session-token', result.sessionToken);
                    }
                    // Fix: Store email for session-guard.js
                    localStorage.setItem('spoon-user-email', userEmail);

                    window.location.replace('index.html');
                }
            } else {
                const errorMessage = getErrorMessage(result.error);
                alert(errorMessage);
                clearOtpInputs();
                otpInputs[0].focus();
            }
        } catch (error) {
            console.error('Failed to verify OTP:', error);
            alert('Unable to connect to server. Please try again.');
            clearOtpInputs();
            otpInputs[0].focus();
        } finally {
            isSubmitting = false;
            setInputsDisabled(false);
        }
    }

    // --- 7. HELPER FUNCTIONS ---

    /**
     * FUNCTION: getErrorMessage
     * 
     * PURPOSE: Convert API error codes to user-friendly messages
     */
    function getErrorMessage(error) {
        if (!error) return 'Something went wrong. Please try again.';

        switch (error.code) {
            case 'INVALID_OTP':
                return 'Invalid OTP. Please check and try again.';
            case 'OTP_EXPIRED':
                return 'OTP has expired. Please request a new one.';
            case 'OTP_NOT_FOUND':
                return 'No OTP found for this email. Please request a new one.';
            case 'MAX_ATTEMPTS':
                return 'Too many failed attempts. Please request a new OTP.';
            case 'RATE_LIMITED':
                return 'Too many requests. Please try again later.';
            case 'INVALID_EMAIL':
                return 'Invalid email address.';
            case 'EMAIL_SEND_FAILED':
                return 'Failed to send email. Please try again.';
            default:
                return error.message || 'Something went wrong. Please try again.';
        }
    }

    /**
     * FUNCTION: setInputsDisabled
     * 
     * PURPOSE: Enable/disable OTP inputs during API calls
     */
    function setInputsDisabled(disabled) {
        otpInputs.forEach(input => {
            input.disabled = disabled;
        });
    }

    /**
     * FUNCTION: clearOtpInputs
     * 
     * PURPOSE: Clear all OTP input fields
     */
    function clearOtpInputs() {
        otpInputs.forEach(input => {
            input.value = '';
        });
    }

    /**
     * FUNCTION: maskEmail
     * 
     * PURPOSE: Partially mask email for display (e.g., j***@example.com)
     */
    function maskEmail(email) {
        const [localPart, domain] = email.split('@');
        if (localPart.length <= 2) {
            return `${localPart[0]}***@${domain}`;
        }
        return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
    }

    // --- 8. INITIALIZATION ---
    function init() {
        // Get email from the URL
        const params = new URLSearchParams(window.location.search);
        userEmail = params.get('email');

        if (!userEmail) {
            alert("Email not found. Redirecting...");
            window.location.replace('login.html');
            return;
        }

        // Update the subtitle with the masked email
        subtitle.textContent = `Enter the OTP sent to ${maskEmail(userEmail)}`;

        handleOtpInput();
        handleOtpPaste();
        resendLink.addEventListener('click', handleResendOtp);
        otpForm.addEventListener('submit', handleOtpVerification);

        startTimer();

        // Focus the first input box
        otpInputs[0].focus();

        console.log("✅ OTP page script initialized.");
    }

    init();
});
