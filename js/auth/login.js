/**
 * ========================================
 * SPOON - LOGIN PAGE JAVASCRIPT
 * ========================================
 * 
 * PURPOSE:
 * This is the first step of user authentication - email entry.
 * 
 * WHAT IT DOES:
 * 1. Validates email input format
 * 2. Enables/disables continue button based on validation
 * 3. Calls backend API to send OTP to email
 * 4. Handles loading states and errors
 * 5. Redirects to OTP verification page on success
 * 
 * KEY CONCEPTS:
 * - Form validation: Checking user input before submission
 * - Regular expressions (regex): Pattern matching for email validation
 * - Async/await: Handling API calls
 * - Error handling: Displaying user-friendly error messages
 */

// Wait for page to load
document.addEventListener('DOMContentLoaded', () => {

  // ========================================
  // SECTION 1: DOM ELEMENT REFERENCES
  // ========================================

  const loginForm = document.getElementById('login-form');
  const emailInput = document.getElementById('email-input');
  const emailInputGroup = document.querySelector('.email-input-group');
  const emailHint = document.getElementById('email-hint');
  const continueBtn = document.getElementById('continue-btn');

  // ========================================
  // SECTION 2: VALIDATION FUNCTION
  // ========================================

  /**
   * FUNCTION: validateEmail
   * 
   * PURPOSE: Check if email is valid and enable/disable button
   * 
   * HOW IT WORKS:
   * 1. Gets email from input field
   * 2. Uses regex to check if it's a valid email format
   * 3. Enables button if valid, disables if invalid
   * 
   * EMAIL REGEX EXPLAINED:
   * /^[^\s@]+@[^\s@]+\.[^\s@]+$/ breaks down as:
   * - ^ = start of string
   * - [^\s@]+ = one or more characters that are not whitespace or @
   * - @ = literal @ symbol
   * - [^\s@]+ = one or more characters that are not whitespace or @
   * - \. = literal dot
   * - [^\s@]+ = one or more characters that are not whitespace or @
   * - $ = end of string
   */
  function validateEmail() {
    const email = emailInput.value.trim();

    // Test if email matches valid email pattern
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    // Update UI based on validation
    if (email.length === 0) {
      // Empty - neutral state
      emailInputGroup.classList.remove('error', 'success');
      emailHint.textContent = '';
      emailHint.classList.remove('error', 'success');
    } else if (isValid) {
      // Valid email
      emailInputGroup.classList.remove('error');
      emailInputGroup.classList.add('success');
      emailHint.textContent = '';
      emailHint.classList.remove('error');
    } else {
      // Invalid email
      emailInputGroup.classList.remove('success');
      emailInputGroup.classList.add('error');
      emailHint.textContent = 'Please enter a valid email address';
      emailHint.classList.add('error');
      emailHint.classList.remove('success');
    }

    // Enable button only if valid
    continueBtn.disabled = !isValid;
  }

  // ========================================
  // SECTION 3: API CALL FUNCTION
  // ========================================

  /**
   * FUNCTION: sendOTP
   * 
   * PURPOSE: Call backend API to send OTP to email
   * 
   * PARAMETERS:
   * @param {string} email - User's email address
   * 
   * RETURNS:
   * @returns {Promise<{success: boolean, message?: string, error?: object}>}
   */
  async function sendOTP(email) {
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

  // ========================================
  // SECTION 4: FORM SUBMISSION HANDLER
  // ========================================

  /**
   * FUNCTION: handleFormSubmit
   * 
   * PURPOSE: Handle form submission when user clicks Continue
   * 
   * HOW IT WORKS:
   * 1. Prevents default form submission
   * 2. Shows loading state
   * 3. Calls backend API to send OTP
   * 4. On success: redirects to OTP page
   * 5. On error: displays user-friendly message
   */
  async function handleFormSubmit(e) {
    // Prevent default form submission behavior
    e.preventDefault();

    // Double-check button isn't disabled
    if (continueBtn.disabled) return;

    const email = emailInput.value.trim();

    // Show loading state
    setLoadingState(true);
    clearError();

    try {
      const result = await sendOTP(email);

      if (result.success) {
        // Save email to localStorage for later use
        localStorage.setItem("spoon-user-email", email);

        // Redirect to OTP page with email as URL parameter
        window.location.href = `otp.html?email=${encodeURIComponent(email)}`;
      } else {
        // Handle specific error codes
        const errorMessage = getErrorMessage(result.error);
        showError(errorMessage);
      }
    } catch (error) {
      console.error('Failed to send OTP:', error);
      showError('Unable to connect to server. Please try again.');
    } finally {
      setLoadingState(false);
    }
  }

  // ========================================
  // SECTION 5: UI HELPER FUNCTIONS
  // ========================================

  /**
   * FUNCTION: setLoadingState
   * 
   * PURPOSE: Toggle loading state on the continue button
   */
  function setLoadingState(isLoading) {
    if (isLoading) {
      continueBtn.classList.add('loading');
      continueBtn.disabled = true;
      emailInput.disabled = true;
    } else {
      continueBtn.classList.remove('loading');
      emailInput.disabled = false;
      // Re-validate to set correct button state
      validateEmail();
    }
  }

  /**
   * FUNCTION: showError
   * 
   * PURPOSE: Display error message to user
   */
  function showError(message) {
    emailInputGroup.classList.add('error');
    emailInputGroup.classList.remove('success');
    emailHint.textContent = message;
    emailHint.classList.add('error');
    emailHint.classList.remove('success');
  }

  /**
   * FUNCTION: clearError
   * 
   * PURPOSE: Clear any displayed error message
   */
  function clearError() {
    emailHint.textContent = '';
    emailHint.classList.remove('error');
  }

  /**
   * FUNCTION: getErrorMessage
   * 
   * PURPOSE: Convert API error codes to user-friendly messages
   */
  function getErrorMessage(error) {
    if (!error) return 'Something went wrong. Please try again.';

    switch (error.code) {
      case 'INVALID_EMAIL':
        return 'Please enter a valid email address.';
      case 'RATE_LIMITED':
        return 'Too many requests. Please try again later.';
      case 'EMAIL_SEND_FAILED':
        return 'Failed to send email. Please try again.';
      default:
        return error.message || 'Something went wrong. Please try again.';
    }
  }

  // ========================================
  // SECTION 6: EVENT LISTENERS
  // ========================================

  /**
   * EVENT: Email input changes
   * Validates email every time user types
   */
  emailInput.addEventListener('input', validateEmail);

  /**
   * EVENT: Form submission
   * Handles when user presses Enter or clicks Continue button
   */
  loginForm.addEventListener('submit', handleFormSubmit);

  // ========================================
  // SECTION 7: INITIALIZATION
  // ========================================

  console.log("✅ Login page script initialized.");
});
