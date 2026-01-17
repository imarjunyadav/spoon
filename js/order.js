/**
 * ========================================
 * SPOON - ORDERS PAGE JAVASCRIPT
 * ========================================
 * 
 * PURPOSE:
 * This file displays the user's order history from Supabase database.
 * 
 * WHAT IT DOES:
 * 1. Fetches orders from Supabase for current user
 * 2. Displays orders in chronological order (newest first)
 * 3. Shows order status with color-coded badges
 * 4. Allows clicking to view detailed order status
 * 5. Shows success toast if redirected from payment
 * 
 * KEY CONCEPTS FOR INTERNS:
 * - Supabase queries: Fetching data from cloud database
 * - Array filtering: Separating orders by status
 * - DOM manipulation: Creating order cards dynamically
 * - Date formatting: Making timestamps readable
 * - Toast notifications: Temporary success messages
 */

// Wait for page to load
document.addEventListener('DOMContentLoaded', async () => {
  
  // ========================================
  // SECTION 1: AUTHENTICATION CHECK
  // ========================================
  
  /**
   * SECURITY CHECK
   * Only logged-in users can view orders
   */
  if (localStorage.getItem('spoon-is-logged-in') !== 'true') {
    window.location.replace('login.html');
    return;
  }

  // ========================================
  // SECTION 2: SUPABASE DATABASE SETUP
  // ========================================
  
  /**
   * SUPABASE CLIENT
   * Uses centralized config from js/config.js
   * Config is loaded from backend API for security
   * 
   * LEARNING NOTE:
   * - Credentials are fetched from backend, not hardcoded
   * - This prevents exposing keys in source code
   */
  let supabase = null;

  // ========================================
  // SECTION 3: DOM ELEMENT REFERENCES
  // ========================================
  
  const ordersListContainer = document.getElementById('orders-list-container');
  const emptyOrdersView = document.getElementById('empty-orders-view');
  const toastNotification = document.getElementById('toast-notification');
  const cartBadge = document.getElementById('cart-badge');
  
  // Get user's phone number for filtering orders
  const userPhoneNumber = localStorage.getItem('spoon-user-phone');

  // ========================================
  // SECTION 4: HELPER FUNCTIONS
  // ========================================
  
  /**
   * FUNCTION: formatDate
   * 
   * PURPOSE: Convert ISO date string to readable format
   * 
   * PARAMETERS:
   * @param {string} isoString - ISO date string (e.g., "2024-12-07T10:30:00Z")
   * 
   * RETURNS: Formatted date string (e.g., "Dec 7, 2024 at 10:30 AM")
   */
  function formatDate(isoString) {
    const date = new Date(isoString);
    const options = { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    return date.toLocaleString('en-US', options).replace(',', ' at');
  }

  /**
   * FUNCTION: getStatusClass
   * 
   * PURPOSE: Get CSS class for order status badge
   * 
   * PARAMETERS:
   * @param {string} status - Order status (e.g., "PENDING", "PREPARING")
   * 
   * RETURNS: CSS class name for styling
   */
  function getStatusClass(status) {
    const statusMap = {
      'PENDING': 'status--placed',
      'Order Placed': 'status--placed',
      'Preparing': 'status--preparing',
      'Ready for Pickup': 'status--ready',
      'Completed': 'status--completed'
    };
    return statusMap[status] || 'status--placed';
  }

  /**
   * FUNCTION: updateCartBadge
   * 
   * PURPOSE: Update cart badge count in navigation
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

  /**
   * FUNCTION: showToast
   * 
   * PURPOSE: Show success toast notification
   * 
   * PARAMETERS:
   * @param {string} message - Message to display
   */
  function showToast(message) {
    toastNotification.textContent = message;
    toastNotification.classList.add('show');
    
    // Hide after 3 seconds
    setTimeout(() => {
      toastNotification.classList.remove('show');
    }, 3000);
  }

  // ========================================
  // SECTION 5: RENDER FUNCTIONS
  // ========================================
  
  /**
   * FUNCTION: renderOrders
   * 
   * PURPOSE: Display all orders in the UI
   * 
   * PARAMETERS:
   * @param {Array} orders - Array of order objects from database
   * 
   * HOW IT WORKS:
   * 1. Checks if orders array is empty
   * 2. If empty, shows empty state view
   * 3. If has orders, creates a card for each order
   * 4. Adds click handler to view order details
   */
  function renderOrders(orders) {
    // Clear existing content
    ordersListContainer.innerHTML = '';
    
    // Handle empty state
    if (!orders || orders.length === 0) {
      ordersListContainer.classList.add('hidden');
      emptyOrdersView.classList.remove('hidden');
      return;
    }

    // Show orders container
    ordersListContainer.classList.remove('hidden');
    emptyOrdersView.classList.add('hidden');

    // Create a card for each order
    orders.forEach(order => {
      const orderCard = createOrderCard(order);
      ordersListContainer.appendChild(orderCard);
    });
  }

  /**
   * FUNCTION: createOrderCard
   * 
   * PURPOSE: Create HTML element for a single order
   * 
   * PARAMETERS:
   * @param {Object} order - Order object from database
   * 
   * RETURNS: HTML div element with order details
   * 
   * HOW IT WORKS:
   * 1. Creates card container
   * 2. Builds HTML with order details
   * 3. Adds click handler for navigation
   * 4. Returns completed element
   */
  function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    
    // Calculate total items
    const totalItems = order.items ? order.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
    
    // Format date
    const orderDate = formatDate(order.created_at);
    
    // Get status class for badge styling
    const statusClass = getStatusClass(order.status);
    
    // Build card HTML
    card.innerHTML = `
      <div class="order-card__header">
        <span class="order-card__id">#${order.id.substring(0, 8)}</span>
        <span class="order-card__status ${statusClass}">${order.status || 'Pending'}</span>
      </div>
      
      <div class="order-card__body">
        <div class="order-card__detail-group">
          <span class="label">Items</span>
          <span class="value">${totalItems} item${totalItems !== 1 ? 's' : ''}</span>
        </div>
        <div class="order-card__detail-group">
          <span class="label">Placed</span>
          <span class="value">${orderDate}</span>
        </div>
        <div class="order-card__detail-group align-right">
          <span class="label">Total</span>
          <span class="value">₹${order.total}</span>
        </div>
      </div>
      
      ${order.preorder_time ? `
        <div class="order-card__preorder-info">
          <i class="fa-solid fa-clock"></i>
          <span>Scheduled for ${formatDate(order.preorder_time)}</span>
        </div>
      ` : ''}
      
      <div class="order-card__footer">
        <button class="btn--view-details">
          View Details
          <i class="fa-solid fa-arrow-right"></i>
        </button>
      </div>
    `;
    
    // Add click handler to view details button
    const viewDetailsBtn = card.querySelector('.btn--view-details');
    viewDetailsBtn.addEventListener('click', () => {
      // Navigate to order status page with order ID
      window.location.href = `order-status.html?id=${order.id}`;
    });
    
    return card;
  }

  // ========================================
  // SECTION 6: DATA FETCHING
  // ========================================
  
  /**
   * FUNCTION: loadOrders
   * 
   * PURPOSE: Fetch orders from Supabase database
   * 
   * HOW IT WORKS:
   * 1. Queries Supabase for orders matching user's phone
   * 2. Orders by creation date (newest first)
   * 3. Handles errors gracefully
   * 4. Renders orders in UI
   * 
   * LEARNING NOTE:
   * This is an async function because it waits for database response
   */
  async function loadOrders() {
    try {
      // Query Supabase for user's orders
      // Filter by phone_number and order by created_at DESC (newest first)
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('phone_number', userPhoneNumber)
        .order('created_at', { ascending: false });

      // Handle errors
      if (error) {
        console.error('❌ Error fetching orders:', error);
        showToast('Failed to load orders. Please check your connection and try again.');
        // Show empty state on error
        ordersListContainer.classList.add('hidden');
        emptyOrdersView.classList.remove('hidden');
        return;
      }

      // Render orders
      renderOrders(data);
      
    } catch (error) {
      console.error('❌ Unexpected error:', error);
      showToast('Something went wrong. Please try again later.');
      ordersListContainer.classList.add('hidden');
      emptyOrdersView.classList.remove('hidden');
    }
  }

  // ========================================
  // SECTION 7: INITIALIZATION
  // ========================================
  
  /**
   * FUNCTION: init
   * 
   * PURPOSE: Initialize the orders page
   * 
   * HOW IT WORKS:
   * 1. Waits for config to load from backend
   * 2. Updates cart badge
   * 3. Checks for success toast flag
   * 4. Loads orders from database
   */
  async function init() {
    // Wait for config to load from backend API
    await window.waitForConfig();
    
    // Get Supabase client from centralized config
    supabase = window.getSupabaseClient();
    
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      showToast('Failed to connect to database. Please refresh.');
      return;
    }
    
    // Update cart badge
    updateCartBadge();
    
    // Load orders from database
    await loadOrders();
  }

  // ========================================
  // SECTION 8: CROSS-TAB SYNCHRONIZATION
  // ========================================
  
  /**
   * STORAGE EVENT LISTENER
   * 
   * PURPOSE: Update cart badge when cart changes in another tab/window
   * 
   * HOW IT WORKS:
   * - Listens for localStorage changes from other tabs
   * - Updates badge when 'spoon-cart' changes
   * - Enables real-time sync across tabs
   */
  window.addEventListener('storage', (e) => {
    // Only update if cart data changed
    if (e.key === 'spoon-cart') {
      updateCartBadge();
    }
  });
  
  // Start the app!
  init();
});
