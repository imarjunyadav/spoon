/**
 * SPOON REDESIGN - ACCOUNT DASHBOARD SCRIPT
 *
 * This script handles all client-side logic for the logged-in user's account page.
 * - Performs a final gatekeeper check to ensure the user is authenticated.
 * - Reads the current user's data from localStorage to populate the profile card.
 * - Handles the secure logout flow, including a confirmation modal.
 * - Clears all user-related data from localStorage upon logout.
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- 1. AUTHENTICATION GATEKEEPER ---
    // This is the final check. If a user somehow lands on this page without
    // being logged in, they are immediately redirected.
    if (localStorage.getItem('spoon-is-logged-in') !== 'true') {
        window.location.replace('login.html');
        return; // Stop all other script execution
    }

    // --- 2. DOM ELEMENT REFERENCES ---
    const profileNameEl = document.getElementById('profile-name');
    const profileContactEl = document.getElementById('profile-contact');
    const userInitialEl = document.getElementById('user-initial');
    const cartBadge = document.getElementById('cart-badge');
    const logoutBtn = document.getElementById('logout-btn');

    // Logout Modal Elements
    const logoutModalOverlay = document.getElementById('logout-modal-overlay');
    const logoutModal = document.getElementById('logout-modal');
    const cancelLogoutBtn = document.getElementById('cancel-logout-btn');
    const confirmLogoutBtn = document.getElementById('confirm-logout-btn');


    // --- 3. HELPER FUNCTIONS ---

    /**
     * Retrieves the current user's data from localStorage.
     * @returns {Object|null} The user data object.
     */
    function getCurrentUser() {
        return JSON.parse(localStorage.getItem('spoon-user'));
    }

    // Re-usable modal functions
    function openModal(modalElement) {
        logoutModalOverlay.classList.remove('hidden');
        modalElement.classList.remove('hidden');
        setTimeout(() => {
            logoutModalOverlay.classList.add('visible');
            modalElement.classList.add('visible');
        }, 10);
    }

    function closeModal(modalElement) {
        logoutModalOverlay.classList.remove('visible');
        modalElement.classList.remove('visible');
        setTimeout(() => {
            logoutModalOverlay.classList.add('hidden');
            modalElement.classList.add('hidden');
        }, 300);
    }

    // --- 4. CORE FUNCTIONS ---

    /**
     * Populates the profile card with the logged-in user's data.
     */
    function populateProfile() {
        const user = getCurrentUser();

        if (user) {
            profileNameEl.textContent = `Hello, ${user.name}`;
            userInitialEl.textContent = user.name.charAt(0).toUpperCase();

            // Check if contact is a phone number to format it
            if (user.phone) {
                profileContactEl.textContent = `+91-${user.phone}`;
            } else {
                profileContactEl.textContent = user.email; // Fallback to email
            }
        } else {
            // This case should ideally not be reached due to the gatekeeper
            console.error("User data not found despite being logged in.");
            handleLogout(); // Force logout if data is inconsistent
        }
    }

    /**
     * Clears all user-related data from storage and redirects to the login page.
     */
    function handleLogout() {
        console.log("Logging out user and clearing all session data...");

        // Define all keys related to a user session
        const userSessionKeys = [
            'spoon-is-logged-in',
            'spoon-user',
            'spoon-cart',
            'spoon-orders'
        ];

        // Also remove the specific user record if it exists
        const user = getCurrentUser();
        if (user && user.phone) {
            userSessionKeys.push(`user-${user.phone}`);
        }

        // Clear all keys from localStorage
        userSessionKeys.forEach(key => localStorage.removeItem(key));

        // Redirect to the login page to start fresh
        window.location.replace('login.html');
    }

    /**
     * Updates the cart badge count.
     */
    function updateCartBadge() {
        const cart = JSON.parse(localStorage.getItem('spoon-cart')) || [];
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

        if (totalItems > 0) {
            cartBadge.textContent = totalItems;
            cartBadge.classList.add('visible');
        } else {
            cartBadge.classList.remove('visible');
        }
    }

    // --- 5. EVENT LISTENERS ---

    logoutBtn.addEventListener('click', () => {
        openModal(logoutModal);
    });

    cancelLogoutBtn.addEventListener('click', () => closeModal(logoutModal));
    logoutModalOverlay.addEventListener('click', () => closeModal(logoutModal));
    confirmLogoutBtn.addEventListener('click', handleLogout);

    // --- 6. INITIALIZATION ---

    function init() {
        populateProfile();
        updateCartBadge();
        console.log("Account dashboard initialized for logged-in user.");
    }

    // ========================================
    // SECTION 7: CROSS-TAB SYNCHRONIZATION
    // ========================================
    
    /**
     * STORAGE EVENT LISTENER
     * 
     * PURPOSE: Update cart badge when cart changes in another tab/window
     * 
     * HOW IT WORKS:
     * - Listens for localStorage changes from other tabs
     * - Updates badge when 'spoon-cart' changes
     * - Keeps all tabs synchronized
     */
    window.addEventListener('storage', (e) => {
        // Only update if cart data changed
        if (e.key === 'spoon-cart') {
            updateCartBadge();
        }
    });
    
    init();
});
