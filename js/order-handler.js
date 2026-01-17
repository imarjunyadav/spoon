/**
 * SPOON REDESIGN - ORDER HANDLER SCRIPT
 *
 * This script acts as a serverless backend function. It runs after a
 * successful payment redirect.
 * - Validates payment status.
 * - Reads cart from localStorage.
 * - Creates a new order object with a unique ID.
 * - Saves the order to a new 'spoon-orders' list in localStorage.
 * - Clears the cart.
 * - Sets a flag for a success toast on the next page.
 * - Redirects the user to their order history page.
 */
document.addEventListener('DOMContentLoaded', () => {

    function getCart() { return JSON.parse(localStorage.getItem('spoon-cart')) || []; }
    function getOrders() { return JSON.parse(localStorage.getItem('spoon-orders')) || []; }
    function saveOrders(orders) { localStorage.setItem('spoon-orders', JSON.stringify(orders)); }
    function clearCart() { localStorage.removeItem('spoon-cart'); }

    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get('payment_id');
    const paymentStatus = params.get('status');
    const preOrderTime = params.get('preOrderTime'); // May be null

    const cart = getCart();

    if (paymentStatus === 'success' && paymentId && cart.length > 0) {
        // --- Generate a professional Order ID ---
        const allOrders = getOrders();
        const today = new Date();
        const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        // Find how many orders were already placed today to create a sequence number
        const todayOrdersCount = allOrders.filter(o => o.orderId.includes(`SPOON-${datePrefix}`)).length;
        const sequenceNumber = String(todayOrdersCount + 1).padStart(4, '0');
        const newOrderId = `SPOON-${datePrefix}-${sequenceNumber}`;

        // --- Create the new order object ---
        const newOrder = {
            orderId: newOrderId,
            paymentId: paymentId,
            items: cart,
            totalAmount: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
            status: 'Order Placed',
            placedAt: today.toISOString(),
            preOrderTime: preOrderTime ? decodeURIComponent(preOrderTime) : null
        };

        // Add the new order to the beginning of the list
        allOrders.unshift(newOrder);
        saveOrders(allOrders);

        // Clear the cart now that the order is placed
        clearCart();

        // Redirect to orders page
        window.location.replace('orders.html');

    } else {
        // Handle payment failure or error
        alert('There was an error processing your order. Please try again.');
        window.location.replace('cart.html');
    }
});
