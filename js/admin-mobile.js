/**
 * Admin Mobile Dashboard
 * Mobile-first admin interface for kitchen and counter staff
 * 
 * Requirements: 2.3, 2.5, 10.2
 */

// ============================================
// STATE MANAGEMENT
// ============================================

const AdminState = {
  // Current active tab
  activeTab: 'items',
  
  // Order data
  orders: [],
  menuItems: [],
  
  // Filter state
  selectedItemFilter: null,
  searchQuery: '',
  
  // Connection state
  connectionStatus: 'realtime', // 'realtime' | 'polling' | 'disconnected'
  
  // Pending actions (for optimistic updates)
  pendingActions: new Map(),
  
  // UI state
  isStockPanelOpen: false,
  confirmDialog: null, // { orderId, action, previousStatus }
  
  // Items tab "told" tracking - stores last communicated quantity per item
  // Key: item name, Value: quantity that was last told to kitchen
  toldCounts: {},
  
  // Pending "told" actions (for optimistic updates)
  pendingToldActions: new Set(),
  
  // Stock panel state
  stockSearchQuery: '',
  expandedCategories: new Set(), // Track which categories are expanded
  
  // Active orders sort
  activeOrdersSort: 'oldest' // 'oldest' | 'newest' | 'costly' | 'quantity'
};

// Supabase client reference
let supabase = null;
let retryCount = 0;
const MAX_RETRIES = 3;

// ============================================
// DOM REFERENCES
// ============================================

const DOM = {
  // Tabs
  tabs: null,
  tabItems: null,
  tabActive: null,
  tabCompleted: null,
  
  // Views
  views: null,
  itemsView: null,
  activeView: null,
  completedView: null,
  
  // Lists
  itemsList: null,
  activeOrdersList: null,
  completedOrdersList: null,
  stockItemsList: null,
  
  // Badges
  badgeItems: null,
  badgeActive: null,
  badgeCompleted: null,
  
  // Other elements
  connectionStatus: null,
  filterIndicator: null,
  filterItemName: null,
  clearFilterBtn: null,
  searchInput: null,
  searchClearBtn: null,
  stockFab: null,
  stockPanel: null,
  stockBackdrop: null,
  stockCloseBtn: null,
  confirmDialog: null,
  confirmBackdrop: null,
  confirmTitle: null,
  confirmMessage: null,
  confirmOrderId: null,
  confirmCancelBtn: null,
  confirmActionBtn: null,
  toast: null,
  toastMessage: null,
  loadingOverlay: null,
  errorOverlay: null,
  accessDeniedOverlay: null,
  retryBtn: null,
  
  // Empty states
  itemsEmpty: null,
  activeEmpty: null,
  completedEmpty: null,
  searchNoResults: null
};


// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize DOM references
 */
function initDOMReferences() {
  // Tabs
  DOM.tabs = document.querySelectorAll('.admin-tab');
  DOM.tabItems = document.getElementById('tab-items');
  DOM.tabActive = document.getElementById('tab-active');
  DOM.tabCompleted = document.getElementById('tab-completed');
  
  // Views
  DOM.views = document.querySelectorAll('.admin-view');
  DOM.itemsView = document.getElementById('items-view');
  DOM.activeView = document.getElementById('active-view');
  DOM.completedView = document.getElementById('completed-view');
  
  // Lists
  DOM.itemsList = document.getElementById('items-list');
  DOM.activeOrdersList = document.getElementById('active-orders-list');
  DOM.completedOrdersList = document.getElementById('completed-orders-list');
  DOM.stockItemsList = document.getElementById('stock-items-list');
  
  // Active orders sort
  DOM.activeSortSelect = document.getElementById('active-sort-select');
  
  // Badges
  DOM.badgeItems = document.getElementById('badge-items');
  DOM.badgeActive = document.getElementById('badge-active');
  DOM.badgeCompleted = document.getElementById('badge-completed');
  
  // Connection status
  DOM.connectionStatus = document.getElementById('connection-status');
  
  // Filter
  DOM.filterIndicator = document.getElementById('filter-indicator');
  DOM.filterItemName = document.getElementById('filter-item-name');
  DOM.clearFilterBtn = document.getElementById('clear-filter-btn');
  
  // Search
  DOM.searchInput = document.getElementById('verification-search');
  DOM.searchClearBtn = document.getElementById('search-clear-btn');
  
  // Stock panel
  DOM.stockFab = document.getElementById('stock-fab');
  DOM.stockPanel = document.getElementById('stock-panel');
  DOM.stockBackdrop = document.getElementById('stock-backdrop');
  DOM.stockCloseBtn = document.getElementById('stock-close-btn');
  DOM.stockSearchInput = document.getElementById('stock-search-input');
  DOM.stockSearchClear = document.getElementById('stock-search-clear');
  
  // Confirm dialog
  DOM.confirmDialog = document.getElementById('confirm-dialog');
  DOM.confirmBackdrop = document.getElementById('confirm-backdrop');
  DOM.confirmTitle = document.getElementById('confirm-title');
  DOM.confirmMessage = document.getElementById('confirm-message');
  DOM.confirmOrderId = document.getElementById('confirm-order-id');
  DOM.confirmCancelBtn = document.getElementById('confirm-cancel-btn');
  DOM.confirmActionBtn = document.getElementById('confirm-action-btn');
  
  // Toast
  DOM.toast = document.getElementById('toast');
  DOM.toastMessage = document.getElementById('toast-message');
  
  // Overlays
  DOM.loadingOverlay = document.getElementById('loading-overlay');
  DOM.errorOverlay = document.getElementById('error-overlay');
  DOM.accessDeniedOverlay = document.getElementById('access-denied-overlay');
  DOM.retryBtn = document.getElementById('retry-btn');
  
  // Settings menu (Requirements: 13.5)
  DOM.settingsBtn = document.getElementById('settings-btn');
  DOM.settingsMenu = document.getElementById('settings-menu');
  DOM.logoutBtn = document.getElementById('logout-btn');
  DOM.adminUser = document.getElementById('admin-user');
  
  // Session prompt (Requirements: 13.1, 13.2)
  DOM.sessionPrompt = document.getElementById('session-prompt');
  DOM.reauthBtn = document.getElementById('reauth-btn');
  
  // Empty states
  DOM.itemsEmpty = document.getElementById('items-empty');
  DOM.activeEmpty = document.getElementById('active-empty');
  DOM.completedEmpty = document.getElementById('completed-empty');
  DOM.searchNoResults = document.getElementById('search-no-results');
}

/**
 * Initialize event listeners
 */
function initEventListeners() {
  // Tab switching (Requirements: 2.3)
  DOM.tabs.forEach(tab => {
    tab.addEventListener('click', () => handleTabSwitch(tab.dataset.view));
  });
  
  // Filter clear
  if (DOM.clearFilterBtn) {
    DOM.clearFilterBtn.addEventListener('click', clearItemFilter);
  }
  
  // Active orders sort
  if (DOM.activeSortSelect) {
    DOM.activeSortSelect.addEventListener('change', handleActiveOrdersSort);
  }
  
  // Search input (Requirements: 12.2)
  if (DOM.searchInput) {
    DOM.searchInput.addEventListener('input', debounce(handleSearchInput, 150));
  }
  
  if (DOM.searchClearBtn) {
    DOM.searchClearBtn.addEventListener('click', clearSearch);
  }
  
  // Stock panel
  if (DOM.stockFab) {
    DOM.stockFab.addEventListener('click', openStockPanel);
  }
  
  if (DOM.stockCloseBtn) {
    DOM.stockCloseBtn.addEventListener('click', closeStockPanel);
  }
  
  if (DOM.stockBackdrop) {
    DOM.stockBackdrop.addEventListener('click', closeStockPanel);
  }
  
  // Stock search
  if (DOM.stockSearchInput) {
    DOM.stockSearchInput.addEventListener('input', debounce(handleStockSearch, 150));
  }
  
  if (DOM.stockSearchClear) {
    DOM.stockSearchClear.addEventListener('click', clearStockSearch);
  }
  
  // Confirm dialog
  if (DOM.confirmCancelBtn) {
    DOM.confirmCancelBtn.addEventListener('click', closeConfirmDialog);
  }
  
  if (DOM.confirmBackdrop) {
    DOM.confirmBackdrop.addEventListener('click', closeConfirmDialog);
  }
  
  // Retry button
  if (DOM.retryBtn) {
    DOM.retryBtn.addEventListener('click', retryVerification);
  }
  
  // Settings menu (Requirements: 13.5)
  if (DOM.settingsBtn) {
    DOM.settingsBtn.addEventListener('click', toggleSettingsMenu);
  }
  
  if (DOM.logoutBtn) {
    DOM.logoutBtn.addEventListener('click', handleLogout);
  }
  
  // Re-authentication button (Requirements: 13.2)
  if (DOM.reauthBtn) {
    DOM.reauthBtn.addEventListener('click', handleReauth);
  }
  
  // Close settings menu when clicking outside
  document.addEventListener('click', handleDocumentClick);
  
  // Keyboard support for dialogs
  document.addEventListener('keydown', handleKeyDown);
}


// ============================================
// TAB SWITCHING (Requirements: 2.3, 10.2)
// ============================================

/**
 * Handle tab switch
 * @param {string} viewId - The view to switch to ('items' | 'active' | 'completed')
 */
function handleTabSwitch(viewId) {
  // Performance: Should complete within 100ms (Requirements: 10.2)
  const startTime = performance.now();
  
  // Update state
  AdminState.activeTab = viewId;
  
  // Update tab buttons
  DOM.tabs.forEach(tab => {
    const isActive = tab.dataset.view === viewId;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  
  // Update views
  DOM.views.forEach(view => {
    const isActive = view.id === `${viewId}-view`;
    view.classList.toggle('active', isActive);
  });
  
  // Hide stock FAB on Active tab (execution-only)
  if (DOM.stockFab) {
    DOM.stockFab.classList.toggle('hidden', viewId === 'active');
  }
  
  // Auto-focus search on Ready tab for quick verification code entry
  if (viewId === 'completed' && DOM.searchInput) {
    setTimeout(() => DOM.searchInput.focus(), 100);
  }
  
  // Clear item filter when switching away from active view
  if (viewId !== 'active' && AdminState.selectedItemFilter) {
    // Keep filter state but hide indicator
  }
  
  // Log performance
  const duration = performance.now() - startTime;
  if (duration > 100) {
    console.warn(`Tab switch took ${duration.toFixed(2)}ms (target: <100ms)`);
  }
}

// ============================================
// BADGE UPDATES (Requirements: 2.5)
// ============================================

/**
 * Update all badge counts based on current data
 */
function updateBadgeCounts() {
  const pendingOrders = AdminState.orders.filter(o => o.status === 'PENDING');
  const completedOrders = AdminState.orders.filter(o => o.status === 'COMPLETE');
  
  // Items badge: count of unique items across pending orders
  const itemSummary = getItemSummary();
  const itemCount = Object.keys(itemSummary).length;
  updateBadge(DOM.badgeItems, itemCount);
  
  // Active badge: count of pending orders
  updateBadge(DOM.badgeActive, pendingOrders.length);
  
  // Completed badge: count of completed orders
  updateBadge(DOM.badgeCompleted, completedOrders.length);
}

/**
 * Update a single badge
 * @param {HTMLElement} badgeEl - The badge element
 * @param {number} count - The count to display
 */
function updateBadge(badgeEl, count) {
  if (!badgeEl) return;
  
  const wasVisible = badgeEl.classList.contains('visible');
  const newVisible = count > 0;
  
  badgeEl.textContent = count > 99 ? '99+' : count;
  badgeEl.classList.toggle('visible', newVisible);
  
  // Pulse animation when count increases
  if (newVisible && !wasVisible) {
    badgeEl.classList.add('pulse');
    setTimeout(() => badgeEl.classList.remove('pulse'), 300);
  }
}

// ============================================
// ITEM AGGREGATION (Requirements: 3.1, 3.2, 3.4)
// ============================================

/**
 * Get aggregated item summary from pending orders
 * Includes oldest order timestamp for wait time calculation
 * @returns {Object} Map of item name to { quantity, orderCount, oldestOrderTime }
 */
function getItemSummary() {
  const summary = {};
  
  AdminState.orders
    .filter(o => o.status === 'PENDING')
    .forEach(order => {
      if (!order.items) return;
      
      const orderTime = new Date(order.created_at).getTime();
      
      // Track which items we've seen in this order to count orders correctly
      const seenInThisOrder = new Set();
      
      order.items.forEach(item => {
        if (!summary[item.title]) {
          summary[item.title] = { 
            quantity: 0, 
            orderCount: 0,
            oldestOrderTime: orderTime
          };
        }
        summary[item.title].quantity += item.quantity;
        
        // Track oldest order containing this item
        if (orderTime < summary[item.title].oldestOrderTime) {
          summary[item.title].oldestOrderTime = orderTime;
        }
        
        // Only increment orderCount once per order per item type
        if (!seenInThisOrder.has(item.title)) {
          summary[item.title].orderCount += 1;
          seenInThisOrder.add(item.title);
        }
      });
    });
  
  return summary;
}

/**
 * Get items with delta calculation and wait time
 * @returns {Array} Array of { name, quantity, orderCount, toldCount, delta, waitMinutes }
 */
function getSortedItems() {
  const summary = getItemSummary();
  const now = Date.now();
  
  return Object.entries(summary)
    .map(([name, data]) => {
      const toldCount = AdminState.toldCounts[name] || 0;
      const delta = data.quantity - toldCount;
      const waitMinutes = Math.floor((now - data.oldestOrderTime) / 60000);
      
      return { 
        name, 
        ...data, 
        toldCount,
        delta: delta > 0 ? delta : 0,
        waitMinutes
      };
    })
    .sort((a, b) => b.quantity - a.quantity); // Default sort by quantity
}

/**
 * Get items split into "needs announcing" and "already told" sections
 * TO ANNOUNCE: sorted by oldest order age (primary), quantity (secondary)
 * ALREADY TOLD: stable sort by quantity (no re-sorting)
 * @returns {{ needsAnnouncing: Array, alreadyTold: Array }}
 */
function getItemSections() {
  const items = getSortedItems();
  
  // Split into sections
  const needsAnnouncing = items
    .filter(item => item.delta > 0)
    .sort((a, b) => {
      // Primary: oldest order first (higher wait time = older)
      if (a.waitMinutes !== b.waitMinutes) {
        return b.waitMinutes - a.waitMinutes;
      }
      // Secondary: higher quantity first
      return b.quantity - a.quantity;
    });
  
  // Already told: keep stable quantity-based sort
  const alreadyTold = items.filter(item => item.delta === 0);
  
  return { needsAnnouncing, alreadyTold };
}


// ============================================
// RENDERING FUNCTIONS
// ============================================

/**
 * Render all views
 */
function renderAll() {
  renderItems();
  renderActiveOrders();
  renderCompletedOrders();
  updateBadgeCounts();
}

/**
 * Render Items to Prepare view (read-only with delta tracking)
 * Counter staff reads this tab and shouts quantities to kitchen
 * Format: 4× American Chopsuey ~7m +1 ✓ 👤4
 */
function renderItems() {
  if (!DOM.itemsList) return;
  
  const { needsAnnouncing, alreadyTold } = getItemSections();
  const totalItems = needsAnnouncing.length + alreadyTold.length;
  
  // Show/hide empty state
  DOM.itemsEmpty?.classList.toggle('hidden', totalItems > 0);
  
  if (totalItems === 0) {
    DOM.itemsList.innerHTML = '';
    return;
  }
  
  // Show section dividers only when list is long (≥6 items) and both sections have items
  const showDividers = totalItems >= 6 && needsAnnouncing.length > 0 && alreadyTold.length > 0;
  
  let html = '';
  
  if (showDividers && needsAnnouncing.length > 0) {
    html += `<div class="item-section-header">Needs announcing</div>`;
  }
  
  html += needsAnnouncing.map(item => renderItemRow(item, true)).join('');
  
  if (showDividers && alreadyTold.length > 0) {
    html += `<div class="item-section-header item-section-header--muted">Already told</div>`;
  }
  
  html += alreadyTold.map(item => renderItemRow(item, false)).join('');
  
  DOM.itemsList.innerHTML = html;
  
  // Add click handlers for TOLD buttons only
  DOM.itemsList.querySelectorAll('.item-row__told').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleTold(btn.dataset.itemName, parseInt(btn.dataset.itemQuantity, 10));
    });
  });
}

/**
 * Render a single item row
 * Layout: Order count top-right, qty× name on main line, wait time below
 * @param {Object} item - Item data { name, quantity, orderCount, delta, waitMinutes }
 * @param {boolean} showDelta - Whether to show delta and told button
 * @returns {string} HTML string
 */
function renderItemRow(item, showDelta) {
  const isPendingTold = AdminState.pendingToldActions.has(item.name);
  const showWaitHint = item.waitMinutes >= 5;
  const waitTimeFormatted = formatWaitTime(item.waitMinutes);
  
  return `
    <div class="item-row ${showDelta ? 'item-row--has-delta' : ''}"
         role="listitem"
         aria-label="${item.quantity} ${item.name}${showDelta ? `, ${item.delta} new` : ''}">
      <div class="item-row__content">
        <div class="item-row__primary">
          <span class="item-row__qty">${item.quantity}</span><span class="item-row__sep">×</span>
          <span class="item-row__name">${escapeHtml(item.name)}</span>
        </div>
        ${showWaitHint ? `<div class="item-row__wait">${waitTimeFormatted}</div>` : ''}
      </div>
      <div class="item-row__right">
        <span class="item-row__orders"><svg class="item-row__icon" viewBox="0 0 16 16" fill="currentColor"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg>${item.orderCount}</span>
        ${showDelta ? `
          <div class="item-row__action">
            <span class="item-row__delta">+${item.delta}</span>
            <button class="item-row__told ${isPendingTold ? 'item-row__told--pending' : ''}"
                    ${isPendingTold ? 'disabled' : ''}
                    aria-label="Mark ${item.name} as told"
                    data-item-name="${escapeHtml(item.name)}"
                    data-item-quantity="${item.quantity}">
              ${isPendingTold ? '·' : '✓'}
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Format wait time for display
 * < 60 min → ~18m
 * >= 60 min → ~1h 5m, ~2h 10m
 * @param {number} minutes - Wait time in minutes
 * @returns {string} Formatted wait time
 */
function formatWaitTime(minutes) {
  if (minutes < 60) {
    return `~${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `~${hours}h`;
  }
  return `~${hours}h ${mins}m`;
}

/**
 * Handle item card click (Requirements: 3.3)
 * @param {string} itemName - The item name to filter by
 */
function handleItemClick(itemName) {
  // Toggle filter
  if (AdminState.selectedItemFilter === itemName) {
    clearItemFilter();
  } else {
    AdminState.selectedItemFilter = itemName;
    renderItems();
    renderActiveOrders();
    
    // Switch to active tab to show filtered results
    handleTabSwitch('active');
    
    // Show filter indicator
    if (DOM.filterIndicator && DOM.filterItemName) {
      DOM.filterItemName.textContent = itemName;
      DOM.filterIndicator.classList.remove('hidden');
    }
  }
}

/**
 * Clear item filter
 */
function clearItemFilter() {
  AdminState.selectedItemFilter = null;
  DOM.filterIndicator?.classList.add('hidden');
  renderItems();
  renderActiveOrders();
}

/**
 * Handle TOLD button click - mark item quantity as communicated to kitchen
 * Uses optimistic update with rollback on failure
 * @param {string} itemName - The item name
 * @param {number} currentQuantity - Current total quantity
 */
async function handleTold(itemName, currentQuantity) {
  if (AdminState.pendingToldActions.has(itemName)) return;
  
  // Store previous value for rollback
  const previousToldCount = AdminState.toldCounts[itemName] || 0;
  
  // Optimistic update
  AdminState.pendingToldActions.add(itemName);
  AdminState.toldCounts[itemName] = currentQuantity;
  renderItems();
  
  try {
    // Persist to localStorage for session persistence
    saveToldCounts();
    
    // Simulate brief delay for visual feedback
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Success - clear pending state
    AdminState.pendingToldActions.delete(itemName);
    renderItems();
    
    console.log(`✅ Marked "${itemName}" as told (qty: ${currentQuantity})`);
  } catch (error) {
    console.error('❌ Error saving told count:', error);
    
    // Rollback on failure
    AdminState.toldCounts[itemName] = previousToldCount;
    AdminState.pendingToldActions.delete(itemName);
    renderItems();
    
    showToast('Failed to save. Please try again.', 'error');
  }
}

/**
 * Save told counts to localStorage for persistence
 */
function saveToldCounts() {
  try {
    localStorage.setItem('adminToldCounts', JSON.stringify(AdminState.toldCounts));
  } catch (e) {
    console.warn('Could not save told counts to localStorage:', e);
  }
}

/**
 * Load told counts from localStorage
 */
function loadToldCounts() {
  try {
    const saved = localStorage.getItem('adminToldCounts');
    if (saved) {
      AdminState.toldCounts = JSON.parse(saved);
      console.log('📋 Loaded told counts from storage');
    }
  } catch (e) {
    console.warn('Could not load told counts from localStorage:', e);
    AdminState.toldCounts = {};
  }
}

/**
 * Clean up told counts for items no longer in pending orders
 * Called after orders are fetched to remove stale entries
 */
function cleanupToldCounts() {
  const currentItems = getItemSummary();
  const currentItemNames = new Set(Object.keys(currentItems));
  
  // Remove told counts for items that are no longer in pending orders
  Object.keys(AdminState.toldCounts).forEach(itemName => {
    if (!currentItemNames.has(itemName)) {
      delete AdminState.toldCounts[itemName];
    }
  });
  
  saveToldCounts();
}

/**
 * Render Active Orders view (Requirements: 4.1, 4.2)
 * Shows full item list with qty× format, order age, and sorting
 */
function renderActiveOrders() {
  if (!DOM.activeOrdersList) return;
  
  let orders = AdminState.orders.filter(o => o.status === 'PENDING');
  
  // Apply item filter (Requirements: 3.3)
  if (AdminState.selectedItemFilter) {
    orders = orders.filter(order => 
      order.items?.some(item => item.title === AdminState.selectedItemFilter)
    );
  }
  
  // Apply sorting
  orders = sortActiveOrders(orders, AdminState.activeOrdersSort);
  
  // Show/hide empty state
  const showEmpty = orders.length === 0 && !AdminState.selectedItemFilter;
  DOM.activeEmpty?.classList.toggle('hidden', !showEmpty);
  
  if (orders.length === 0) {
    DOM.activeOrdersList.innerHTML = '';
    return;
  }
  
  const now = Date.now();
  
  DOM.activeOrdersList.innerHTML = orders.map(order => {
    const isPending = AdminState.pendingActions.has(order.id);
    const orderAge = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
    const ageFormatted = formatWaitTime(orderAge);
    const totalQty = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    const totalValue = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
    
    return `
      <article class="order-card ${isPending ? 'order-card--pending' : ''}"
               aria-label="Order ${truncateId(order.id)}">
        <div class="order-card__header">
          <span class="order-card__id">#${truncateId(order.id)}</span>
          <span class="order-card__age">${ageFormatted}</span>
        </div>
        <ul class="order-card__items">
          ${(order.items || []).map(item => `
            <li class="order-card__item">
              <span class="order-card__item-qty">${item.quantity}×</span>
              <span class="order-card__item-name">${escapeHtml(item.title)}</span>
            </li>
          `).join('')}
        </ul>
        <div class="order-card__footer">
          <div class="order-card__meta">
            <span class="order-card__total-qty">${totalQty} items</span>
            <span class="order-card__total-value">₹${totalValue}</span>
          </div>
          <button class="order-card__btn order-card__btn--complete"
                  ${isPending ? 'disabled' : ''}
                  aria-label="Mark order ${truncateId(order.id)} as complete"
                  data-order-id="${order.id}"
                  data-action="complete">
            ${isPending ? '...' : 'Complete'}
          </button>
        </div>
      </article>
    `;
  }).join('');
  
  // Add click handlers
  DOM.activeOrdersList.querySelectorAll('[data-action="complete"]').forEach(btn => {
    btn.addEventListener('click', () => showConfirmDialog(btn.dataset.orderId, 'complete'));
  });
}

/**
 * Sort active orders based on selected criteria
 * @param {Array} orders - Orders to sort
 * @param {string} sortBy - Sort criteria
 * @returns {Array} Sorted orders
 */
function sortActiveOrders(orders, sortBy) {
  const sorted = [...orders];
  
  switch (sortBy) {
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    case 'newest':
      return sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    case 'costly':
      return sorted.sort((a, b) => {
        const valueA = a.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
        const valueB = b.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
        return valueB - valueA;
      });
    case 'quantity':
      return sorted.sort((a, b) => {
        const qtyA = a.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
        const qtyB = b.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
        return qtyB - qtyA;
      });
    default:
      return sorted;
  }
}

/**
 * Handle active orders sort change
 */
function handleActiveOrdersSort() {
  AdminState.activeOrdersSort = DOM.activeSortSelect?.value || 'oldest';
  renderActiveOrders();
}


/**
 * Render Completed Orders view (Requirements: 5.1, 5.2, 5.6)
 */
function renderCompletedOrders() {
  if (!DOM.completedOrdersList) return;
  
  // Filter by COMPLETE status and sort by time ascending (oldest first) (Requirements: 5.6)
  let orders = AdminState.orders
    .filter(o => o.status === 'COMPLETE')
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
  
  // Apply search filter (Requirements: 12.2)
  const searchQuery = AdminState.searchQuery.trim().toLowerCase();
  if (searchQuery) {
    orders = orders.filter(order => 
      order.verification_code?.toLowerCase().includes(searchQuery)
    );
  }
  
  // Show/hide empty states
  const hasOrders = AdminState.orders.some(o => o.status === 'COMPLETE');
  const hasResults = orders.length > 0;
  
  DOM.completedEmpty?.classList.toggle('hidden', hasOrders || searchQuery);
  DOM.searchNoResults?.classList.toggle('hidden', !searchQuery || hasResults);
  
  if (orders.length === 0) {
    DOM.completedOrdersList.innerHTML = '';
    return;
  }
  
  DOM.completedOrdersList.innerHTML = orders.map(order => {
    const isPending = AdminState.pendingActions.has(order.id);
    const code = order.verification_code || '----';
    const isMatch = searchQuery && code.toLowerCase().includes(searchQuery);
    
    // Highlight matching portion of verification code
    let displayCode = escapeHtml(code);
    if (searchQuery && isMatch) {
      const regex = new RegExp(`(${escapeHtml(searchQuery)})`, 'gi');
      displayCode = displayCode.replace(regex, '<mark class="code-highlight">$1</mark>');
    }
    
    return `
      <article class="ready-card ${isPending ? 'ready-card--pending' : ''} ${isMatch ? 'ready-card--match' : ''}"
               aria-label="Order verification code ${code}">
        <div class="ready-card__code">${displayCode}</div>
        <div class="ready-card__time">${formatTime(order.updated_at)}</div>
        <button class="ready-card__btn ${isPending ? 'ready-card__btn--pending' : ''}"
                ${isPending ? 'disabled' : ''}
                aria-label="Confirm pickup for code ${code}"
                data-order-id="${order.id}"
                data-action="pickup">
          ${isPending ? '...' : 'Handed Over'}
        </button>
      </article>
    `;
  }).join('');
  
  // Add click handlers
  DOM.completedOrdersList.querySelectorAll('[data-action="pickup"]').forEach(btn => {
    btn.addEventListener('click', () => showConfirmDialog(btn.dataset.orderId, 'pickup'));
  });
}

// ============================================
// SEARCH FUNCTIONALITY (Requirements: 12.2)
// ============================================

/**
 * Handle search input with debounce
 */
function handleSearchInput() {
  const query = DOM.searchInput?.value || '';
  AdminState.searchQuery = query;
  
  // Show/hide clear button
  DOM.searchClearBtn?.classList.toggle('hidden', !query);
  
  renderCompletedOrders();
}

/**
 * Clear search input
 */
function clearSearch() {
  if (DOM.searchInput) {
    DOM.searchInput.value = '';
  }
  AdminState.searchQuery = '';
  DOM.searchClearBtn?.classList.add('hidden');
  renderCompletedOrders();
}

// ============================================
// CONFIRMATION DIALOG (Requirements: 8.1, 8.2)
// ============================================

/**
 * Show confirmation dialog
 * @param {string} orderId - The order ID
 * @param {string} action - The action ('complete' | 'pickup')
 */
function showConfirmDialog(orderId, action) {
  const order = AdminState.orders.find(o => o.id === orderId);
  if (!order) return;
  
  AdminState.confirmDialog = {
    orderId,
    action,
    previousStatus: order.status
  };
  
  // Update dialog content (Requirements: 8.2)
  if (action === 'complete') {
    DOM.confirmTitle.textContent = 'Mark as Complete?';
    DOM.confirmMessage.textContent = 'This order will be moved to the Ready for Pickup list.';
    DOM.confirmActionBtn.textContent = 'Mark Complete';
    DOM.confirmActionBtn.className = 'admin-btn admin-btn--primary admin-btn--full';
  } else {
    DOM.confirmTitle.textContent = 'Confirm Pickup?';
    DOM.confirmMessage.textContent = 'This will mark the order as picked up by the customer.';
    DOM.confirmActionBtn.textContent = 'Confirm Pickup';
    DOM.confirmActionBtn.className = 'admin-btn admin-btn--success admin-btn--full';
  }
  
  DOM.confirmOrderId.textContent = `Order: ${truncateId(orderId)}`;
  
  // Show dialog
  DOM.confirmBackdrop?.classList.remove('hidden');
  DOM.confirmBackdrop?.classList.add('visible');
  DOM.confirmDialog?.classList.remove('hidden');
  DOM.confirmDialog?.classList.add('visible');
  
  // Set up confirm action
  DOM.confirmActionBtn.onclick = () => executeConfirmedAction();
  
  // Focus the cancel button for accessibility
  DOM.confirmCancelBtn?.focus();
}

/**
 * Close confirmation dialog
 */
function closeConfirmDialog() {
  AdminState.confirmDialog = null;
  
  DOM.confirmBackdrop?.classList.remove('visible');
  DOM.confirmDialog?.classList.remove('visible');
  
  setTimeout(() => {
    DOM.confirmBackdrop?.classList.add('hidden');
    DOM.confirmDialog?.classList.add('hidden');
  }, 200);
}

/**
 * Execute the confirmed action
 */
async function executeConfirmedAction() {
  if (!AdminState.confirmDialog) return;
  
  const { orderId, action } = AdminState.confirmDialog;
  closeConfirmDialog();
  
  if (action === 'complete') {
    await markComplete(orderId);
  } else if (action === 'pickup') {
    await markPickedUp(orderId);
  }
}


// ============================================
// ORDER STATUS UPDATES (Requirements: 4.5, 5.5, 10.3, 10.4)
// ============================================

/**
 * Mark order as complete with optimistic update
 * @param {string} orderId - The order ID
 */
async function markComplete(orderId) {
  console.log("🔄 Marking order as COMPLETE:", orderId);
  
  // Optimistic update (Requirements: 10.3)
  const order = AdminState.orders.find(o => o.id === orderId);
  if (!order) return;
  
  const previousStatus = order.status;
  AdminState.pendingActions.set(orderId, { action: 'complete', previousStatus });
  order.status = 'COMPLETE';
  renderAll();
  
  try {
    const response = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETE' })
    });
    
    // Handle session expiry (Requirements: 13.1)
    if (response.status === 401) {
      order.status = previousStatus;
      AdminState.pendingActions.delete(orderId);
      renderAll();
      handleSessionExpiry();
      return;
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Order marked as COMPLETE');
      AdminState.pendingActions.delete(orderId);
      showToast('Order marked as complete', 'success');
      await fetchOrders();
    } else {
      throw new Error(result.error || 'Failed to update order');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    
    // Rollback optimistic update (Requirements: 10.4)
    order.status = previousStatus;
    AdminState.pendingActions.delete(orderId);
    renderAll();
    
    showToast('Failed to update order. Please try again.', 'error');
  }
}

/**
 * Mark order as picked up with optimistic update
 * @param {string} orderId - The order ID
 */
async function markPickedUp(orderId) {
  console.log("📦 Marking as PICKED_UP:", orderId);
  
  // Optimistic update (Requirements: 10.3)
  const order = AdminState.orders.find(o => o.id === orderId);
  if (!order) return;
  
  const previousStatus = order.status;
  AdminState.pendingActions.set(orderId, { action: 'pickup', previousStatus });
  order.status = 'PICKED_UP';
  renderAll();
  
  try {
    const response = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'PICKED_UP' })
    });
    
    // Handle session expiry (Requirements: 13.1)
    if (response.status === 401) {
      order.status = previousStatus;
      AdminState.pendingActions.delete(orderId);
      renderAll();
      handleSessionExpiry();
      return;
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Order marked as PICKED_UP');
      AdminState.pendingActions.delete(orderId);
      showToast('Order picked up successfully', 'success');
      await fetchOrders();
    } else {
      throw new Error(result.error || 'Failed to update order');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    
    // Rollback optimistic update (Requirements: 10.4)
    order.status = previousStatus;
    AdminState.pendingActions.delete(orderId);
    renderAll();
    
    showToast('Failed to update order. Please try again.', 'error');
  }
}

// ============================================
// STOCK PANEL (Requirements: 6.2, 6.3, 6.5)
// ============================================

/**
 * Open stock panel
 */
function openStockPanel() {
  AdminState.isStockPanelOpen = true;
  AdminState.stockSearchQuery = '';
  
  // Clear search input
  if (DOM.stockSearchInput) {
    DOM.stockSearchInput.value = '';
  }
  DOM.stockSearchClear?.classList.add('hidden');
  
  DOM.stockBackdrop?.classList.remove('hidden');
  DOM.stockBackdrop?.classList.add('visible');
  DOM.stockPanel?.classList.remove('hidden');
  
  // Trigger animation
  requestAnimationFrame(() => {
    DOM.stockPanel?.classList.add('visible');
  });
  
  renderStockItems();
  
  // Focus search input for quick access
  setTimeout(() => DOM.stockSearchInput?.focus(), 300);
}

/**
 * Close stock panel
 */
function closeStockPanel() {
  AdminState.isStockPanelOpen = false;
  
  DOM.stockBackdrop?.classList.remove('visible');
  DOM.stockPanel?.classList.remove('visible');
  
  setTimeout(() => {
    DOM.stockBackdrop?.classList.add('hidden');
    DOM.stockPanel?.classList.add('hidden');
  }, 300);
}

/**
 * Render stock items grouped by category with collapsible sections
 */
function renderStockItems() {
  if (!DOM.stockItemsList) return;
  
  const searchQuery = AdminState.stockSearchQuery.toLowerCase().trim();
  
  // Filter items by search query
  let filteredItems = AdminState.menuItems;
  if (searchQuery) {
    filteredItems = AdminState.menuItems.filter(item => 
      item.name.toLowerCase().includes(searchQuery) ||
      item.category.toLowerCase().includes(searchQuery)
    );
  }
  
  // Group by category
  const categories = {};
  filteredItems.forEach(item => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  });
  
  // Sort categories alphabetically
  const sortedCategories = Object.keys(categories).sort();
  
  // If searching, expand all categories; otherwise use saved state
  const expandAll = searchQuery.length > 0;
  
  if (sortedCategories.length === 0) {
    DOM.stockItemsList.innerHTML = `
      <div class="stock-empty">
        <p>No items found</p>
      </div>
    `;
    return;
  }
  
  DOM.stockItemsList.innerHTML = sortedCategories.map(category => {
    const items = categories[category];
    const isExpanded = expandAll || AdminState.expandedCategories.has(category);
    const availableCount = items.filter(i => i.is_available).length;
    const totalCount = items.length;
    
    return `
      <div class="stock-category ${isExpanded ? 'stock-category--expanded' : ''}">
        <button class="stock-category__header" 
                data-category="${escapeHtml(category)}"
                aria-expanded="${isExpanded}">
          <div class="stock-category__info">
            <span class="stock-category__name">${escapeHtml(category)}</span>
            <span class="stock-category__count">${availableCount}/${totalCount} available</span>
          </div>
          <span class="stock-category__arrow">
            <i class="fas fa-chevron-down" aria-hidden="true"></i>
          </span>
        </button>
        <div class="stock-category__items ${isExpanded ? '' : 'hidden'}">
          ${items.map(item => `
            <div class="stock-item ${item.is_available ? '' : 'stock-item--unavailable'}">
              <div class="stock-item__info">
                <div class="stock-item__name">${escapeHtml(item.name)}</div>
                <div class="stock-item__price">₹${item.price}</div>
              </div>
              <button class="stock-btn ${item.is_available ? 'stock-btn--available' : 'stock-btn--unavailable'}"
                      data-item-id="${item.id}"
                      data-available="${item.is_available}"
                      aria-label="${item.is_available ? 'Mark ' + item.name + ' as unavailable' : 'Mark ' + item.name + ' as available'}">
                ${item.is_available ? 'Available' : 'Out'}
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
  
  // Add category toggle handlers
  DOM.stockItemsList.querySelectorAll('.stock-category__header').forEach(header => {
    header.addEventListener('click', () => toggleCategory(header.dataset.category));
  });
  
  // Add stock button handlers
  DOM.stockItemsList.querySelectorAll('.stock-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const isAvailable = btn.dataset.available === 'true';
      toggleStock(btn.dataset.itemId, !isAvailable);
    });
  });
}

/**
 * Toggle category expansion
 * @param {string} category - Category name
 */
function toggleCategory(category) {
  if (AdminState.expandedCategories.has(category)) {
    AdminState.expandedCategories.delete(category);
  } else {
    AdminState.expandedCategories.add(category);
  }
  renderStockItems();
}

/**
 * Handle stock search input
 */
function handleStockSearch() {
  const query = DOM.stockSearchInput?.value || '';
  AdminState.stockSearchQuery = query;
  
  // Show/hide clear button
  DOM.stockSearchClear?.classList.toggle('hidden', !query);
  
  renderStockItems();
}

/**
 * Clear stock search
 */
function clearStockSearch() {
  if (DOM.stockSearchInput) {
    DOM.stockSearchInput.value = '';
  }
  AdminState.stockSearchQuery = '';
  DOM.stockSearchClear?.classList.add('hidden');
  renderStockItems();
}

/**
 * Toggle stock availability (Requirements: 6.5)
 * @param {string} itemId - The menu item ID
 * @param {boolean} isAvailable - New availability state
 */
async function toggleStock(itemId, isAvailable) {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    handleSessionExpiry();
    return;
  }
  
  try {
    const response = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/admin/stock/${itemId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ is_available: isAvailable })
    });
    
    // Handle session expiry (Requirements: 13.1)
    if (response.status === 401) {
      handleSessionExpiry();
      renderStockItems(); // Revert toggle
      return;
    }
    
    if (response.status === 403) {
      showAccessDenied();
      return;
    }
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log(`✅ Stock updated: ${isAvailable ? 'In Stock' : 'Out of Stock'}`);
      showToast(`Item ${isAvailable ? 'now available' : 'marked out of stock'}`, 'success');
      await fetchMenuItems();
    } else {
      throw new Error(result.error || 'Failed to update stock');
    }
  } catch (error) {
    console.error("❌ Error updating stock:", error);
    showToast('Failed to update stock. Please try again.', 'error');
    // Revert toggle
    renderStockItems();
  }
}


// ============================================
// DATA FETCHING
// ============================================

/**
 * Fetch orders from Supabase
 */
async function fetchOrders() {
  const { data, error } = await supabase.from('orders').select('*');
  
  if (error) {
    console.error("❌ Error fetching orders:", error);
    return;
  }
  
  AdminState.orders = data || [];
  console.log("📦 Orders fetched:", AdminState.orders.length);
  
  // Clean up told counts for items no longer in pending orders
  cleanupToldCounts();
  
  renderAll();
}

/**
 * Fetch menu items from Supabase
 */
async function fetchMenuItems() {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('category', { ascending: true })
    .order('name', { ascending: true });
  
  if (error) {
    console.error("❌ Error fetching menu items:", error);
    return;
  }
  
  AdminState.menuItems = data || [];
  console.log("📋 Menu items fetched:", AdminState.menuItems.length);
  
  if (AdminState.isStockPanelOpen) {
    renderStockItems();
  }
}

// ============================================
// REALTIME SUBSCRIPTIONS (Requirements: 14.1, 14.2)
// ============================================

/**
 * Initialize realtime subscriptions
 */
function initRealtimeSubscriptions() {
  RealtimeSubscriptionManager.init(supabase);
  
  // Register state change callback (Requirements: 14.1, 14.2, 14.3)
  RealtimeSubscriptionManager.onStateChange(updateConnectionStatus);
  
  // Subscribe to orders
  RealtimeSubscriptionManager.subscribeToTable('orders', fetchOrders);
  
  // Subscribe to menu items
  RealtimeSubscriptionManager.subscribeToTable('menu_items', fetchMenuItems);
  
  console.log('📡 Realtime subscriptions initialized');
  updateConnectionStatus('realtime');
}

/**
 * Update connection status indicator (Requirements: 14.4)
 * @param {string} status - 'realtime' | 'polling' | 'disconnected'
 */
function updateConnectionStatus(status) {
  AdminState.connectionStatus = status;
  
  if (!DOM.connectionStatus) return;
  
  DOM.connectionStatus.className = `connection-status connection-status--${status}`;
  
  const labels = {
    realtime: 'Connected',
    polling: 'Polling mode',
    disconnected: 'Disconnected'
  };
  
  DOM.connectionStatus.setAttribute('aria-label', `Connection status: ${labels[status]}`);
}

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Check session and verify admin access
 */
async function checkSession() {
  showLoading();
  
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    window.location.href = "login.html";
    return false;
  }
  
  // Display admin user email (Requirements: 13.4)
  displayAdminUser(session.user?.email);
  
  return await verifyAdminAccess(session.access_token);
}

/**
 * Verify admin access via backend API
 * @param {string} accessToken - The access token
 */
async function verifyAdminAccess(accessToken) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/admin/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.status === 401) {
      await supabase.auth.signOut();
      window.location.href = "login.html";
      return false;
    }
    
    if (response.status === 500 || !response.ok) {
      showError("Server error. Please try again.");
      return false;
    }
    
    const data = await response.json();
    
    if (data.isAdmin === true) {
      retryCount = 0;
      return true;
    } else {
      showAccessDenied();
      return false;
    }
  } catch (error) {
    console.error("Admin verification error:", error);
    
    if (error.name === 'AbortError') {
      showError("Request timed out. Please try again.");
    } else {
      showError("Network error. Please check your connection.");
    }
    return false;
  }
}

/**
 * Retry verification
 */
async function retryVerification() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    window.location.href = "login.html";
    return;
  }
  
  hideError();
  showLoading();
  
  const isAdmin = await verifyAdminAccess(session.access_token);
  
  if (isAdmin) {
    hideLoading();
    fetchOrders();
    fetchMenuItems();
    initRealtimeSubscriptions();
  }
}

// ============================================
// UI HELPERS
// ============================================

function showLoading() {
  DOM.loadingOverlay?.classList.remove('hidden');
  DOM.errorOverlay?.classList.add('hidden');
  DOM.accessDeniedOverlay?.classList.add('hidden');
}

function hideLoading() {
  DOM.loadingOverlay?.classList.add('hidden');
}

function showError(message) {
  hideLoading();
  retryCount++;
  
  if (retryCount >= MAX_RETRIES) {
    document.getElementById('error-message').textContent = 
      "Unable to verify admin access. Please contact support@spoon.com";
    DOM.retryBtn?.classList.add('hidden');
  } else {
    document.getElementById('error-message').textContent = message;
    DOM.retryBtn?.classList.remove('hidden');
  }
  
  DOM.errorOverlay?.classList.remove('hidden');
}

function hideError() {
  DOM.errorOverlay?.classList.add('hidden');
}

function showAccessDenied() {
  hideLoading();
  DOM.accessDeniedOverlay?.classList.remove('hidden');
  
  supabase.auth.signOut();
  
  setTimeout(() => {
    window.location.href = "../index.html";
  }, 3000);
}

// ============================================
// SETTINGS MENU (Requirements: 13.5)
// ============================================

/**
 * Toggle settings menu visibility
 */
function toggleSettingsMenu() {
  const isVisible = DOM.settingsMenu?.classList.contains('visible');
  
  if (isVisible) {
    closeSettingsMenu();
  } else {
    openSettingsMenu();
  }
}

/**
 * Open settings menu
 */
function openSettingsMenu() {
  DOM.settingsMenu?.classList.remove('hidden');
  DOM.settingsMenu?.classList.add('visible');
  DOM.settingsBtn?.setAttribute('aria-expanded', 'true');
}

/**
 * Close settings menu
 */
function closeSettingsMenu() {
  DOM.settingsMenu?.classList.remove('visible');
  DOM.settingsBtn?.setAttribute('aria-expanded', 'false');
}

/**
 * Handle document click to close settings menu
 * @param {Event} e - Click event
 */
function handleDocumentClick(e) {
  // Close settings menu if clicking outside
  if (DOM.settingsMenu?.classList.contains('visible')) {
    if (!DOM.settingsBtn?.contains(e.target) && !DOM.settingsMenu?.contains(e.target)) {
      closeSettingsMenu();
    }
  }
}

/**
 * Handle logout button click (Requirements: 13.5)
 */
async function handleLogout() {
  closeSettingsMenu();
  showLoading();
  
  try {
    await supabase.auth.signOut();
    window.location.href = "login.html";
  } catch (error) {
    console.error('Logout error:', error);
    hideLoading();
    showToast('Failed to log out. Please try again.', 'error');
  }
}

/**
 * Display admin user email (Requirements: 13.4)
 * @param {string} email - User email
 */
function displayAdminUser(email) {
  if (DOM.adminUser && email) {
    // Show truncated email
    const truncated = email.length > 20 ? email.slice(0, 17) + '...' : email;
    DOM.adminUser.textContent = truncated;
    DOM.adminUser.setAttribute('aria-label', `Logged in as ${email}`);
  }
}

// ============================================
// SESSION EXPIRY HANDLING (Requirements: 13.1, 13.2, 13.3)
// ============================================

/**
 * Show session expired prompt (non-blocking)
 */
function showSessionExpiredPrompt() {
  DOM.sessionPrompt?.classList.remove('hidden');
  
  requestAnimationFrame(() => {
    DOM.sessionPrompt?.classList.add('visible');
  });
}

/**
 * Hide session expired prompt
 */
function hideSessionExpiredPrompt() {
  DOM.sessionPrompt?.classList.remove('visible');
  
  setTimeout(() => {
    DOM.sessionPrompt?.classList.add('hidden');
  }, 300);
}

/**
 * Handle re-authentication button click
 */
function handleReauth() {
  hideSessionExpiredPrompt();
  window.location.href = "login.html";
}

/**
 * Handle 401 response during API calls (Requirements: 13.1)
 * Shows non-blocking prompt instead of immediate redirect
 */
function handleSessionExpiry() {
  // Show non-blocking prompt (Requirements: 13.2)
  showSessionExpiredPrompt();
  
  // Current view state is preserved (Requirements: 13.3)
  // User can continue viewing current data
}

/**
 * Show toast notification
 * @param {string} message - The message to show
 * @param {string} type - 'success' | 'error' | 'info'
 */
function showToast(message, type = 'info') {
  if (!DOM.toast || !DOM.toastMessage) return;
  
  DOM.toastMessage.textContent = message;
  DOM.toast.className = `admin-toast admin-toast--${type}`;
  DOM.toast.classList.add('visible');
  
  setTimeout(() => {
    DOM.toast.classList.remove('visible');
  }, 3000);
}

/**
 * Handle keyboard events
 * @param {KeyboardEvent} e - The keyboard event
 */
function handleKeyDown(e) {
  if (e.key === 'Escape') {
    if (AdminState.confirmDialog) {
      closeConfirmDialog();
    } else if (AdminState.isStockPanelOpen) {
      closeStockPanel();
    }
  }
}


// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Truncate order ID for display
 * @param {string} id - The full order ID
 */
function truncateId(id) {
  if (!id) return '';
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...`;
}

/**
 * Format timestamp for display
 * @param {string} timestamp - ISO timestamp
 */
function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });
}

// ============================================
// APP INITIALIZATION
// ============================================

/**
 * Initialize the admin dashboard
 */
async function initAdmin() {
  // Wait for config to load
  await window.waitForConfig();
  supabase = window.getSupabaseClient();
  
  if (!supabase) {
    showError("Failed to connect to database.");
    return;
  }
  
  // Initialize DOM references
  initDOMReferences();
  
  // Initialize event listeners
  initEventListeners();
  
  // Load told counts from localStorage
  loadToldCounts();
  
  // Check session and verify admin
  const isAdmin = await checkSession();
  
  if (isAdmin) {
    hideLoading();
    fetchOrders();
    fetchMenuItems();
    initRealtimeSubscriptions();
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  RealtimeSubscriptionManager.cleanup();
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initAdmin);

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AdminState,
    getItemSummary,
    getSortedItems,
    getItemSections,
    updateBadgeCounts,
    handleTabSwitch,
    handleTold,
    saveToldCounts,
    loadToldCounts,
    cleanupToldCounts
  };
}
