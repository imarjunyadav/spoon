/**
 * Spoon - Orders Page Script
 * 
 * Displays the user's order history.
 * - Fetches orders from Supabase.
 * - Displays orders chronologically.
 * - Handles navigation to order status.
 */

document.addEventListener('DOMContentLoaded', async () => {

  // --- Authentication Check ---
  if (localStorage.getItem('spoon-is-logged-in') !== 'true') {
    window.location.replace('login.html');
    return;
  }

  // --- Supabase Client ---
  let supabase = null;

  // --- DOM Elements ---
  const ordersListContainer = document.getElementById('orders-list-container');
  const emptyOrdersView = document.getElementById('empty-orders-view');
  const toastNotification = document.getElementById('toast-notification');
  const cartBadge = document.getElementById('cart-badge');

  // User Data
  const userData = JSON.parse(localStorage.getItem('spoon-user') || '{}');
  let userEmail = userData.email || localStorage.getItem('spoon-user-email');

  if (!userEmail) {
    console.error('❌ User email not found, redirecting to login');
    window.location.replace('login.html');
    return;
  }

  // --- Helper Functions ---

  function normalizePreorderTime(timeStr) {
    if (!timeStr) return null;

    const timestamp = new Date(timeStr).getTime();
    if (!isNaN(timestamp)) {
      return timeStr;
    }

    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const [_, h, m, s] = timeMatch;
      const now = new Date();
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(h, 10), parseInt(m, 10), parseInt(s || '0', 10));
      return date.toISOString();
    }

    return null;
  }

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

  function getStatusClass(status) {
    const statusMap = {
      'PENDING': 'status--preparing',
      'PLACED': 'status--preparing',
      'PREPARING': 'status--preparing',
      'COMPLETE': 'status--ready',
      'PICKED_UP': 'status--completed'
    };
    return statusMap[status] || 'status--preparing';
  }

  function getStatusDisplayName(status) {
    const displayMap = {
      'PENDING': 'Preparing',
      'PLACED': 'Preparing',
      'PREPARING': 'Preparing',
      'COMPLETE': 'Ready',
      'PICKED_UP': 'Picked Up'
    };
    return displayMap[status] || 'Preparing';
  }

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

  function showToast(message) {
    toastNotification.textContent = message;
    toastNotification.classList.add('show');

    setTimeout(() => {
      toastNotification.classList.remove('show');
    }, 3000);
  }

  // --- Render Functions ---

  function renderOrders(orders) {
    ordersListContainer.innerHTML = '';

    if (!orders || orders.length === 0) {
      ordersListContainer.classList.add('hidden');
      emptyOrdersView.classList.remove('hidden');
      return;
    }

    ordersListContainer.classList.remove('hidden');
    emptyOrdersView.classList.add('hidden');

    orders.forEach(order => {
      const orderCard = createOrderCard(order);
      ordersListContainer.appendChild(orderCard);
    });
  }

  function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';

    const totalItems = order.items ? order.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
    const orderDate = formatDate(order.created_at);
    const statusClass = getStatusClass(order.status);
    const statusDisplayName = getStatusDisplayName(order.status);

    card.innerHTML = `
      <div class="order-card__header">
        <div class="order-card__header-left">
          <span class="order-card__id">#${order.id.substring(0, 8)}</span>
          <span class="order-card__status ${statusClass}">${statusDisplayName}</span>
        </div>
        <button class="btn--view-details">
          Track Order
        </button>
      </div>
      
      <div class="order-card__body">
        <div class="order-card__detail-group">
          <span class="label">Items</span>
          <span class="value">${totalItems} item${totalItems !== 1 ? 's' : ''}</span>
        </div>
        <div class="order-card__detail-group">
          <span class="label">Order Date</span>
          <span class="value">${orderDate}</span>
        </div>
        <div class="order-card__detail-group align-right">
          <span class="label">Amount</span>
          <span class="value">₹${order.total}</span>
        </div>
      </div>
      
      ${order.preorder_time ? `
        <div class="order-card__preorder-info">
          <i class="fa-solid fa-clock"></i>
          <span>Scheduled for ${formatDate(order.preorder_time)}</span>
        </div>
      ` : ''}
    `;

    const viewDetailsBtn = card.querySelector('.btn--view-details');
    viewDetailsBtn.addEventListener('click', () => {
      window.location.href = `order-status.html?id=${order.id}`;
    });

    return card;
  }

  // --- Data Fetching ---

  async function loadOrders() {
    try {
      console.log('📝 Fetching orders for email:', userEmail);

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_email', userEmail)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching orders:', error);
        showToast('Failed to load orders.');
        ordersListContainer.classList.add('hidden');
        emptyOrdersView.classList.remove('hidden');
        return;
      }

      const normalizedData = (data || []).map(order => {
        if (order.preorder_time) {
          const normalized = normalizePreorderTime(order.preorder_time);
          if (normalized) {
            order.preorder_time = normalized;
          }
        }
        return order;
      });

      renderOrders(normalizedData);

    } catch (error) {
      console.error('❌ Unexpected error:', error);
      showToast('Something went wrong.');
      ordersListContainer.classList.add('hidden');
      emptyOrdersView.classList.remove('hidden');
    }
  }

  // --- Initialization ---

  async function init() {
    await window.waitForConfig();
    supabase = window.getSupabaseClient();

    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      showToast('Failed to connect to database. Please refresh.');
      return;
    }

    updateCartBadge();
    await loadOrders();
  }

  // Cross-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'spoon-cart') {
      updateCartBadge();
    }
  });

  init();
});
