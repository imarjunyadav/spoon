/**
 * Spoon - Info Pages Script
 * 
 * Lightweight script for public info pages (About, Privacy, Help).
 * Handles cart badge updates.
 */

document.addEventListener('DOMContentLoaded', () => {
    const cartBadge = document.getElementById('cart-badge');

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

    // Listen for cart changes from other tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'spoon-cart') {
            updateCartBadge();
        }
    });

    // Initialize cart badge on page load
    updateCartBadge();
});
