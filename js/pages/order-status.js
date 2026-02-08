/**
 * Spoon - Order Status Page Script
 *
 * Powers the detailed order status page.
 * - Fetches specific order from Supabase.
 * - Renders status timeline using HorizontalStepperRenderer.
 * - Polls for real-time updates.
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

    // --- App State ---
    let pollingInterval;
    let currentOrder;

    // --- Adaptive Polling Configuration ---
    // Intervals in milliseconds based on order status
    const POLLING_INTERVALS = {
        PENDING: 20000,    // 20s
        PLACED: 20000,     // 20s
        PREPARING: 20000,  // 20s
        COMPLETE: 3000,    // 3s (Counter Moment)
        PICKED_UP: 0       // No polling
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

                const newInterval = getIntervalForStatus(currentOrder.status);
                const oldInterval = getIntervalForStatus(previousStatus);

                if (newInterval !== oldInterval) {
                    console.log(`🔄 Adjusting polling: ${oldInterval}ms → ${newInterval}ms`);
                    startAdaptivePolling(); // Restart with new interval
                    return;
                }
            }

            if (currentOrder.status === 'PICKED_UP') {
                console.log('✅ Order picked up, stopping polling');
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

        if (currentOrder.status !== 'PICKED_UP') {
            startAdaptivePolling();
        }
    }

    // --- Event Listeners ---

    window.addEventListener('beforeunload', () => {
        clearInterval(pollingInterval);
    });

    // --- Initialization ---
    loadOrderDetails();
});
