/**
 * SPOON REDESIGN - SIGN UP SCRIPT
 *
 * This script handles the final step of the new user registration process.
 * - Reads the verified email from the URL (email has been verified via OTP).
 * - Validates the user's name in real-time.
 * - Optionally collects phone number for order notifications.
 * - Enables the 'Create Account' button only when required fields are valid.
 * - Upon submission, creates a user object, saves it to localStorage,
 *   sets the login flag, and redirects to the main app page.
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

    // --- 3. VALIDATION FUNCTIONS ---

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
        signupBtn.disabled = !isNameValid;
    }

    // --- 4. FORM SUBMISSION HANDLER ---

    /**
     * Handles the final account creation.
     */
    function handleFormSubmit(e) {
        e.preventDefault();

        // Final check before submission
        if (!isNameValid) {
            alert('Please enter a valid name before proceeding.');
            return;
        }

        const newUser = {
            email: verifiedEmail,
            name: nameInput.value.trim()
        };

        console.log('Creating new user:', newUser);

        // --- Create user record and log them in ---
        // Use email as the unique key for the user record
        localStorage.setItem(`user-${verifiedEmail}`, JSON.stringify(newUser));
        // Set the generic 'spoon-user' for the current session
        localStorage.setItem('spoon-user', JSON.stringify(newUser));
        // Set the master login flag
        localStorage.setItem('spoon-is-logged-in', 'true');

        // Redirect to the main page after successful signup.
        // Using replace() prevents the user from going "back" to the signup form.
        window.location.replace('index.html');
    }


    // --- 5. INITIALIZATION ---
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
