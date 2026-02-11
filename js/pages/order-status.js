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

    // Wait for config to load from backend API
    await window.waitForConfig();

    // Use the globally initialized Supabase client
    const supabase = window.getSupabaseClient();

    if (!supabase) {
        console.error('❌ Supabase client not initialized');
        alert('Failed to connect to database. Please refresh.');
        return;
    }

    // --- DOM Elements ---
    const orderIdHeader = document.getElementById('status-order-id-header');
    const summaryItemList = document.getElementById('summary-item-list');
    const orderItemsCount = document.getElementById('order-items-count');
    const orderTotalValue = document.getElementById('order-total-value');
    const timelineContainer = document.getElementById('timeline-container');

    // Cancel DOM elements
    const cancelSection = document.getElementById('cancel-order-section');
    const cancelTimerText = document.getElementById('cancel-timer-text');
    const btnCancelOrder = document.getElementById('btn-cancel-order');
    const cancelDoneSection = document.getElementById('cancel-order-done');
    const cancelDoneRefund = document.getElementById('cancel-done-refund');
    const cancelModalOverlay = document.getElementById('cancel-modal-overlay');
    const cancelRefundAmount = document.getElementById('cancel-refund-amount');
    const cancelReasonSelect = document.getElementById('cancel-reason');
    const btnCancelBack = document.getElementById('btn-cancel-back');
    const btnCancelConfirm = document.getElementById('btn-cancel-confirm');

    // --- App State ---
    let pollingInterval;
    let cancelTimerInterval;
    let currentOrder;
    let isCancelling = false;

    // --- Constants ---
    const CANCEL_WINDOW_MINUTES = 45;
    const API_BASE = Config.api.baseUrl;

    // --- Adaptive Polling Configuration ---
    // Intervals in milliseconds based on order status
    const POLLING_INTERVALS = {
        PENDING: 20000,    // 20s
        PLACED: 20000,     // 20s
        PREPARING: 20000,  // 20s
        COMPLETE: 3000,    // 3s (Counter Moment)
        PICKED_UP: 0,      // No polling
        CANCELLED: 0       // No polling
    };

    /**
     * Get appropriate polling interval for status.
     * @param {string} status - Order status.
     * @returns {number} Interval in ms.
     */
    function getIntervalForStatus(status) {
        if (Object.prototype.hasOwnProperty.call(POLLING_INTERVALS, status)) {
            return POLLING_INTERVALS[status];
        }
        return POLLING_INTERVALS.PENDING;
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

    // ========================================
    // CANCEL ORDER LOGIC
    // ========================================

    /**
     * Check if current order is eligible for cancellation.
     * @returns {{ eligible: boolean, minutesLeft: number }}
     */
    function getCancelEligibility() {
        if (!currentOrder) return { eligible: false, minutesLeft: 0 };

        // Must be PLACED status
        if (currentOrder.status !== 'PLACED') return { eligible: false, minutesLeft: 0 };

        // Must be a pre-order (has preorder_time)
        if (!currentOrder.preorder_time) return { eligible: false, minutesLeft: 0 };

        // Must be >= 45 minutes before preorder_time
        const now = new Date();
        const preorderTime = new Date(currentOrder.preorder_time);
        const minutesLeft = (preorderTime - now) / (1000 * 60);

        // How many minutes of cancel window remain
        // Cancel window closes 45 min before preorder_time
        const cancelWindowRemaining = minutesLeft - CANCEL_WINDOW_MINUTES;

        return {
            eligible: cancelWindowRemaining > 0,
            minutesLeft: Math.max(0, cancelWindowRemaining)
        };
    }

    /**
     * Format minutes into "Xh Ym" or "Ym Zs" string.
     */
    function formatCountdown(totalMinutes) {
        if (totalMinutes <= 0) return '0:00';

        const hours = Math.floor(totalMinutes / 60);
        const mins = Math.floor(totalMinutes % 60);
        const secs = Math.floor((totalMinutes * 60) % 60);

        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Update cancel section visibility and countdown timer.
     */
    function updateCancelUI() {
        if (!cancelSection || !cancelDoneSection) return;

        // If order is already cancelled, show the done badge
        if (currentOrder && currentOrder.status === 'CANCELLED') {
            cancelSection.classList.add('hidden');
            cancelDoneSection.classList.remove('hidden');
            cancelDoneRefund.textContent = `₹${currentOrder.refund_amount || currentOrder.total} refunded as coins`;
            stopCancelTimer();
            return;
        }

        const { eligible, minutesLeft } = getCancelEligibility();

        if (eligible) {
            cancelSection.classList.remove('hidden');
            cancelDoneSection.classList.add('hidden');
            updateTimerDisplay(minutesLeft);
            startCancelTimer();
        } else {
            cancelSection.classList.add('hidden');
            cancelDoneSection.classList.add('hidden');
            stopCancelTimer();
        }
    }

    /**
     * Update the timer display text.
     */
    function updateTimerDisplay(minutesLeft) {
        if (!cancelTimerText) return;

        if (minutesLeft <= 0) {
            cancelTimerText.textContent = 'Cancel window expired';
            if (btnCancelOrder) btnCancelOrder.disabled = true;
        } else {
            cancelTimerText.textContent = `Cancel available for ${formatCountdown(minutesLeft)}`;
            if (btnCancelOrder) btnCancelOrder.disabled = false;
        }
    }

    /**
     * Start the countdown timer (updates every second).
     */
    function startCancelTimer() {
        stopCancelTimer(); // Clear any existing timer

        cancelTimerInterval = setInterval(() => {
            const { eligible, minutesLeft } = getCancelEligibility();
            updateTimerDisplay(minutesLeft);

            if (!eligible) {
                cancelSection.classList.add('hidden');
                stopCancelTimer();
            }
        }, 1000);
    }

    /**
     * Stop the countdown timer.
     */
    function stopCancelTimer() {
        if (cancelTimerInterval) {
            clearInterval(cancelTimerInterval);
            cancelTimerInterval = null;
        }
    }

    // ========================================
    // CANCEL MODAL
    // ========================================

    /**
     * Open the cancel confirmation modal.
     */
    function openCancelModal() {
        if (!cancelModalOverlay || !currentOrder) return;

        const refundAmount = Math.round(currentOrder.total);
        cancelRefundAmount.textContent = `₹${refundAmount}`;

        // Reset reason dropdown
        if (cancelReasonSelect) cancelReasonSelect.value = '';

        cancelModalOverlay.classList.remove('hidden');

        // Prevent body scroll while modal is open
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close the cancel confirmation modal.
     */
    function closeCancelModal() {
        if (!cancelModalOverlay) return;
        cancelModalOverlay.classList.add('hidden');
        document.body.style.overflow = '';
    }

    /**
     * Execute the cancel order API call.
     */
    async function executeCancel() {
        if (isCancelling) return;
        isCancelling = true;

        const email = getUserEmail();
        if (!email) {
            alert('Please log in to cancel your order.');
            isCancelling = false;
            return;
        }

        // Disable confirm button and show loading
        if (btnCancelConfirm) {
            btnCancelConfirm.disabled = true;
            btnCancelConfirm.textContent = 'Cancelling...';
        }

        const reason = cancelReasonSelect ? cancelReasonSelect.value : '';

        try {
            const sessionToken = localStorage.getItem('spoon-session-token');
            const response = await fetch(`${API_BASE}/api/orders/${currentOrder.id}/cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': email,
                    'x-session-token': sessionToken
                },
                body: JSON.stringify({ email, reason })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // Success — update UI
                console.log(`✅ Order cancelled. ${result.refundAmount} coins credited.`);
                closeCancelModal();

                // Update order state
                currentOrder.status = 'CANCELLED';
                currentOrder.refund_amount = result.refundAmount;
                currentOrder.cancelled_at = new Date().toISOString();

                // Update all UI components
                updateCancelUI();
                renderTimeline();

                // Stop polling — order is terminal
                clearInterval(pollingInterval);
                pollingInterval = null;

            } else {
                // Error — show user-friendly message
                const errorMsg = getErrorMessage(result.error, response.status);
                alert(errorMsg);
                console.error('❌ Cancel failed:', result.error);
            }

        } catch (err) {
            console.error('❌ Cancel request failed:', err);
            alert('Network error. Please check your connection and try again.');
        } finally {
            isCancelling = false;
            if (btnCancelConfirm) {
                btnCancelConfirm.disabled = false;
                btnCancelConfirm.textContent = 'Yes, Cancel Order';
            }
        }
    }

    /**
     * Convert API error codes to user-friendly messages.
     */
    function getErrorMessage(error, statusCode) {
        switch (statusCode) {
            case 400:
                if (error.includes('45 minutes')) return 'Too late to cancel — must cancel at least 45 minutes before pickup time.';
                if (error.includes('pre-orders')) return 'Only pre-orders can be cancelled.';
                if (error.includes('status')) return 'This order can no longer be cancelled.';
                return error;
            case 403:
                return 'You can only cancel your own orders.';
            case 404:
                return 'Order not found. It may have already been processed.';
            case 409:
                return 'Order status changed. Please refresh the page.';
            case 429:
                return 'You\'ve reached the daily cancellation limit (3 per day). Try again tomorrow.';
            default:
                return 'Something went wrong. Please try again.';
        }
    }

    // ========================================
    // EVENT LISTENERS
    // ========================================

    // Cancel button → open modal
    if (btnCancelOrder) {
        btnCancelOrder.addEventListener('click', () => {
            // Re-check eligibility right before showing modal
            const { eligible } = getCancelEligibility();
            if (!eligible) {
                cancelSection.classList.add('hidden');
                alert('Cancel window has expired.');
                return;
            }
            openCancelModal();
        });
    }

    // Modal "Go Back" button
    if (btnCancelBack) {
        btnCancelBack.addEventListener('click', closeCancelModal);
    }

    // Modal "Yes, Cancel Order" button
    if (btnCancelConfirm) {
        btnCancelConfirm.addEventListener('click', executeCancel);
    }

    // Close modal on overlay click (outside modal card)
    if (cancelModalOverlay) {
        cancelModalOverlay.addEventListener('click', (e) => {
            if (e.target === cancelModalOverlay) closeCancelModal();
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !cancelModalOverlay.classList.contains('hidden')) {
            closeCancelModal();
        }
    });

    // --- Core Logic ---

    /**
     * Fetches order by ID.
     * @param {string} orderId 
     * @returns {Promise<Object|null>} Order data or null.
     */
    async function getOrderById(orderId) {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .maybeSingle();

        if (error) {
            console.error('❌ Error fetching order:', error);
            return null;
        }

        return data;
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

        const status = currentOrder?.status || 'PENDING';
        const interval = getIntervalForStatus(status);

        if (interval === 0) {
            console.log('⏹️ No polling needed for status:', status);
            return;
        }

        console.log(`⏰ Starting adaptive polling for status "${status}" at ${interval}ms interval`);

        pollingInterval = setInterval(async () => {
            const params = new URLSearchParams(window.location.search);
            const orderId = params.get('id');

            const updatedOrder = await getOrderById(orderId);

            if (updatedOrder && updatedOrder.status !== currentOrder.status) {
                console.log('🔄 Status changed from', currentOrder.status, 'to', updatedOrder.status);
                const previousStatus = currentOrder.status;
                currentOrder = updatedOrder;
                renderTimeline();
                updateCancelUI();  // Re-evaluate cancel eligibility on status change

                const newInterval = getIntervalForStatus(currentOrder.status);
                const oldInterval = getIntervalForStatus(previousStatus);

                if (newInterval !== oldInterval) {
                    console.log(`🔄 Adjusting polling: ${oldInterval}ms → ${newInterval}ms`);
                    startAdaptivePolling(); // Restart with new interval
                    return;
                }
            }

            if (currentOrder.status === 'PICKED_UP' || currentOrder.status === 'CANCELLED') {
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
            alert('Order ID not found.');
            window.location.href = 'orders.html';
            return;
        }

        currentOrder = await getOrderById(orderId);

        if (!currentOrder) {
            alert('Order not found.');
            window.location.href = 'orders.html';
            return;
        }

        // Populate UI
        orderIdHeader.textContent = `#${currentOrder.id.substring(0, 8)}`;

        const totalItems = currentOrder.items.reduce((sum, item) => sum + item.quantity, 0);
        orderItemsCount.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;

        summaryItemList.innerHTML = currentOrder.items.map(item =>
            `<div class="summary-item">
                <span class="summary-item__name">${item.title} × ${item.quantity}</span>
                <span class="summary-item__price">₹${item.price * item.quantity}</span>
            </div>`
        ).join('');

        orderTotalValue.textContent = `₹${currentOrder.total}`;

        renderTimeline();
        updateCancelUI();  // Initialize cancel section

        if (currentOrder.status !== 'PICKED_UP' && currentOrder.status !== 'CANCELLED') {
            startAdaptivePolling();
        }
    }

    // --- Cleanup ---

    window.addEventListener('beforeunload', () => {
        clearInterval(pollingInterval);
        stopCancelTimer();
    });

    // --- Initialization ---
    loadOrderDetails();
});
