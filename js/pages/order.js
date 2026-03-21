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
  const btnDeleteMode = document.getElementById('btn-delete-mode');
  const deleteActionBar = document.getElementById('delete-action-bar');
  const selectAllCheckbox = document.getElementById('select-all-checkbox');
  const btnDeleteConfirm = document.getElementById('btn-delete-confirm');
  const deleteCountEl = document.getElementById('delete-count');

  // --- Selection Mode State ---
  let isSelectMode = false;
  let selectedOrderIds = new Set();
  const DELETABLE_STATUSES = ['completed', 'cancelled'];
  let allOrders = []; // Cache for current orders data

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
    if (!status) return 'status--preparing';
    const s = status.toLowerCase();
    const statusMap = {
      'pending': 'status--preparing',
      'placed': 'status--preparing',
      'kitchen': 'status--preparing',
      'preparing': 'status--preparing',
      'prepared': 'status--ready',
      'complete': 'status--completed',
      'completed': 'status--completed',
      'picked_up': 'status--completed',
      'cancelled': 'status--preparing' // Or add a cancelled class
    };
    return statusMap[s] || 'status--preparing';
  }

  function getStatusDisplayName(status) {
    if (!status) return 'Received';
    const s = status.toLowerCase();
    
    // Mapping Database (DB) Statuses to User-Friendly Display Names
    // 'pending' -> 'Received' (prevents user irritation from 'In Queue')
    // 'kitchen' -> 'Cooking'  
    // 'prepared' -> 'Ready'
    // 'completed' -> 'Collected'
    const displayMap = {
      'pending': 'Received',
      'placed': 'Received',     // Legacy fallback
      'kitchen': 'Cooking',
      'preparing': 'Cooking',   // Legacy fallback
      'prepared': 'Ready',
      'complete': 'Collected',  // Legacy fallback
      'completed': 'Collected',
      'picked_up': 'Collected', // Legacy fallback
      'cancelled': 'Cancelled'
    };
    return displayMap[s] || 'Received';
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
    card.dataset.orderId = order.id;
    card.dataset.status = order.status;

    const isDeletable = DELETABLE_STATUSES.includes(order.status);
    if (!isDeletable) {
      card.classList.add('non-deletable');
    }

    const totalItems = order.items ? order.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
    const orderDate = formatDate(order.created_at);
    const statusClass = getStatusClass(order.status);
    const statusDisplayName = getStatusDisplayName(order.status);

    // Use last 8 chars to avoid "wallet_1" prefix collision
    const displayId = order.id ? order.id.slice(-8).toUpperCase() : 'UNKNOWN';

    card.innerHTML = `
      <input type="checkbox" class="order-card__checkbox" data-order-id="${order.id}" ${!isDeletable ? 'disabled' : ''}>
      <div class="order-card__header">
        <div class="order-card__header-left">
          <span class="order-card__id">#${displayId}</span>
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

    // Checkbox interaction
    const checkbox = card.querySelector('.order-card__checkbox');
    if (isDeletable) {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          selectedOrderIds.add(order.id);
          card.classList.add('selected');
        } else {
          selectedOrderIds.delete(order.id);
          card.classList.remove('selected');
        }
        updateDeleteUI();
      });

      // Card click toggles checkbox in select mode
      card.addEventListener('click', (e) => {
        if (!isSelectMode) return;
        if (e.target.matches('.btn--view-details') || e.target.closest('.btn--view-details')) return;
        if (e.target === checkbox) return; // Don't double-toggle
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      });
    }

    const viewDetailsBtn = card.querySelector('.btn--view-details');
    viewDetailsBtn.addEventListener('click', (e) => {
      if (isSelectMode) {
        e.stopPropagation();
        return;
      }
      window.location.href = `order-status.html?id=${order.id}`;
    });

    return card;
  }

  // --- Data Fetching ---

  async function loadOrders() {
    try {
      console.log('📝 Fetching orders for email:', userEmail);
      const apiBaseUrl = window.SPOON_CONFIG?.API_BASE_URL || '';
      const sessionToken = localStorage.getItem('spoon-session-token');

      // Use Backend API (Proxy) to bypass RLS restrictions securely
      const response = await fetch(`${apiBaseUrl}/api/orders`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail,
          'x-session-token': sessionToken
        }
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('❌ Error fetching orders:', result.error);
        showToast('Failed to load orders.');
        ordersListContainer.classList.add('hidden');
        emptyOrdersView.classList.remove('hidden');
        return;
      }

      const orders = result.orders || [];

      const normalizedData = orders.map(order => {
        if (order.preorder_time) {
          const normalized = normalizePreorderTime(order.preorder_time);
          if (normalized) {
            order.preorder_time = normalized;
          }
        }
        return order;
      });

      allOrders = normalizedData;
      renderOrders(normalizedData);

      // Show delete button only if there are deletable orders
      const hasDeletable = normalizedData.some(o => DELETABLE_STATUSES.includes(o.status));
      if (btnDeleteMode) {
        btnDeleteMode.classList.toggle('hidden', !hasDeletable);
      }

    } catch (error) {
      console.error('❌ Unexpected error:', error);
      showToast('Something went wrong.');
      ordersListContainer.classList.add('hidden');
      emptyOrdersView.classList.remove('hidden');
    }
  }

  // --- Selection Mode ---

  function toggleSelectMode() {
    isSelectMode = !isSelectMode;
    selectedOrderIds.clear();

    ordersListContainer.classList.toggle('select-mode', isSelectMode);
    btnDeleteMode.classList.toggle('active', isSelectMode);
    deleteActionBar.classList.toggle('hidden', !isSelectMode);

    // Reset all checkboxes
    document.querySelectorAll('.order-card__checkbox').forEach(cb => {
      cb.checked = false;
    });
    document.querySelectorAll('.order-card.selected').forEach(card => {
      card.classList.remove('selected');
    });
    selectAllCheckbox.checked = false;

    updateDeleteUI();

    // Pause/resume polling
    if (isSelectMode) {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    } else {
      pollingInterval = setInterval(loadOrders, 10000);
    }
  }

  function updateDeleteUI() {
    const count = selectedOrderIds.size;
    deleteCountEl.textContent = count;
    btnDeleteConfirm.disabled = count === 0;

    // Update Select All checkbox state
    const deletableCards = document.querySelectorAll('.order-card:not(.non-deletable)');
    selectAllCheckbox.checked = deletableCards.length > 0 && count === deletableCards.length;
  }

  async function handleBatchDelete() {
    const ids = Array.from(selectedOrderIds);
    if (ids.length === 0) return;

    btnDeleteConfirm.disabled = true;
    btnDeleteConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Deleting...</span>';

    try {
      const apiBaseUrl = window.SPOON_CONFIG?.API_BASE_URL || '';
      const sessionToken = localStorage.getItem('spoon-session-token');

      const res = await fetch(`${apiBaseUrl}/api/orders/batch`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail,
          'x-session-token': sessionToken
        },
        body: JSON.stringify({ orderIds: ids })
      });

      const result = await res.json();

      if (result.success) {
        // Remove deleted cards from DOM
        ids.forEach(id => {
          const card = document.querySelector(`.order-card[data-order-id="${id}"]`);
          if (card) {
            card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            card.style.opacity = '0';
            card.style.transform = 'translateX(-20px)';
            setTimeout(() => card.remove(), 300);
          }
        });

        if (result.skippedIds && result.skippedIds.length > 0) {
          window.showToast(`${result.deletedCount} deleted, ${result.skippedIds.length} active orders skipped`, 'info');
        } else {
          window.showToast(`${result.deletedCount} order${result.deletedCount !== 1 ? 's' : ''} deleted`, 'success');
        }

        // Exit select mode after short delay for animation
        setTimeout(() => {
          toggleSelectMode();

          // Check if list is now empty
          const remaining = document.querySelectorAll('.order-card');
          if (remaining.length === 0) {
            ordersListContainer.classList.add('hidden');
            emptyOrdersView.classList.remove('hidden');
            btnDeleteMode.classList.add('hidden');
          }
        }, 400);
      } else {
        window.showAlertModal('Delete Failed', result.error || 'Failed to delete orders.');
        btnDeleteConfirm.disabled = false;
        btnDeleteConfirm.innerHTML = '<i class="fa-solid fa-trash-can"></i> <span>Delete (<span id="delete-count">' + ids.length + '</span>)</span>';
      }
    } catch (error) {
      console.error('Batch delete error:', error);
      window.showAlertModal('Network Error', 'Failed to delete orders. Please try again.');
      btnDeleteConfirm.disabled = false;
      btnDeleteConfirm.innerHTML = '<i class="fa-solid fa-trash-can"></i> <span>Delete (<span id="delete-count">' + ids.length + '</span>)</span>';
    }
  }

  // --- Event Listeners ---

  if (btnDeleteMode) {
    btnDeleteMode.addEventListener('click', toggleSelectMode);
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', () => {
      const deletableCheckboxes = document.querySelectorAll('.order-card:not(.non-deletable) .order-card__checkbox');
      deletableCheckboxes.forEach(cb => {
        cb.checked = selectAllCheckbox.checked;
        cb.dispatchEvent(new Event('change'));
      });
    });
  }

  if (btnDeleteConfirm) {
    btnDeleteConfirm.addEventListener('click', () => {
      const count = selectedOrderIds.size;
      window.showAlertModal(
        'Delete Orders',
        `Are you sure you want to permanently delete ${count} order${count !== 1 ? 's' : ''}? This cannot be undone.`,
        'fa-trash-can',
        handleBatchDelete
      );
    });
  }

  // --- Initialization ---

  let pollingInterval = null;

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

    // Start polling for real-time status updates every 10 seconds
    pollingInterval = setInterval(loadOrders, 10000);
  }

  // Cross-tab sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'spoon-cart') {
      updateCartBadge();
    }
  });

  // Cleanup polling
  window.addEventListener('beforeunload', () => {
    if (pollingInterval) clearInterval(pollingInterval);
  });

  init();
});
