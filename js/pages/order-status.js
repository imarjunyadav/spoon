/**
 * Spoon - Order Status Page Script
 *
 * Powers the detailed order status page.
 * - Fetches specific order from Supabase.
 * - Renders status timeline using HorizontalStepperRenderer.
 * - Polls for real-time updates.
 * - Handles pre-order cancellation with countdown timer and confirmation modal.
 */

document.addEventListener('DOMContentLoaded', async () => {

    // --- Authentication Check ---
    if (localStorage.getItem('spoon-is-logged-in') !== 'true') {
        window.location.replace('login.html');
        return;
    }

    // Wait for config to load from backend API
    await window.waitForConfig();

    // Use the globally initialized Supabase client
    const supabase = window.getSupabaseClient();

    if (!supabase) {
        console.error('❌ Supabase client not initialized');
        window.showAlertModal("Connection Error", "Failed to connect to database. Please refresh.");
        return;
    }

    // SECURITY: escape order-item values before injecting into innerHTML.
    // Visually identical for normal item names; neutralizes any markup.
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // --- DOM Elements ---
    const orderIdHeader = document.getElementById('status-order-id-header');
    const summaryItemList = document.getElementById('summary-item-list');
    const orderItemsCount = document.getElementById('order-items-count');
    const orderTotalValue = document.getElementById('order-total-value');
    const timelineContainer = document.getElementById('timeline-container');

    // Cancel DOM elements (removed)
    
    // --- App State ---
    let pollingInterval;
    let currentOrder;

    // --- Constants ---
    const API_BASE = window.SPOON_CONFIG?.API_BASE_URL || '';

    // --- Adaptive Polling Configuration ---
    // Intervals in milliseconds based on order status (V2)
    const POLLING_INTERVALS = {
        pending: 15000,
        kitchen: 10000,
        prepared_before_arrive: 5000,
        prepared_after_arrive: 3000,
        completed: 0,
        cancelled: 0
    };

    /**
     * Get appropriate polling interval for status.
     * @param {Object} order - Order object.
     * @returns {number} Interval in ms.
     */
    function getIntervalForOrder(order) {
        if (!order) return POLLING_INTERVALS.pending;
        const status = order.status;
        if (status === 'prepared') {
            return order.arrived_at ? POLLING_INTERVALS.prepared_after_arrive : POLLING_INTERVALS.prepared_before_arrive;
        }
        if (Object.prototype.hasOwnProperty.call(POLLING_INTERVALS, status)) {
            return POLLING_INTERVALS[status];
        }
        return POLLING_INTERVALS.pending;
    }

    // --- Helper Functions ---

    const formatTime = (date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });

    /**
     * Get logged-in user email from localStorage.
     * Matches the pattern used in cart.js and other pages.
     */
    function getUserEmail() {
        const userStr = localStorage.getItem('spoon-user');
        if (!userStr) return null;
        try {
            const user = JSON.parse(userStr);
            return user.email || null;
        } catch {
            return null;
        }
    }

    /**
     * Mark customer as arrived at the counter.
     */
    window.markArrived = async function() {
        if (!currentOrder || !currentOrder.id) return;
        
        try {
            const sessionToken = localStorage.getItem('spoon-session-token');
            const email = getUserEmail();
            
            // Optimistic UI UI update
            const btn = document.getElementById('btn-arrive');
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Notifying Staff...';
            }

            const response = await fetch(`${API_BASE}/api/orders/${currentOrder.id}/arrive`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': email,
                    'x-session-token': sessionToken
                }
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Instantly re-fetch and render
                currentOrder = await getOrderById(currentOrder.id);
                renderTimeline();
                // Adjusting polling interval because it's now 'arrived'
                startAdaptivePolling();
            } else {
                window.showAlertModal("Error", result.error || 'Failed to notify staff. Please try again or go to the counter.');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'I am available to collect';
                }
            }
        } catch (error) {
            console.error('Arrive action failed:', error);
            window.showAlertModal("Network Error", "Network error. Please try again.");
        }
    };

    // --- Core Logic ---

    /**
     * Fetches order by ID.
     * @param {string} orderId 
     * @returns {Promise<Object|null>} Order data or null.
     */
    async function getOrderById(orderId) {
        try {
            const sessionToken = localStorage.getItem('spoon-session-token');
            const email = getUserEmail();

            const response = await fetch(`${API_BASE}/api/orders/${orderId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': email,
                    'x-session-token': sessionToken
                }
            });

            if (!response.ok) {
                console.warn('⚠️ API fetch failed:', response.status);
                return null;
            }

            const result = await response.json();
            if (result.success && result.order) {
                return result.order;
            }

            return null;
        } catch (error) {
            console.error('❌ Error fetching order:', error);
            return null;
        }
    }

    /**
     * Renders the status timeline and hero section.
     * Uses HorizontalStepperRenderer.
     */
    function renderTimeline() {
        timelineContainer.innerHTML = ''; // Clear previous state

        const stepperHTML = HorizontalStepperRenderer.renderStepper(currentOrder);
        const heroHTML = HorizontalStepperRenderer.renderHeroCode(currentOrder);

        timelineContainer.innerHTML = stepperHTML + heroHTML;
    }

    /**
     * Starts adaptive polling for order status updates.
     */
    function startAdaptivePolling() {
        clearInterval(pollingInterval);
        pollingInterval = null;

        const interval = getIntervalForOrder(currentOrder);

        if (interval === 0) {
            console.log('⏹️ No polling needed for status:', currentOrder?.status);
            return;
        }

        console.log(`⏰ Starting adaptive polling for status "${currentOrder?.status}" at ${interval}ms interval`);

        pollingInterval = setInterval(async () => {
            const params = new URLSearchParams(window.location.search);
            const orderId = params.get('id');

            const updatedOrder = await getOrderById(orderId);

            if (updatedOrder && (updatedOrder.status !== currentOrder.status || updatedOrder.arrived_at !== currentOrder.arrived_at)) {
                console.log('🔄 Order state changed:', currentOrder.status, 'to', updatedOrder.status);
                currentOrder = updatedOrder;
                renderTimeline();

                const newInterval = getIntervalForOrder(currentOrder);
                if (newInterval !== interval) {
                    console.log(`🔄 Adjusting polling: ${interval}ms → ${newInterval}ms`);
                    startAdaptivePolling(); // Restart with new interval
                    return;
                }
            }

            if (currentOrder.status === 'completed' || currentOrder.status === 'cancelled') {
                console.log('✅ Terminal status reached, stopping polling');
                clearInterval(pollingInterval);
                pollingInterval = null;
            }

        }, interval);
    }


    /**
     * Loads and displays order details.
     */
    async function loadOrderDetails() {
        const params = new URLSearchParams(window.location.search);
        const orderId = params.get('id');

        if (!orderId) {
            window.showAlertModal("Error", "Order ID not found.", "fa-circle-xmark", () => {
                window.location.href = 'orders.html';
            });
            return;
        }

        currentOrder = await getOrderById(orderId);

        if (!currentOrder) {
            window.showAlertModal("Error", "Order not found.", "fa-circle-xmark", () => {
                window.location.href = 'orders.html';
            });
            return;
        }

        // Populate UI
        const displayId = currentOrder.id ? currentOrder.id.slice(-8).toUpperCase() : 'UNKNOWN';
        orderIdHeader.textContent = `#${displayId}`;

        const totalItems = currentOrder.items.reduce((sum, item) => sum + item.quantity, 0);
        orderItemsCount.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;

        summaryItemList.innerHTML = currentOrder.items.map(item =>
            `<div class="summary-item">
                <span class="summary-item__name">${escapeHtml(item.title)} × ${escapeHtml(item.quantity)}</span>
                <span class="summary-item__price">₹${item.price * item.quantity}</span>
            </div>`
        ).join('');

        orderTotalValue.textContent = `₹${currentOrder.total}`;

        renderTimeline();

        if (currentOrder.status !== 'completed' && currentOrder.status !== 'cancelled') {
            startAdaptivePolling();
        }
    }

    // --- Cleanup ---

    window.addEventListener('beforeunload', () => {
        clearInterval(pollingInterval);
    });

    // --- Initialization ---
    loadOrderDetails();
});
