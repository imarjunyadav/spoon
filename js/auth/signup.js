/**
 * SPOON REDESIGN - SIGN UP SCRIPT
 *
 * This script handles the final step of the new user registration process.
 * - Reads the verified email from the URL (email has been verified via OTP).
 * - Validates the user's name in real-time.
 * - Optionally collects phone number for order notifications.
 * - Enables the 'Create Account' button only when required fields are valid.
 * - Upon submission, calls backend API to create user in Supabase,
 *   saves user data to localStorage, sets the login flag, and redirects to the main app page.
 * 
 * REQUIREMENTS COVERED:
 * - 6.1: Frontend calls backend to create user in Supabase on signup
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. DOM ELEMENT REFERENCES ---
    const signupForm = document.getElementById('signup-form');
    const nameInput = document.getElementById('name-input');
    const emailInput = document.getElementById('email-input');
    const signupBtn = document.getElementById('signup-btn');
    const nameError = document.getElementById('name-error');

    // --- 2. STATE & CONFIG ---
    let verifiedEmail = '';
    // Validation flag to control the button state
    let isNameValid = false;
    let isSubmitting = false;

    // --- 3. API FUNCTIONS ---

    /**
     * FUNCTION: createUserApi
     * 
     * PURPOSE: Call backend API to create user in Supabase
     * 
     * PARAMETERS:
     * @param {string} email - User's verified email address
     * @param {string} name - User's name
     * 
     * RETURNS:
     * @returns {Promise<{success: boolean, user?: object, error?: object}>}
     */
    async function createUserApi(email, name) {
        const apiBaseUrl = window.SPOON_CONFIG?.API_BASE_URL || '';

        const response = await fetch(`${apiBaseUrl}/api/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, name })
        });

        return response.json();
    }

    // --- 4. VALIDATION FUNCTIONS ---

    /**
     * Validates the full name input.
     * 
     * - Adds 'error' class to input when invalid
     * - Adds 'success' class when valid
     * - Shows/hides error message
     */
    function validateName() {
        const name = nameInput.value.trim();

        // Only validate if user has started typing
        if (name.length === 0) {
            nameError.textContent = '';
            nameInput.classList.remove('error', 'success');
            isNameValid = false;
            updateButtonState();
            return;
        }

        if (name.length < 3) {
            nameError.textContent = 'Name must be at least 3 characters.';
            nameInput.classList.add('error');
            nameInput.classList.remove('success');
            isNameValid = false;
        } else {
            nameError.textContent = '';
            nameInput.classList.remove('error');
            nameInput.classList.add('success');
            isNameValid = true;
        }
        updateButtonState();
    }

    /**
     * Enables or disables the signup button based on the validity of required fields.
     * Only name is required - email is already verified and phone is optional.
     */
    function updateButtonState() {
        signupBtn.disabled = !isNameValid || isSubmitting;
    }

    // --- 5. HELPER FUNCTIONS ---

    /**
     * FUNCTION: getErrorMessage
     * 
     * PURPOSE: Convert API error codes to user-friendly messages
     */
    function getErrorMessage(error) {
        if (!error) return 'Something went wrong. Please try again.';

        switch (error.code) {
            case 'INVALID_EMAIL':
                return 'Invalid email address.';
            case 'INVALID_NAME':
                return 'Please enter a valid name.';
            case 'USER_EXISTS':
                return 'An account with this email already exists.';
            case 'SERVICE_UNAVAILABLE':
                return 'Service temporarily unavailable. Please try again in a few moments.';
            case 'DATABASE_ERROR':
                return 'Failed to create account. Please try again.';
            default:
                return error.message || 'Something went wrong. Please try again.';
        }
    }

    /**
     * FUNCTION: setFormDisabled
     * 
     * PURPOSE: Enable/disable form inputs during API calls
     */
    function setFormDisabled(disabled) {
        nameInput.disabled = disabled;
        signupBtn.disabled = disabled;
        isSubmitting = disabled;

        if (disabled) {
            signupBtn.textContent = 'Creating Account...';
        } else {
            signupBtn.textContent = 'Create Account';
        }
    }

    // --- 6. FORM SUBMISSION HANDLER ---

    /**
     * Handles the final account creation via backend API.
     */
    async function handleFormSubmit(e) {
        e.preventDefault();

        // Prevent double submission
        if (isSubmitting) return;

        // Final check before submission
        if (!isNameValid) {
            alert('Please enter a valid name before proceeding.');
            return;
        }

        const name = nameInput.value.trim();

        console.log('Creating new user:', { email: verifiedEmail, name });

        setFormDisabled(true);

        try {
            // Call backend API to create user in Supabase (Requirement 6.1)
            const result = await createUserApi(verifiedEmail, name);

            if (result.success) {
                // Store user data from response
                const userData = result.user || { email: verifiedEmail, name };

                // Use email as the unique key for the user record
                localStorage.setItem(`user-${verifiedEmail}`, JSON.stringify(userData));
                // Set the generic 'spoon-user' for the current session
                localStorage.setItem('spoon-user', JSON.stringify(userData));
                // Set the master login flag
                localStorage.setItem('spoon-is-logged-in', 'true');

                if (result.sessionToken) {
                    localStorage.setItem('spoon-session-token', result.sessionToken);
                }
                // Fix: Store email for session-guard.js
                localStorage.setItem('spoon-user-email', verifiedEmail);

                console.log('✅ User created successfully:', userData);

                // Redirect to the main page after successful signup.
                // Using replace() prevents the user from going "back" to the signup form.
                window.location.replace('index.html');
            } else {
                // Handle error response
                const errorMessage = getErrorMessage(result.error);
                alert(errorMessage);
                setFormDisabled(false);
            }
        } catch (error) {
            console.error('Failed to create user:', error);
            alert('Unable to connect to server. Please try again.');
            setFormDisabled(false);
        }
    }


    // --- 7. INITIALIZATION ---
    function init() {
        // Get the verified email from the URL
        const params = new URLSearchParams(window.location.search);
        verifiedEmail = params.get('email');

        if (!verifiedEmail) {
            alert("Verified email not found. Redirecting to login.");
            window.location.replace('login.html');
            return;
        }

        // Display the verified email in the read-only input
        emailInput.value = verifiedEmail;

        // Add real-time validation listener to the name input
        nameInput.addEventListener('input', validateName);

        // Add form submission listener
        signupForm.addEventListener('submit', handleFormSubmit);

        console.log("Signup page script initialized with verified email:", verifiedEmail);
    }

    init();
});
