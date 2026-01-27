/**
 * SPOON REDESIGN - ORDER STATUS PAGE JAVASCRIPT
 *
 * This script powers the detailed order status page.
 *
 * - Reads the Order ID from the URL query parameter.
 * - Fetches the specific order from Supabase database.
 * - Renders all order details into the UI placeholders.
 * - Dynamically builds and updates a vertical status timeline.
 * - Polls Supabase for real-time status updates.
 * - Shows verification code when order is ready for pickup.
 */
document.addEventListener('DOMContentLoaded', async () => {

    // Wait for config to load from backend API
    await window.waitForConfig();

    // --- SUPABASE SETUP ---
    // Use the globally initialized Supabase client from config.js
    const supabase = window.getSupabaseClient();
    
    if (!supabase) {
        console.error('❌ Supabase client not initialized');
        alert('Failed to connect to database. Please refresh.');
        return;
    }

    // --- 1. DOM ELEMENT REFERENCES (Matches our new HTML) ---
    const orderIdHeader = document.getElementById('status-order-id-header');
    const summaryItemList = document.getElementById('summary-item-list');
    const orderItemsCount = document.getElementById('order-items-count');
    const orderTotalValue = document.getElementById('order-total-value');
    const timelineContainer = document.getElementById('timeline-container');

    // --- 2. APP STATE ---
    let pollingInterval;
    let currentOrder;

    // --- ADAPTIVE POLLING CONFIGURATION ---
    // Polling intervals in milliseconds based on order status
    // Requirements: 1.1, 1.2, 1.3
    const POLLING_INTERVALS = {
        PENDING: 20000,    // 20 seconds - user is waiting/walking
        PLACED: 20000,     // 20 seconds - same as PENDING
        PREPARING: 20000,  // 20 seconds - kitchen is working
        COMPLETE: 3000,    // 3 seconds - Counter Moment (critical for fast pickup confirmation)
        PICKED_UP: 0       // No polling - order complete
    };

    /**
     * Get the appropriate polling interval for a given order status.
     * Implements hybrid polling strategy for performance optimization.
     * 
     * @param {string} status - Order status ('PENDING'|'PLACED'|'PREPARING'|'COMPLETE'|'PICKED_UP')
     * @returns {number} - Polling interval in milliseconds (0 = no polling)
     * 
     * Requirements: 1.1, 1.2, 1.3
     */
    function getIntervalForStatus(status) {
        // Only check own properties to avoid prototype pollution
        if (Object.prototype.hasOwnProperty.call(POLLING_INTERVALS, status)) {
            return POLLING_INTERVALS[status];
        }
        // Default to PENDING interval for unknown statuses
        return POLLING_INTERVALS.PENDING;
    }

    // The master list of all possible stages for an order.
    // Now using HorizontalStepperRenderer for modern horizontal layout
    // Requirements: 2.1, 2.3, 2.4

    // --- 3. HELPER FUNCTIONS ---

    // Formats a date object into a simple time string like "5:30 PM"
    const formatTime = (date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });

    // --- 4. CORE LOGIC ---

    /**
     * Fetches a specific order from Supabase by its ID.
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
     * Renders the horizontal stepper UI and hero section.
     * Uses HorizontalStepperRenderer for modern delivery-app style layout.
     * 
     * Visual layout:
     * - Horizontal progress bar at top with 4 steps
     * - Hero verification code in center (only visible for COMPLETE/PICKED_UP)
     * - Completed steps: Green (#2E7D32)
     * - Pending steps: Theme red (#eb1700)
     * 
     * Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2
     */
    function renderTimeline() {
        timelineContainer.innerHTML = ''; // Clear previous state

        // Render horizontal stepper
        const stepperHTML = HorizontalStepperRenderer.renderStepper(currentOrder);
        
        // Render hero section (verification code or waiting message)
        const heroHTML = HorizontalStepperRenderer.renderHeroCode(currentOrder);

        timelineContainer.innerHTML = stepperHTML + heroHTML;
    }

    /**
     * Starts adaptive polling for order status updates.
     * Uses different polling intervals based on order status:
     * - PENDING/PLACED/PREPARING: 20 seconds (user is waiting)
     * - COMPLETE: 3 seconds (Counter Moment - critical for fast pickup confirmation)
     * - PICKED_UP: No polling (order complete)
     * 
     * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
     */
    function startAdaptivePolling() {
        // Clear any existing interval first
        clearInterval(pollingInterval);
        pollingInterval = null;

        const status = currentOrder?.status || 'PENDING';
        const interval = getIntervalForStatus(status);

        // Don't start polling if interval is 0 (PICKED_UP status)
        if (interval === 0) {
            console.log('⏹️ No polling needed for status:', status);
            return;
        }

        console.log(`⏰ Starting adaptive polling for status "${status}" at ${interval}ms interval`);

        pollingInterval = setInterval(async () => {
            const params = new URLSearchParams(window.location.search);
            const orderId = params.get('id');

            // Fetch latest order data from Supabase
            const updatedOrder = await getOrderById(orderId);

            if (updatedOrder && updatedOrder.status !== currentOrder.status) {
                // Status has changed, update UI
                console.log('🔄 Status changed from', currentOrder.status, 'to', updatedOrder.status);
                const previousStatus = currentOrder.status;
                currentOrder = updatedOrder;
                renderTimeline();

                // Adjust polling interval if status changed (Requirements: 1.4)
                const newInterval = getIntervalForStatus(currentOrder.status);
                const oldInterval = getIntervalForStatus(previousStatus);
                
                if (newInterval !== oldInterval) {
                    console.log(`🔄 Adjusting polling: ${oldInterval}ms → ${newInterval}ms`);
                    startAdaptivePolling(); // Restart with new interval
                    return; // Exit current callback since we restarted
                }
            }

            // Stop polling if order is picked up (Requirements: 1.3)
            if (currentOrder.status === 'PICKED_UP') {
                console.log('✅ Order picked up, stopping polling');
                clearInterval(pollingInterval);
                pollingInterval = null;
            }

        }, interval);
    }


    /**
     * Main function to load and display all order details.
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

        // --- Populate the UI ---
        orderIdHeader.textContent = `#${currentOrder.id.substring(0, 8)}`;

        // Calculate total items count
        const totalItems = currentOrder.items.reduce((sum, item) => sum + item.quantity, 0);
        orderItemsCount.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;

        // Populate item list
        summaryItemList.innerHTML = currentOrder.items.map(item =>
            `<div class="summary-item">
                <span class="summary-item__name">${item.title} × ${item.quantity}</span>
                <span class="summary-item__price">₹${item.price * item.quantity}</span>
            </div>`
        ).join('');
        
        // Display total
        orderTotalValue.textContent = `₹${currentOrder.total}`;

        // Render the timeline
        renderTimeline();

        // Start adaptive polling for updates if the order is not yet picked up
        // Requirements: 1.1, 1.2, 1.3
        if (currentOrder.status !== 'PICKED_UP') {
            startAdaptivePolling();
        }
    }

    // --- 5. EVENT LISTENERS ---

    // Clean up the polling interval when the user navigates away
    window.addEventListener('beforeunload', () => {
        clearInterval(pollingInterval);
    });

    // --- 6. INITIALIZATION ---
    loadOrderDetails();
});
