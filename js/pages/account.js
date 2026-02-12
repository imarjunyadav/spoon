/**
 * Spoon - Account Dashboard Script
 *
 * Handles client-side logic for the logged-in user's account page.
 * - Authenticates user.
 * - Populates profile data.
 * - Fetches and displays Wallet Balance & Transaction History.
 * - Handles secure logout.
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- Authentication Check ---
    if (localStorage.getItem('spoon-is-logged-in') !== 'true') {
        window.location.replace('login.html');
        return;
    }

    // --- DOM Elements ---
    const profileNameEl = document.getElementById('profile-name');
    const profileContactEl = document.getElementById('profile-contact');
    const userInitialEl = document.getElementById('user-initial');
    const cartBadge = document.getElementById('cart-badge');
    const logoutBtn = document.getElementById('logout-btn');

    // Wallet Elements
    const walletBalanceBadge = document.getElementById('wallet-balance-badge');

    // Logout Modal Elements
    const logoutModalOverlay = document.getElementById('logout-modal-overlay');
    const logoutModal = document.getElementById('logout-modal');
    const cancelLogoutBtn = document.getElementById('cancel-logout-btn');
    const confirmLogoutBtn = document.getElementById('confirm-logout-btn');


    // --- Helper Functions ---

    /**
     * Get current user data from localStorage.
     * @returns {Object|null} User data object.
     */
    function getCurrentUser() {
        return JSON.parse(localStorage.getItem('spoon-user'));
    }

    function getUserEmail() {
        const user = getCurrentUser();
        return user ? (user.email || localStorage.getItem('spoon-user-email')) : null;
    }

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

    /**
     * Format date to friendly string (e.g., "12 Feb, 2:30 PM")
     */
    function formatTransactionDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        });
    }

    // --- Core Functions ---

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
            console.error("User data not found despite being logged in.");
            handleLogout(); // Force logout if data is inconsistent
        }
    }

    /**
     * Fetch and display Wallet Balance only (for badge).
     */
    async function fetchWalletBalance() {
        const email = getUserEmail();
        if (!email) return;

        try {
            const sessionToken = localStorage.getItem('spoon-session-token');
            const balanceRes = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/wallet/balance?email=${encodeURIComponent(email)}`, {
                headers: {
                    'x-user-email': email,
                    'x-session-token': sessionToken
                }
            });
            const balanceData = await balanceRes.json();

            if (balanceData.success) {
                walletBalanceBadge.textContent = `₹${balanceData.balance}`;
            } else {
                walletBalanceBadge.textContent = 'Error';
            }

        } catch (err) {
            console.error('Error fetching wallet balance:', err);
            walletBalanceBadge.textContent = 'Offline';
        }
    }



    /**
     * Clears all user-related data from storage and redirects to login.
     */
    function handleLogout() {
        console.log("Logging out user and clearing all session data...");

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

        userSessionKeys.forEach(key => localStorage.removeItem(key));

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

    // --- Event Listeners ---

    logoutBtn.addEventListener('click', () => {
        openModal(logoutModal);
    });

    cancelLogoutBtn.addEventListener('click', () => closeModal(logoutModal));
    logoutModalOverlay.addEventListener('click', () => closeModal(logoutModal));
    confirmLogoutBtn.addEventListener('click', handleLogout);

    // --- Initialization ---

    function init() {
        populateProfile();
        updateCartBadge();

        // Wait for config then fetch wallet
        window.waitForConfig().then(() => {
            fetchWalletBalance();
        });

        console.log("Account dashboard initialized.");
    }

    // --- Cross-Tab Synchronization ---

    // Update cart badge when cart changes in another tab
    window.addEventListener('storage', (e) => {
        if (e.key === 'spoon-cart') {
            updateCartBadge();
        }
    });

    init();
});
