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
    const summaryAmount = document.getElementById('summary-amount');
    const summaryPlacedAt = document.getElementById('summary-placed-at');
    const summaryLastUpdated = document.getElementById('summary-last-updated');
    const toggleItemsBtn = document.getElementById('toggle-items-btn');
    const collapsibleContainer = document.getElementById('collapsible-items-container');
    const summaryItemList = document.getElementById('summary-item-list');
    const timelineContainer = document.getElementById('timeline-container');

    // --- 2. APP STATE ---
    let pollingInterval;
    let currentOrder;

    // The master list of all possible stages for an order.
    // Map database status to display stages
    const orderStages = [
        { dbStatus: 'PENDING', status: 'Order Placed', description: 'We have received your order.', icon: 'fa-receipt' },
        { dbStatus: 'PREPARING', status: 'Preparing', description: 'The kitchen has started preparing your order.', icon: 'fa-utensils' },
        { dbStatus: 'COMPLETE', status: 'Ready for Pickup', description: 'Your order is ready at the counter.', icon: 'fa-bell' },
        { dbStatus: 'PICKED_UP', status: 'Completed', description: 'Your order has been collected. Enjoy!', icon: 'fa-check-circle' }
    ];

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
     * Renders the dynamic timeline UI based on the order's current progress.
     * Status mapping:
     * - PENDING: Only first step highlighted
     * - PREPARING: First two steps highlighted
     * - COMPLETE: First three steps highlighted (ready for pickup)
     * - PICKED_UP: All steps complete
     */
    function renderTimeline() {
        const currentStatus = currentOrder.status || 'PENDING';
        const currentStatusIndex = orderStages.findIndex(s => s.dbStatus === currentStatus);

        timelineContainer.innerHTML = ''; // Clear previous state

        orderStages.forEach((stage, index) => {
            let statusClass = 'timeline-step--pending';
            let timestamp = '--:--';

            // Determine step status based on current order status
            if (index < currentStatusIndex) {
                // Past steps - completed
                statusClass = 'timeline-step--complete';
                timestamp = formatTime(new Date(currentOrder.created_at));
            } else if (index === currentStatusIndex) {
                // Current step - active
                statusClass = 'timeline-step--current';
                timestamp = formatTime(new Date(currentOrder.created_at));
            } else {
                // Future steps - pending
                statusClass = 'timeline-step--pending';
                timestamp = '--:--';
            }

            // Add inline pickup code for "Ready for Pickup" step when status is COMPLETE
            let pickupCodeHTML = '';
            if (stage.dbStatus === 'COMPLETE' && currentStatus === 'COMPLETE' && currentOrder.verification_code) {
                pickupCodeHTML = `<div class="pickup-inline" id="pickup-inline-code">${currentOrder.verification_code}</div>`;
            }

            const timelineStepHTML = `
                <div class="timeline-step ${statusClass}">
                    <div class="timeline-step__icon-container">
                        <div class="timeline-step__icon"><i class="fa-solid ${stage.icon}"></i></div>
                        <div class="timeline-step__line"></div>
                    </div>
                    <div class="timeline-step__content-card">
                        <h4 class="timeline-step__title">${stage.status}</h4>
                        <p class="timeline-step__description">${stage.description}</p>
                        <p class="timeline-step__timestamp">${timestamp}</p>
                        ${pickupCodeHTML}
                    </div>
                </div>
            `;
            timelineContainer.insertAdjacentHTML('beforeend', timelineStepHTML);
        });
    }

    /**
     * Polls Supabase for real-time status updates.
     */
    function startPollingForStatus() {
        clearInterval(pollingInterval); // Clear any existing intervals

        pollingInterval = setInterval(async () => {
            const params = new URLSearchParams(window.location.search);
            const orderId = params.get('id');

            // Fetch latest order data from Supabase
            const updatedOrder = await getOrderById(orderId);

            if (updatedOrder && updatedOrder.status !== currentOrder.status) {
                // Status has changed, update UI
                console.log('🔄 Status changed from', currentOrder.status, 'to', updatedOrder.status);
                currentOrder = updatedOrder;
                renderTimeline();
                summaryLastUpdated.textContent = formatTime(new Date());
            }

            // Stop polling if order is picked up
            if (currentOrder.status === 'PICKED_UP') {
                console.log('✅ Order picked up, stopping polling');
                clearInterval(pollingInterval);
            }

        }, 5000); // Poll every 5 seconds
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
        summaryAmount.textContent = `₹${currentOrder.total}`;
        summaryPlacedAt.textContent = formatTime(new Date(currentOrder.created_at));
        summaryLastUpdated.textContent = formatTime(new Date(currentOrder.created_at));

        // Populate item list
        summaryItemList.innerHTML = currentOrder.items.map(item =>
            `<div class="summary-item"><span>${item.title} (x${item.quantity})</span> <strong>₹${item.price * item.quantity}</strong></div>`
        ).join('');

        // Render the timeline
        renderTimeline();

        // Start polling for updates if the order is not yet picked up
        if (currentOrder.status !== 'PICKED_UP') {
            startPollingForStatus();
        }
    }

    // --- 5. EVENT LISTENERS ---

    toggleItemsBtn.addEventListener('click', () => {
        collapsibleContainer.classList.toggle('open');
    });

    // Clean up the polling interval when the user navigates away
    window.addEventListener('beforeunload', () => {
        clearInterval(pollingInterval);
    });

    // --- 6. INITIALIZATION ---
    loadOrderDetails();
});
