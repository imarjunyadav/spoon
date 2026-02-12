/**
 * Spoon - Admin Mobile Dashboard
 * 
 * Mobile-first admin interface for kitchen and counter staff.
 * Handles order management, stock control, and realtime updates.
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

  // Items tab "told" tracking (Simplified)
  // Map of strings: `${orderId}_${itemTitle}` → timestamp (when told)
  // Tracks individual order items that have been announced.
  toldItemIds: new Map(),

  // Pending actions (for optimistic updates)
  pendingToldActions: new Set(),

  // Stock panel state
  stockSearchQuery: '',
  expandedCategories: new Set(), // Track which categories are expanded

  // Active orders sort
  activeOrdersSort: 'oldest', // 'oldest' | 'newest' | 'costly' | 'quantity'

  // Show/hide told items filter (told items hidden by default)
  showToldItems: false
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
 * Initialize DOM references.
 */
function initDOMReferences() {
  // Tabs
  DOM.tabs = document.querySelectorAll('.admin-tab');
  DOM.tabItems = document.getElementById('tab-items');
  DOM.tabActive = document.getElementById('tab-active');
  DOM.tabCompleted = document.getElementById('tab-completed');
  DOM.tabCancelled = document.getElementById('tab-cancelled');

  // Views
  DOM.views = document.querySelectorAll('.admin-view');
  DOM.itemsView = document.getElementById('items-view');
  DOM.activeView = document.getElementById('active-view');
  DOM.completedView = document.getElementById('completed-view');
  DOM.cancelledView = document.getElementById('cancelled-view');

  // Lists
  DOM.itemsList = document.getElementById('items-list');
  DOM.activeOrdersList = document.getElementById('active-orders-list');
  DOM.completedOrdersList = document.getElementById('completed-orders-list');
  DOM.cancelledOrdersList = document.getElementById('cancelled-orders-list');
  DOM.stockItemsList = document.getElementById('stock-items-list');

  // Active orders sort
  DOM.activeSortSelect = document.getElementById('active-sort-select');

  // Badges
  DOM.badgeItems = document.getElementById('badge-items');
  DOM.badgeActive = document.getElementById('badge-active');
  DOM.badgeCompleted = document.getElementById('badge-completed');
  DOM.badgeCancelled = document.getElementById('badge-cancelled');

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
  DOM.confirmDetails = document.getElementById('confirm-details');
  DOM.confirmCancelBtn = document.getElementById('confirm-cancel-btn');
  DOM.confirmActionBtn = document.getElementById('confirm-action-btn');

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
  DOM.cancelledEmpty = document.getElementById('cancelled-empty');
  DOM.searchNoResults = document.getElementById('search-no-results');
}

/**
 * Initialize event listeners.
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

  // Custom sort dropdown
  initSortDropdown();

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

  // User menu close button
  const userMenuClose = document.getElementById('user-menu-close');
  if (userMenuClose) {
    userMenuClose.addEventListener('click', closeSettingsMenu);
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
 * Handle tab switching logic.
 * @param {string} viewId - The view to switch to ('items' | 'active' | 'completed').
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

  // Hide stock FAB on Active, Ready, and Cancelled tabs (execution-only)
  if (DOM.stockFab) {
    DOM.stockFab.classList.toggle('hidden', viewId === 'active' || viewId === 'completed' || viewId === 'cancelled');
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
 * Update all badge counts based on current data.
 */
function updateBadgeCounts() {
  // Active badge: count of pending orders (statuses: PENDING, PAID, PLACED, PREPARING)
  const pendingStatuses = ['PENDING', 'PAID', 'PLACED', 'PREPARING'];
  const pendingOrders = AdminState.orders.filter(o => pendingStatuses.includes(o.status));

  // Completed badge: count of READY orders only (status: COMPLETE)
  // functionality: Exclude PICKED_UP orders from badge count as they are history
  const completedOrders = AdminState.orders.filter(o => o.status === 'COMPLETE');

  // Items badge: total quantity of items needing announcement (sum of deltas)
  // This is the actual count of items to tell kitchen, not unique item types
  const { visible } = getVisibleNeedsAnnouncingItems();
  const itemCount = visible.reduce((sum, item) => sum + item.delta, 0);
  updateBadge(DOM.badgeItems, itemCount);

  // Active badge: count of pending orders
  updateBadge(DOM.badgeActive, pendingOrders.length);

  // Completed badge: count of completed orders
  updateBadge(DOM.badgeCompleted, completedOrders.length);

  // Cancelled badge: count of cancelled orders
  const cancelledOrders = AdminState.orders.filter(o => o.status === 'CANCELLED');
  updateBadge(DOM.badgeCancelled, cancelledOrders.length);
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

  badgeEl.textContent = count;
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

// Time bucket threshold in milliseconds (10 minutes)
const TIME_BUCKET_THRESHOLD_MS = 10 * 60 * 1000;

// Pre-order activation threshold in milliseconds (45 minutes before pickup)
// Pre-orders become "needs announcing" when: now >= preorder_time - ACTIVATION_THRESHOLD_MS
const ACTIVATION_THRESHOLD_MS = 45 * 60 * 1000;

// ============================================
// AGGREGATION KEY STRATEGY (State Consistency Fix)
// ============================================

/**
 * Generate aggregation key for an item.
 * 
 * Key formats:
 * - Live: "live:{itemName}"
 * - Pre-order: "preorder:{itemName}:{scheduledTimeISO}"
 * 
 * @param {string} itemName - The item name.
 * @param {boolean} isPreOrder - Whether this is from a pre-order.
 * @param {string|null} scheduledTimeISO - ISO string of scheduled pickup time.
 * @returns {string} The aggregation key.
 */
function getAggregationKey(itemName, isPreOrder, scheduledTimeISO) {
  if (isPreOrder && scheduledTimeISO) {
    return `preorder:${itemName}:${scheduledTimeISO}`;
  }
  return `live:${itemName}`;
}

/**
 * Parse an aggregation key to extract its components.
 * @param {string} key - The aggregation key.
 * @returns {{ type: 'live' | 'preorder', itemName: string, scheduledTimeISO: string | null }}
 */
function parseAggregationKey(key) {
  if (key.startsWith('preorder:')) {
    // Format: preorder:{itemName}:{scheduledTimeISO}
    // Note: Both item names and ISO strings can contain colons
    // ISO format is predictable: YYYY-MM-DDTHH:MM:SS.sssZ (24 chars for full precision)
    // We find the ISO timestamp by looking for the pattern from the end
    const withoutPrefix = key.slice(9); // Skip "preorder:"

    // ISO timestamps have a predictable format - find the last occurrence of a date pattern
    // Look for pattern like "2026-01-14T" which marks the start of an ISO timestamp
    const isoPattern = /\d{4}-\d{2}-\d{2}T/;
    const match = withoutPrefix.match(isoPattern);

    if (match && match.index !== undefined) {
      const itemName = withoutPrefix.slice(0, match.index - 1); // -1 to remove the colon before timestamp
      const scheduledTimeISO = withoutPrefix.slice(match.index);
      return { type: 'preorder', itemName, scheduledTimeISO };
    }

    // Malformed key, return as-is
    return { type: 'preorder', itemName: withoutPrefix, scheduledTimeISO: null };
  }

  // Format: live:{itemName}
  const itemName = key.slice(5); // Skip "live:"
  return { type: 'live', itemName, scheduledTimeISO: null };
}

// ============================================
// ORDER CLASSIFICATION (Pre-order separation)
// ============================================

/**
 * Determine if an order needs announcing (cook now).
 * Includes immediate orders and pre-orders within the activation threshold.
 * 
 * @param {Object} order - Order object.
 * @returns {boolean} True if order needs announcing.
 */
function needsAnnouncing(order) {
  // No preorder_time = immediate order (always needs announcing)
  if (!order.preorder_time) {
    return true;
  }

  const now = Date.now();
  const pickupTime = new Date(order.preorder_time).getTime();

  // Handle invalid dates - treat as immediate order
  if (isNaN(pickupTime)) {
    console.warn('Invalid preorder_time format:', order.preorder_time);
    return true;
  }

  const activationTime = pickupTime - ACTIVATION_THRESHOLD_MS;

  // Needs announcing if current time is at or past activation time
  return now >= activationTime;
}

/**
 * Check if an order is a transitioned pre-order
 * (has preorder_time but is now within the activation threshold)
 * 
 * @param {Object} order - Order object
 * @returns {boolean} True if transitioned pre-order
 */
function isTransitionedPreOrder(order) {
  return !!(order.preorder_time && needsAnnouncing(order));
}

/**
 * Partition orders into needs-announcing and future pre-orders.
 * @param {Array} orders - All orders.
 * @returns {{ needsAnnouncingOrders: Array, futurePreOrders: Array }}
 */
function partitionOrders(orders) {
  const pendingStatuses = ['PENDING', 'PAID', 'PLACED', 'PREPARING'];
  // Filter for active orders that are not cancelled or completed
  const pendingOrders = orders.filter(o => pendingStatuses.includes(o.status));

  return {
    needsAnnouncingOrders: pendingOrders.filter(needsAnnouncing),
    futurePreOrders: pendingOrders.filter(o => !needsAnnouncing(o))
  };
}

// ============================================
// NEEDS ANNOUNCING AGGREGATION (Pre-order separation)
// ============================================

// Normal order merge threshold: orders within 3 minutes can merge
const NORMAL_ORDER_MERGE_THRESHOLD_MS = 3 * 60 * 1000;

// Live order delta window: new orders within 3 minutes of told action show as delta
const LIVE_ORDER_DELTA_WINDOW_MS = 3 * 60 * 1000;

/**
 * Get items for Needs Announcing section.
 * @deprecated Use the strict batching implementation below.
 * @returns {Array} Items array.
 */
function getNeedsAnnouncingItems() {
  console.error("Using deprecated getNeedsAnnouncingItems - check file structure");
  return [];
} // DEPRECATED - See bottom of file

/**
 * Get visible items for Needs Announcing (respecting told filter)
 * Items with delta > 0 are always visible
 * Items with delta === 0 (fully told) are hidden by default
 * 
 * @returns {{ visible: Array, hidden: Array }}
 */
function getVisibleNeedsAnnouncingItems() {
  const allItems = getNeedsAnnouncingItems();

  // Split by told state - items with delta > 0 are visible, fully told items are hidden
  const visible = allItems.filter(item => item.delta > 0);
  const hidden = allItems.filter(item => item.delta === 0);

  // Sort visible: oldest order first (higher wait time), then by quantity
  visible.sort((a, b) => {
    if (a.waitMinutes !== b.waitMinutes) return b.waitMinutes - a.waitMinutes;
    return b.quantity - a.quantity;
  });

  return { visible, hidden };
}

// ============================================
// PRE-ORDERS AGGREGATION (Planning section)
// ============================================

/**
 * Format absolute time (e.g., "1:45 PM").
 * @param {Date} date - Date object.
 * @returns {string} Formatted time.
 */
function formatAbsoluteTime(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const displayMinutes = minutes.toString().padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${displayHours}:${displayMinutes} ${period}`;
}

/**
 * Format relative time (e.g., "in 5m")
 * @param {number} minutes - Minutes until pickup
 * @returns {string} Formatted relative time
 */
function formatRelativeTime(minutes) {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `in ${hours}h`;
  return `in ${hours}h ${mins}m`;
}

/**
 * Get pre-orders grouped by pickup time for planning section.
 * Only includes orders beyond the activation threshold.
 * 
 * @returns {Array<{ pickupTime: Date, pickupTimeISO: string, pickupTimeFormatted: string, items: Array, orderCount: number }>}
 */
function getPreOrdersForPlanning() {
  const { futurePreOrders } = partitionOrders(AdminState.orders);

  // Group by pickup time (exact ISO string for stability)
  const slotMap = new Map();

  futurePreOrders.forEach(order => {
    const pickupTimeISO = order.preorder_time;

    if (!slotMap.has(pickupTimeISO)) {
      slotMap.set(pickupTimeISO, {
        pickupTime: new Date(pickupTimeISO),
        pickupTimeISO,
        items: {},
        orderCount: 0
      });
    }

    const slot = slotMap.get(pickupTimeISO);
    slot.orderCount++;

    (order.items || []).forEach(item => {
      if (!slot.items[item.title]) {
        slot.items[item.title] = { name: item.title, quantity: 0 };
      }
      slot.items[item.title].quantity += item.quantity;
    });
  });

  // Convert to array, format time, sort by pickup time (earliest first)
  return Array.from(slotMap.values())
    .map(slot => ({
      ...slot,
      pickupTimeFormatted: formatAbsoluteTime(slot.pickupTime),
      items: Object.values(slot.items)
    }))
    .sort((a, b) => a.pickupTime - b.pickupTime);
}

// ============================================
// TOLD FILTER STATE (Pre-order separation)
// ============================================

/**
 * Toggle the told items filter and re-render
 * When enabled, shows items that have been fully told (delta === 0)
 */
function toggleToldFilter() {
  AdminState.showToldItems = !AdminState.showToldItems;
  renderItems();
}

// ============================================
// ITEM AGGREGATION (Original)
// ============================================

/**
 * Get aggregated item summary from pending orders.
 * Splits items into buckets when order age gap exceeds threshold.
 * 
 * @returns {Object} Map of bucket key to summary data.
 */
function getItemSummary() {
  // First, collect all item instances with their order times
  const itemInstances = [];

  AdminState.orders
    .filter(o => ['PENDING', 'PAID', 'PLACED', 'PREPARING'].includes(o.status))
    .forEach(order => {
      if (!order.items) return;

      const orderTime = new Date(order.created_at).getTime();

      order.items.forEach(item => {
        itemInstances.push({
          name: item.title,
          quantity: item.quantity,
          orderTime,
          orderId: order.id
        });
      });
    });

  // Group by item name first
  const itemsByName = {};
  itemInstances.forEach(instance => {
    if (!itemsByName[instance.name]) {
      itemsByName[instance.name] = [];
    }
    itemsByName[instance.name].push(instance);
  });

  // Now create time buckets for each item
  const summary = {};

  Object.entries(itemsByName).forEach(([itemName, instances]) => {
    // Sort by order time (oldest first)
    instances.sort((a, b) => a.orderTime - b.orderTime);

    // Create buckets based on time gaps
    const buckets = [];
    let currentBucket = null;

    instances.forEach(instance => {
      if (!currentBucket) {
        // Start first bucket
        currentBucket = {
          name: itemName,
          quantity: instance.quantity,
          orderCount: 1,
          oldestOrderTime: instance.orderTime,
          newestOrderTime: instance.orderTime,
          orderIds: new Set([instance.orderId])
        };
      } else if (instance.orderTime - currentBucket.newestOrderTime > TIME_BUCKET_THRESHOLD_MS) {
        // Gap too large, start new bucket
        buckets.push(currentBucket);
        currentBucket = {
          name: itemName,
          quantity: instance.quantity,
          orderCount: 1,
          oldestOrderTime: instance.orderTime,
          newestOrderTime: instance.orderTime,
          orderIds: new Set([instance.orderId])
        };
      } else {
        // Add to current bucket
        currentBucket.quantity += instance.quantity;
        currentBucket.newestOrderTime = instance.orderTime;
        if (!currentBucket.orderIds.has(instance.orderId)) {
          currentBucket.orderCount += 1;
          currentBucket.orderIds.add(instance.orderId);
        }
      }
    });

    // Don't forget the last bucket
    if (currentBucket) {
      buckets.push(currentBucket);
    }

    // Add buckets to summary with unique keys
    buckets.forEach((bucket, index) => {
      const bucketKey = buckets.length > 1 ? `${itemName}__bucket${index}` : itemName;
      summary[bucketKey] = {
        name: bucket.name,
        quantity: bucket.quantity,
        orderCount: bucket.orderCount,
        oldestOrderTime: bucket.oldestOrderTime,
        newestOrderTime: bucket.newestOrderTime,
        bucketIndex: index,
        totalBuckets: buckets.length
      };
    });
  });

  return summary;
}

/**
 * Get items with delta calculation and wait time
 * @returns {Array} Array of { name, quantity, orderCount, toldCount, delta, waitMinutes, bucketKey, totalItemQuantity }
 */
function getSortedItems() {
  const summary = getItemSummary();
  const now = Date.now();

  // First, calculate total quantity per item name (across all buckets)
  const totalQuantityByName = {};
  Object.values(summary).forEach(data => {
    if (!totalQuantityByName[data.name]) {
      totalQuantityByName[data.name] = 0;
    }
    totalQuantityByName[data.name] += data.quantity;
  });

  return Object.entries(summary)
    .map(([bucketKey, data]) => {
      // For told counts, use the base item name (without bucket suffix)
      const baseName = data.name;
      const toldCount = AdminState.toldCounts[baseName] || 0;
      const totalItemQuantity = totalQuantityByName[baseName];

      // Delta calculation: compare total quantity against told count
      // If told count >= total quantity, all buckets are "told"
      // Otherwise, show delta based on what's remaining
      let delta = 0;
      const remainingToTell = totalItemQuantity - toldCount;

      if (remainingToTell <= 0) {
        // Everything has been told
        delta = 0;
      } else if (data.bucketIndex === 0) {
        // Oldest bucket: gets the remaining delta (up to its quantity)
        delta = Math.min(remainingToTell, data.quantity);
      } else {
        // Newer buckets: check if there's still remaining after older buckets
        // For simplicity, newer buckets always show as "new" until all are told
        delta = data.quantity;
      }

      const waitMinutes = Math.floor((now - data.oldestOrderTime) / 60000);

      return {
        bucketKey,
        name: data.name,
        quantity: data.quantity,
        orderCount: data.orderCount,
        oldestOrderTime: data.oldestOrderTime,
        toldCount: data.bucketIndex === 0 ? toldCount : 0,
        delta,
        waitMinutes,
        bucketIndex: data.bucketIndex,
        totalBuckets: data.totalBuckets,
        totalItemQuantity // Total across all buckets for this item
      };
    })
    .sort((a, b) => b.quantity - a.quantity); // Default sort by quantity
}

/**
 * Get items split into "needs announcing" and "already told" sections.
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
// URGENCY TIER SYSTEM (Items Tab v2)
// ============================================

/**
 * Get urgency level based on wait time in minutes.
 * @param {number} waitMinutes - Minutes since oldest order in batch
 * @returns {'low'|'med'|'high'} Urgency tier
 */
function getUrgencyLevel(waitMinutes) {
  if (waitMinutes >= 15) return 'high';
  if (waitMinutes >= 5) return 'med';
  return 'low';
}

/**
 * Get CSS class for time hint based on wait time.
 * @param {number} waitMinutes
 * @returns {string} CSS modifier class or empty string
 */
function getTimeHintClass(waitMinutes) {
  if (waitMinutes >= 15) return 'item-row__time-hint--critical';
  if (waitMinutes >= 5) return 'item-row__time-hint--urgent';
  return '';
}

// Collapse state for "Already Told" section (default: collapsed)
if (typeof AdminState.toldSectionOpen === 'undefined') {
  AdminState.toldSectionOpen = false;
}

/**
 * Toggle the told section collapse state
 */
function toggleToldSection() {
  AdminState.toldSectionOpen = !AdminState.toldSectionOpen;
  renderItems();
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
  renderCancelledOrders();
  updateBadgeCounts();
}

/**
 * Render Items to Prepare view.
 * Three sections: Needs Announcing, Already Told, Pre-orders.
 */
function renderItems() {
  if (!DOM.itemsList) return;

  const allItems = getNeedsAnnouncingItems();
  const needsAnnouncing = allItems.filter(i => !i.isTold && !i.isPreOrder);
  const alreadyTold = allItems.filter(i => i.isTold);
  const preOrderSlots = getPreOrdersForPlanning();

  const hasNeedsAnnouncing = needsAnnouncing.length > 0;
  const hasToldItems = alreadyTold.length > 0;
  const hasPreOrders = preOrderSlots.length > 0;
  const hasAnyContent = hasNeedsAnnouncing || hasToldItems || hasPreOrders;

  DOM.itemsEmpty?.classList.toggle('hidden', hasAnyContent);

  if (!hasAnyContent) {
    DOM.itemsList.innerHTML = '';
    return;
  }

  let html = '';

  // Section 1: Needs Announcing
  if (hasNeedsAnnouncing) {
    html += `<div class="item-section-header">
      <div style="display:flex;align-items:center;gap:4px;">
        <span class="item-section-header__dot"></span>
        <span>Needs announcing</span>
        <span class="item-section-header__count">${needsAnnouncing.length}</span>
      </div>
    </div>`;
    html += needsAnnouncing.map(item => renderNeedsAnnouncingRow(item)).join('');
  }

  // Section 2: Already Told (collapsible)
  if (hasToldItems) {
    const chevronClass = AdminState.toldSectionOpen ? 'item-section-header__chevron--open' : '';
    const chevronSvg = `<svg class="item-section-header__chevron ${chevronClass}" viewBox="0 0 16 16" fill="currentColor"><path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>`;

    html += `<div class="item-section-header item-section-header--muted" id="told-section-toggle">
      <div style="display:flex;align-items:center;gap:4px;">
        <span>Already told</span>
        <span class="item-section-header__count" style="color:var(--text-muted);">${alreadyTold.length}</span>
      </div>
      ${chevronSvg}
    </div>`;

    const collapsibleClass = AdminState.toldSectionOpen ? 'told-section-collapsible--open' : '';
    html += `<div class="told-section-collapsible ${collapsibleClass}">`;
    html += alreadyTold.map(item => renderToldRow(item)).join('');
    html += '</div>';
  }

  // Section 3: Pre-orders
  if (hasPreOrders) {
    html += renderPreOrdersSection(preOrderSlots);
  }

  DOM.itemsList.innerHTML = html;

  // TOLD button handlers
  DOM.itemsList.querySelectorAll('.item-row__told').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idString = btn.dataset.itemIds;
      if (idString) handleTold(idString.split(','));
    });
  });

  // UNTOLD button handlers
  DOM.itemsList.querySelectorAll('.item-row__untold').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idString = btn.dataset.itemIds;
      if (idString) handleUntold(idString.split(','));
    });
  });

  // Toggle handler for told section
  const toldToggle = document.getElementById('told-section-toggle');
  if (toldToggle) {
    toldToggle.addEventListener('click', toggleToldSection);
  }
}

// (renderItemRow removed — replaced by renderNeedsAnnouncingRow)

// ============================================
// PRE-ORDER SEPARATION RENDERING
// ============================================

/**
 * Render a needs-announcing item row.
 * Shows: Name + Qty, Time or Pre-order label, TOLD button.
 * @param {Object} item - Item data.
 * @returns {string} HTML string.
 */
function renderNeedsAnnouncingRow(item) {
  // Time info
  let timeText = '';
  const isPreOrder = item.hasPreOrderSource && item.earliestPickupTime !== null;

  if (isPreOrder) {
    const pickupTime = new Date(item.earliestPickupTime).getTime();
    const minutesUntil = Math.round((pickupTime - Date.now()) / 60000);
    timeText = formatPreOrderTime(minutesUntil, item.earliestPickupTime);
  } else if (item.waitMinutes !== undefined) {
    timeText = formatWaitTime(item.waitMinutes);
  }

  // Pre-order badge
  const preOrderHtml = isPreOrder
    ? `<span class="item-row__tag--preorder">Pre-order</span>`
    : '';

  // Meta row: pre-order label + time
  const metaParts = [preOrderHtml, timeText].filter(Boolean);
  const metaHtml = metaParts.length > 0
    ? metaParts.join('<span class="item-row__dot">•</span>')
    : '';

  return `
    <div class="item-row item-row--v5"
         role="listitem"
         aria-label="${item.quantity} ${item.name}">
      <div class="item-row__main">
        <div class="item-row__top">
          <span class="item-row__name">${escapeHtml(item.name)}</span>
          <span class="item-row__meta-qty">×${item.quantity}</span>
        </div>
        ${metaHtml ? `<div class="item-row__meta">${metaHtml}</div>` : ''}
      </div>
      <div class="item-row__action">
        <button class="item-row__told"
                aria-label="Mark ${item.name} as told"
                data-item-ids="${(item.contributingItemIds || []).join(',')}">
          TOLD
        </button>
      </div>
    </div>
  `;
}

/**
 * Render the told filter toggle button - REMOVED
 */
function renderToldFilterToggle(hiddenCount) {
  return ''; // Deprecated
}

/**
 * Render a told item row.
 * Shows: Name + Qty, Told time ("Xm ago") or Pre-order countdown, UNTOLD button.
 * @param {Object} item - Item data.
 * @returns {string} HTML string.
 */
function renderToldRow(item) {
  let timeHint = '';
  const isPreOrder = item.hasPreOrderSource && item.earliestPickupTime;

  if (isPreOrder) {
    // Pre-orders: show countdown (in Xm / Due now / Due Xm ago)
    const pickupTime = new Date(item.earliestPickupTime).getTime();
    const minutesUntil = Math.round((pickupTime - Date.now()) / 60000);
    timeHint = formatPreOrderTime(minutesUntil, item.earliestPickupTime);
  } else if (item.toldTimestamp) {
    // Live: show "told Xm ago"
    const minutesSinceTold = Math.floor((Date.now() - item.toldTimestamp) / 60000);
    timeHint = formatWaitTime(minutesSinceTold);
  }

  const preOrderBadge = isPreOrder ? '<span class="item-row__tag--preorder">Pre-order</span>' : '';
  const metaParts = [preOrderBadge, timeHint].filter(Boolean);
  const metaHtml = metaParts.length > 0
    ? metaParts.join('<span class="item-row__dot">•</span>')
    : '';

  return `
    <div class="item-row item-row--told"
         role="listitem"
         aria-label="${item.quantity} ${item.name} told">
      <div class="item-row__main">
        <div class="item-row__top">
          <span class="item-row__name">${escapeHtml(item.name)}</span>
          <span class="item-row__meta-qty">×${item.quantity}</span>
        </div>
        ${metaHtml ? `<div class="item-row__meta">${metaHtml}</div>` : ''}
      </div>
      <div class="item-row__action">
        <button class="item-row__untold"
                aria-label="Undo tell for ${item.name}"
                data-item-ids="${(item.contributingItemIds || []).join(',')}">
          UNTOLD
        </button>
      </div>
    </div>
  `;
}

/**
 * Render the pre-orders planning section (v2 — with countdown)
 * @param {Array} slots - Pre-order time slots from getPreOrdersForPlanning()
 * @returns {string} HTML string
 */
function renderPreOrdersSection(slots) {
  if (!slots || slots.length === 0) return '';

  const now = Date.now();

  let html = `
    <div class="preorders-section">
      <div class="preorders-section__header">
        <svg class="preorders-section__icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
        </svg>
        <span>Pre-orders</span>
        <span class="item-section-header__count" style="color:var(--text-muted);margin-left:4px;">${slots.length}</span>
      </div>
  `;

  slots.forEach(slot => {
    const minutesUntil = Math.round((slot.pickupTime.getTime() - now) / 60000);
    const isApproaching = minutesUntil <= 60 && minutesUntil > 0;
    const slotClass = isApproaching ? 'preorder-slot--approaching' : '';

    // Countdown badge for slots within 60 minutes
    const countdownHtml = minutesUntil > 0 && minutesUntil <= 60
      ? `<span class="preorder-slot__countdown">${formatPreOrderTime(minutesUntil, slot.pickupTime)}</span>`
      : '';

    const itemsList = slot.items.map(item =>
      `<span class="preorder-slot__item">${item.quantity}× ${escapeHtml(item.name)}</span>`
    ).join('');

    html += `
      <div class="preorder-slot ${slotClass}">
        <div class="preorder-slot__header">
          <div style="display:flex;align-items:center;">
            <span class="preorder-slot__time">${slot.pickupTimeFormatted}</span>
            ${countdownHtml}
          </div>
          <span class="preorder-slot__count">${slot.orderCount} order${slot.orderCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="preorder-slot__items">${itemsList}</div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

/**
 * Format wait time for display (Requirements: 5.6)
 * < 1 min → Just now
 * < 60 min → 59m ago
 * < 24 hr → 1h 5m ago
 * >= 24 hr → 1d 2h ago
 * @param {number} minutes - Wait time in minutes
 * @returns {string} Formatted wait time
 */
function formatWaitTime(minutes) {
  if (minutes < 1) return 'Just now';

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0 ? `${days}d ${remainingHours}h ago` : `${days}d ago`;
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
 * Save told state to localStorage
 */
function saveToldState() {
  try {
    // Save Map as array of [key, timestamp] pairs
    const data = Array.from(AdminState.toldItemIds.entries());
    localStorage.setItem('adminToldItemIds', JSON.stringify(data));
  } catch (e) {
    console.warn('Could not save told state:', e);
  }
}

/**
 * Load told state from localStorage
 */
function loadToldState() {
  try {
    const data = localStorage.getItem('adminToldItemIds');
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        // Support both old Set format (["key"]) and new Map format ([["key", ts]])
        if (parsed.length > 0 && Array.isArray(parsed[0])) {
          // New Map format: [[key, timestamp], ...]
          AdminState.toldItemIds = new Map(parsed);
        } else {
          // Old Set format: ["key", ...] — migrate to Map with current time
          AdminState.toldItemIds = new Map(parsed.map(k => [k, Date.now()]));
        }
        console.log(`📋 Loaded ${AdminState.toldItemIds.size} told items`);
      }
    }
  } catch (e) {
    console.warn('Could not load told state:', e);
    AdminState.toldItemIds = new Map();
  }
}

/**
 * Clean up told state for items no longer in pending orders
 * Called after orders are fetched to remove stale entries.
 */
function cleanupToldState() {
  const currentOrderIds = new Set(AdminState.orders.map(o => o.id));
  let changed = false;

  AdminState.toldItemIds.forEach((timestamp, key) => {
    const [orderId] = key.split('_');
    if (!currentOrderIds.has(orderId)) {
      AdminState.toldItemIds.delete(key);
      changed = true;
    }
  });

  if (changed) {
    saveToldState();
  }
}



/**
 * Get all items grouped by state (Open vs Told).
 * Groups live orders by item name, pre-orders by name + time.
 * @returns {Array} Items with isTold, quantity, contributingItemIds etc.
 */
function getNeedsAnnouncingItems() {
  const { needsAnnouncingOrders } = partitionOrders(AdminState.orders);

  const needsAnnouncingGroups = {};
  const alreadyToldGroups = {};

  needsAnnouncingOrders.forEach(order => {
    if (!['PENDING', 'PAID', 'PLACED', 'PREPARING'].includes(order.status)) return;

    (order.items || []).forEach(item => {
      const isPreOrder = !!order.preorder_time;
      const scheduleKey = isPreOrder ? order.preorder_time : null;

      const distinctKey = `${order.id}_${item.title}`;
      const isTold = AdminState.toldItemIds.has(distinctKey);
      const toldTs = isTold ? AdminState.toldItemIds.get(distinctKey) : null;

      const groupKey = isPreOrder
        ? `preorder:${item.title}:${scheduleKey}`
        : `live:${item.title}`;

      const targetGroups = isTold ? alreadyToldGroups : needsAnnouncingGroups;

      if (!targetGroups[groupKey]) {
        targetGroups[groupKey] = {
          aggregationKey: groupKey,
          name: item.title,
          quantity: 0,
          orderCount: 0,
          oldestOrderTime: Infinity,
          newestOrderTime: 0,
          isPreOrder: isPreOrder,
          earliestPickupTime: isPreOrder ? new Date(scheduleKey).getTime() : null,
          earliestPickupMinutes: null,
          contributingItemIds: [],
          isTold: isTold,
          toldTimestamp: null // Most recent told time for display
        };
      }

      const group = targetGroups[groupKey];
      group.quantity += item.quantity;
      group.orderCount++;
      const orderTime = new Date(order.created_at).getTime();
      group.oldestOrderTime = Math.min(group.oldestOrderTime, orderTime);
      group.newestOrderTime = Math.max(group.newestOrderTime, orderTime);
      group.contributingItemIds.push(distinctKey);

      // Track most recent told timestamp for the group
      if (toldTs && (!group.toldTimestamp || toldTs > group.toldTimestamp)) {
        group.toldTimestamp = toldTs;
      }
    });
  });

  // Build final array
  const items = [
    ...Object.values(needsAnnouncingGroups),
    ...Object.values(alreadyToldGroups)
  ];

  const now = Date.now();
  return items.map(item => {
    if (item.isPreOrder && item.earliestPickupTime) {
      item.earliestPickupMinutes = Math.round((item.earliestPickupTime - now) / 60000);
    } else {
      item.waitMinutes = Math.floor((now - item.oldestOrderTime) / 60000);
    }
    item.hasPreOrderSource = item.isPreOrder;
    return item;
  });
}

/**
 * Handle TOLD button click.
 * Adds items to toldItemIds Map with current timestamp.
 * @param {Array<string>} itemIds - List of "orderId_title" to mark as told.
 */
function handleTold(itemIds) {
  if (!itemIds || itemIds.length === 0) return;
  const now = Date.now();
  itemIds.forEach(id => AdminState.toldItemIds.set(id, now));
  saveToldState();
  renderAll();
  console.log(`✅ Told ${itemIds.length} items`);
}

/**
 * Handle UNTOLD action.
 * Removes items from toldItemIds Map.
 * @param {Array<string>} itemIds - List of IDs to un-tell.
 */
function handleUntold(itemIds) {
  if (!itemIds || itemIds.length === 0) return;
  itemIds.forEach(id => AdminState.toldItemIds.delete(id));
  saveToldState();
  renderAll();
  console.log(`↩️ Untold ${itemIds.length} items`);
}


function renderActiveOrders() {
  if (!DOM.activeOrdersList) return;

  let orders = AdminState.orders.filter(o => ['PENDING', 'PAID', 'PLACED', 'PREPARING'].includes(o.status));

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
    const isPreOrder = !!order.preorder_time;
    const totalQty = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

    // Time display: pre-orders show "in Xm", regular orders show "~Xm"
    let timeDisplay = '';
    if (isPreOrder) {
      const pickupTime = new Date(order.preorder_time).getTime();
      const minutesUntil = Math.round((pickupTime - now) / 60000);
      timeDisplay = formatPreOrderTime(minutesUntil, pickupTime);
    } else {
      const orderAge = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
      timeDisplay = formatWaitTime(orderAge);
    }

    return `
      <article class="order-card ${isPending ? 'order-card--pending' : ''}"
               data-order-id="${order.id}">
        <div class="order-card__header">
          <div class="order-card__info">
            <span class="order-card__time">${timeDisplay}</span>
            ${isPreOrder ? '<span class="order-card__preorder-badge">PRE-ORDER</span>' : ''}
            <span class="order-card__qty">${totalQty} items</span>
          </div>
          <button class="order-card__btn order-card__btn--done ${isPending ? 'loading' : ''}"
                  ${isPending ? 'disabled' : ''}
                  aria-label="Mark order as complete"
                  data-order-id="${order.id}"
                  data-action="complete">
            Done
          </button>
        </div>
        <ul class="order-card__items">
          ${(order.items || []).map(item => `
            <li class="order-card__item">
              <span class="order-card__item-qty">${item.quantity}×</span>
              <span class="order-card__item-name">${escapeHtml(item.title)}</span>
            </li>
          `).join('')}
        </ul>
      </article>
    `;
  }).join('');

  // Add click handlers - single-tap action, no confirmation dialog
  DOM.activeOrdersList.querySelectorAll('[data-action="complete"]').forEach(btn => {
    btn.addEventListener('click', () => markComplete(btn.dataset.orderId));
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
    case 'preorder':
      // Pre-orders first (sorted by pickup time), then regular orders (sorted by created_at)
      return sorted.sort((a, b) => {
        const aIsPreorder = !!a.preorder_time;
        const bIsPreorder = !!b.preorder_time;

        // Pre-orders come first
        if (aIsPreorder && !bIsPreorder) return -1;
        if (!aIsPreorder && bIsPreorder) return 1;

        // Both pre-orders: sort by pickup time (earliest first)
        if (aIsPreorder && bIsPreorder) {
          return new Date(a.preorder_time) - new Date(b.preorder_time);
        }

        // Both regular: sort by created_at (oldest first)
        return new Date(a.created_at) - new Date(b.created_at);
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
 * Initialize custom sort dropdown
 */
function initSortDropdown() {
  const dropdown = document.getElementById('sort-dropdown');
  const trigger = document.getElementById('sort-trigger');
  const panel = document.getElementById('sort-panel');
  const valueDisplay = document.getElementById('sort-value');
  const options = panel?.querySelectorAll('.sort-dropdown__option');

  if (!dropdown || !trigger || !panel || !options) return;

  // Toggle dropdown
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open');
    trigger.setAttribute('aria-expanded', !isOpen);
  });

  // Handle option selection
  options.forEach(option => {
    option.addEventListener('click', () => {
      const value = option.dataset.value;
      const text = option.textContent;

      // Update display
      valueDisplay.textContent = text;

      // Update selected state
      options.forEach(opt => {
        opt.classList.remove('sort-dropdown__option--selected');
        opt.setAttribute('aria-selected', 'false');
      });
      option.classList.add('sort-dropdown__option--selected');
      option.setAttribute('aria-selected', 'true');

      // Update hidden select and trigger change
      if (DOM.activeSortSelect) {
        DOM.activeSortSelect.value = value;
        DOM.activeSortSelect.dispatchEvent(new Event('change'));
      }

      // Close dropdown
      dropdown.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    });
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
}


/**
 * Render Completed Orders view.
 * OTP-first design: fast type → read → tap handover.
 */
function renderCompletedOrders() {
  if (!DOM.completedOrdersList) return;

  // Apply strict search filter - only show matching orders
  const searchQuery = AdminState.searchQuery.trim().toUpperCase();

  // Filter by status and sort by time ascending (oldest first) (Requirements: 5.6)
  // functionality: Only show COMPLETE orders by default (Ready for Pickup)
  // Filter by status and sort by time ascending (oldest first) (Requirements: 5.6)
  // functionality: Only show COMPLETE orders (Ready for Pickup)
  // functionality: Exclude PICKED_UP orders to prevent history leak
  const allowedStatuses = ['COMPLETE'];

  let orders = AdminState.orders
    .filter(o => allowedStatuses.includes(o.status))
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));

  if (searchQuery) {
    orders = orders.filter(order =>
      order.verification_code?.toUpperCase().includes(searchQuery)
    );
  }

  // Show/hide empty states
  const hasOrders = AdminState.orders.some(o => ['COMPLETE', 'PICKED_UP'].includes(o.status));
  const hasResults = orders.length > 0;

  DOM.completedEmpty?.classList.toggle('hidden', hasOrders || searchQuery);
  DOM.searchNoResults?.classList.toggle('hidden', !searchQuery || hasResults);

  if (orders.length === 0) {
    DOM.completedOrdersList.innerHTML = '';
    return;
  }

  // Pre-compute exact match state for atomic rendering
  // Exact match: single result AND code matches query exactly
  const exactMatchOrderId = (searchQuery && orders.length === 1 &&
    orders[0].verification_code?.toUpperCase() === searchQuery)
    ? orders[0].id
    : null;

  DOM.completedOrdersList.innerHTML = orders.map(order => {
    const isPending = AdminState.pendingActions.has(order.id);
    const isExactMatch = order.id === exactMatchOrderId;
    const code = order.verification_code || '----';

    // Highlight matching portion of verification code
    let displayCode = escapeHtml(code);
    if (searchQuery) {
      const regex = new RegExp(`(${escapeHtml(searchQuery)})`, 'gi');
      displayCode = displayCode.replace(regex, '<mark class="code-highlight">$1</mark>');
    }

    // Build classes atomically - all state determined before render
    const cardClasses = [
      'ready-card',
      isPending ? 'ready-card--pending' : '',
      isExactMatch ? 'ready-card--matched' : ''
    ].filter(Boolean).join(' ');

    // Button state determined atomically
    const btnClasses = isPending ? 'ready-card__btn ready-card__btn--pending loading' : 'ready-card__btn';
    const btnText = isPending ? '' : 'Handed Over';
    const btnDisabled = isPending ? 'disabled' : '';

    return `
      <article class="${cardClasses}"
               aria-label="Order verification code ${code}">
        <div class="ready-card__code-box">
          <div class="ready-card__code">${displayCode}</div>
        </div>
        <button class="${btnClasses}"
                ${btnDisabled}
                aria-label="Confirm pickup for code ${code}"
                data-order-id="${order.id}"
                data-action="pickup">
          ${btnText}
        </button>
      </article>
    `;
  }).join('');

  // Add click handlers
  DOM.completedOrdersList.querySelectorAll('[data-action="pickup"]').forEach(btn => {
    btn.addEventListener('click', () => showConfirmDialog(btn.dataset.orderId, 'pickup'));
  });
}

/**
 * Render Cancelled Orders view.
 */
function renderCancelledOrders() {
  if (!DOM.cancelledOrdersList) return;

  // Filter for CANCELLED orders
  // Sort by updated_at descending (most recent first)
  const orders = AdminState.orders
    .filter(o => o.status === 'CANCELLED')
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

  // Show/hide empty state
  DOM.cancelledEmpty?.classList.toggle('hidden', orders.length > 0);

  if (orders.length === 0) {
    DOM.cancelledOrdersList.innerHTML = '';
    return;
  }

  DOM.cancelledOrdersList.innerHTML = orders.map(order => {
    const totalQty = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    const cancelTime = order.updated_at || order.created_at;
    const timeDisplay = formatTime(cancelTime); // Assuming formatTime handles ISO string

    // Format refund info
    const refundAmount = order.refund_amount || order.total || 0;

    return `
      <article class="order-card order-card--cancelled" data-order-id="${order.id}">
        <div class="order-card__header">
          <div class="order-card__info">
            <span class="order-card__time">Cancelled at ${timeDisplay}</span>
            <span class="order-card__qty">${totalQty} items</span>
          </div>
          <div class="order-card__status-badge order-card__status-badge--cancelled">
            Cancelled
          </div>
        </div>
        
        <div class="order-card__refund-info">
          <i class="fas fa-undo-alt" aria-hidden="true"></i>
          <span>Refunded: ₹${refundAmount} coins</span>
        </div>

        ${order.cancellation_reason ? `
        <div class="order-card__reason">
          <span class="text-secondary">Reason:</span>
          <span>${escapeHtml(order.cancellation_reason)}</span>
        </div>` : ''}

        <ul class="order-card__items">
          ${(order.items || []).map(item => `
            <li class="order-card__item">
              <span class="order-card__item-qty">${item.quantity}×</span>
              <span class="order-card__item-name">${escapeHtml(item.title)}</span>
            </li>
          `).join('')}
        </ul>
      </article>
    `;
  }).join('');
}

// ============================================
// SEARCH FUNCTIONALITY (Requirements: 12.2)
// ============================================

/**
 * Handle search input with debounce.
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
 * Show confirmation dialog.
 * @param {string} orderId - The order ID.
 * @param {string} action - The action ('complete' | 'pickup').
 */
function showConfirmDialog(orderId, action) {
  const order = AdminState.orders.find(o => o.id === orderId);
  if (!order) return;

  AdminState.confirmDialog = {
    orderId,
    action,
    previousStatus: order.status
  };

  const confirmHeader = document.getElementById('confirm-header');

  // Update dialog content (Requirements: 8.2)
  if (action === 'complete') {
    // Simple confirmation for marking complete (not used anymore, but kept for safety)
    confirmHeader.innerHTML = '';
    DOM.confirmTitle.textContent = 'Mark as Complete?';
    DOM.confirmTitle.classList.remove('hidden');
    DOM.confirmMessage.textContent = 'This order will be moved to the Ready for Pickup list.';
    DOM.confirmMessage.classList.remove('hidden');
    DOM.confirmActionBtn.textContent = 'Mark Complete';
    DOM.confirmActionBtn.className = 'confirm-dialog__action-btn confirm-dialog__action-btn--primary';
    DOM.confirmDetails?.classList.add('hidden');
  } else {
    // Pickup confirmation - reading-first layout for fast verification
    const totalQty = order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
    const totalValue = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
    const code = order.verification_code || '----';

    // Time display: pre-order shows scheduled time, normal shows wait time since Ready
    let timeDisplay = '';
    const now = Date.now();
    if (order.preorder_time) {
      const pickupTime = new Date(order.preorder_time);
      timeDisplay = formatAbsoluteTime(pickupTime);
    } else {
      // Use updated_at as "ready time", fallback to created_at if not available
      const readyTimeStr = order.updated_at || order.created_at;
      const readyTime = readyTimeStr ? new Date(readyTimeStr).getTime() : null;
      if (readyTime && !isNaN(readyTime)) {
        const waitMinutes = Math.floor((now - readyTime) / 60000);
        timeDisplay = waitMinutes >= 0 ? formatWaitTime(waitMinutes) : '';
      }
    }

    // Hide title/message for pickup dialog
    DOM.confirmTitle.classList.add('hidden');
    DOM.confirmMessage.classList.add('hidden');
    DOM.confirmActionBtn.textContent = 'Handed Over';
    DOM.confirmActionBtn.className = 'confirm-dialog__action-btn confirm-dialog__action-btn--success';

    // Build header: OTP (largest) | Order ID (muted) | Time (right)
    confirmHeader.innerHTML = `
      <span class="confirm-dialog__header-otp">${code}</span>
      <span class="confirm-dialog__header-order-id">#${truncateId(orderId)}</span>
      <span class="confirm-dialog__header-time">${timeDisplay}</span>
    `;

    // Build body: items list (all items, scrollable)
    if (DOM.confirmDetails) {
      DOM.confirmDetails.innerHTML = `
        <div class="confirm-dialog__items-container">
          <ul class="confirm-dialog__items">
            ${(order.items || []).map(item => `
              <li>
                <span class="confirm-dialog__item-qty">${item.quantity}×</span>
                <span class="confirm-dialog__item-name">${escapeHtml(item.title)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
      DOM.confirmDetails.classList.remove('hidden');
    }

    // Update sticky summary
    const summaryEl = document.getElementById('confirm-summary');
    const totalQtyEl = document.getElementById('confirm-total-qty');
    const totalPriceEl = document.getElementById('confirm-total-price');
    if (summaryEl && totalQtyEl && totalPriceEl) {
      totalQtyEl.textContent = `${totalQty} items`;
      totalPriceEl.textContent = `₹${totalValue}`;
      summaryEl.classList.remove('hidden');
    }
  }

  // Show dialog with backdrop blur
  DOM.confirmBackdrop?.classList.remove('hidden');
  DOM.confirmBackdrop?.classList.add('visible');
  DOM.confirmDialog?.classList.remove('hidden');
  DOM.confirmDialog?.classList.add('visible');

  // Set up confirm action
  DOM.confirmActionBtn.onclick = () => executeConfirmedAction();
  DOM.confirmCancelBtn.onclick = () => closeConfirmDialog();

  // Focus the action button for quick confirmation
  DOM.confirmActionBtn?.focus();
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
 * Mark order as complete with optimistic update.
 * @param {string} orderId - The order ID.
 */
async function markComplete(orderId) {
  console.log("🔄 Marking order as COMPLETE:", orderId);

  // Optimistic update (Requirements: 10.3)
  const order = AdminState.orders.find(o => o.id === orderId);
  if (!order) return;

  const previousStatus = order.status;
  const previousUpdatedAt = order.updated_at;
  AdminState.pendingActions.set(orderId, { action: 'complete', previousStatus, previousUpdatedAt });

  // Complete optimistic update with all required fields to prevent render flicker
  order.status = 'COMPLETE';
  order.updated_at = new Date().toISOString();
  renderAll();

  try {
    const response = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('sb-mnvxojjbbiqmymlatigh-auth-token') ? JSON.parse(localStorage.getItem('sb-mnvxojjbbiqmymlatigh-auth-token')).access_token : ''}`
      },
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
      await fetchOrders();
    } else {
      throw new Error(result.error || 'Failed to update order');
    }
  } catch (error) {
    console.error('❌ Error:', error);

    // Rollback optimistic update (Requirements: 10.4)
    order.status = previousStatus;
    order.updated_at = previousUpdatedAt;
    AdminState.pendingActions.delete(orderId);
    renderAll();

    // Removed toast - rollback is visible in UI
  }
}

/**
 * Mark order as picked up with optimistic update.
 * @param {string} orderId - The order ID.
 */
async function markPickedUp(orderId) {
  console.log("📦 Marking as PICKED_UP:", orderId);

  // Optimistic update (Requirements: 10.3)
  const order = AdminState.orders.find(o => o.id === orderId);
  if (!order) return;

  const previousStatus = order.status;
  const previousUpdatedAt = order.updated_at;
  AdminState.pendingActions.set(orderId, { action: 'pickup', previousStatus, previousUpdatedAt });

  // Complete optimistic update with all required fields to prevent render flicker
  order.status = 'PICKED_UP';
  order.updated_at = new Date().toISOString();
  renderAll();

  try {
    const response = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('sb-mnvxojjbbiqmymlatigh-auth-token') ? JSON.parse(localStorage.getItem('sb-mnvxojjbbiqmymlatigh-auth-token')).access_token : ''}`
      },
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

      // Clear search input and restore full list after handover
      clearSearch();

      // Auto-focus search field for next order
      setTimeout(() => DOM.searchInput?.focus(), 100);

      await fetchOrders();
    } else {
      throw new Error(result.error || 'Failed to update order');
    }
  } catch (error) {
    console.error('❌ Error:', error);

    // Rollback optimistic update (Requirements: 10.4)
    order.status = previousStatus;
    order.updated_at = previousUpdatedAt;
    AdminState.pendingActions.delete(orderId);
    renderAll();

    // Removed toast - rollback is visible in UI
  }
}

// ============================================
// STOCK PANEL (Requirements: 6.2, 6.3, 6.5)
// Modern flat list with toggle switches
// ============================================

// Active category filter for stock panel ('all' or category name)
AdminState.stockCategoryFilter = 'all';

/**
 * Open stock panel
 */
function openStockPanel() {
  AdminState.isStockPanelOpen = true;
  AdminState.stockSearchQuery = '';
  AdminState.stockCategoryFilter = 'all';

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

  renderStockFilters();
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
 * Render category filter chips
 */
function renderStockFilters() {
  const filtersContainer = document.getElementById('stock-filters');
  if (!filtersContainer) return;

  // Get unique categories
  const categories = [...new Set(AdminState.menuItems.map(item => item.category))].sort();

  // Count items per category
  const categoryCounts = {};
  categories.forEach(cat => {
    const items = AdminState.menuItems.filter(i => i.category === cat);
    const outCount = items.filter(i => !i.is_available).length;
    categoryCounts[cat] = { total: items.length, out: outCount };
  });

  // Total out count
  const totalOut = AdminState.menuItems.filter(i => !i.is_available).length;

  filtersContainer.innerHTML = `
    <div class="stock-filters">
      <button class="stock-filter-chip ${AdminState.stockCategoryFilter === 'all' ? 'stock-filter-chip--active' : ''}"
              data-category="all">
        All${totalOut > 0 ? ` <span class="stock-filter-chip__badge">${totalOut}</span>` : ''}
      </button>
      ${categories.map(cat => `
        <button class="stock-filter-chip ${AdminState.stockCategoryFilter === cat ? 'stock-filter-chip--active' : ''}"
                data-category="${escapeHtml(cat)}">
          ${escapeHtml(cat)}${categoryCounts[cat].out > 0 ? ` <span class="stock-filter-chip__badge">${categoryCounts[cat].out}</span>` : ''}
        </button>
      `).join('')}
    </div>
  `;

  // Add click handlers
  filtersContainer.querySelectorAll('.stock-filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      AdminState.stockCategoryFilter = chip.dataset.category;
      renderStockFilters();
      renderStockItems();
    });
  });
}

/**
 * Render stock items as flat list with toggle switches.
 */
function renderStockItems() {
  if (!DOM.stockItemsList) return;

  const searchQuery = AdminState.stockSearchQuery.toLowerCase().trim();
  const categoryFilter = AdminState.stockCategoryFilter;

  // Filter items by search query and category
  let filteredItems = AdminState.menuItems;

  if (categoryFilter !== 'all') {
    filteredItems = filteredItems.filter(item => item.category === categoryFilter);
  }

  if (searchQuery) {
    filteredItems = filteredItems.filter(item =>
      item.name.toLowerCase().includes(searchQuery)
    );
  }

  // Group by category for visual dividers
  const categories = {};
  filteredItems.forEach(item => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  });

  // Sort categories alphabetically
  const sortedCategories = Object.keys(categories).sort();

  if (sortedCategories.length === 0) {
    DOM.stockItemsList.innerHTML = `
      <div class="stock-empty">
        <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48" opacity="0.3">
          <path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v14z"/>
          <path d="M9.5 7h-3v3h3V7zm0 4h-3v3h3v-3zm0 4h-3v3h3v-3zm8-8h-6v3h6V7zm0 4h-6v3h6v-3zm0 4h-6v3h6v-3z"/>
        </svg>
        <p>No items found</p>
      </div>
    `;
    return;
  }

  // Build flat list with category dividers
  let html = '';

  sortedCategories.forEach(category => {
    const items = categories[category];

    // Category divider (subtle, not collapsible)
    html += `<div class="stock-divider">${escapeHtml(category)}</div>`;

    // Items in this category
    items.forEach(item => {
      const isOut = !item.is_available;
      html += `
        <div class="stock-row ${isOut ? 'stock-row--out' : ''}">
          <span class="stock-row__name">${escapeHtml(item.name)}</span>
          <label class="stock-toggle-switch">
            <input type="checkbox" 
                   ${item.is_available ? 'checked' : ''}
                   data-item-id="${item.id}"
                   aria-label="${item.is_available ? 'Mark ' + item.name + ' as out of stock' : 'Mark ' + item.name + ' as in stock'}">
            <span class="stock-toggle-switch__slider"></span>
          </label>
        </div>
      `;
    });
  });

  DOM.stockItemsList.innerHTML = html;

  // Add toggle handlers
  DOM.stockItemsList.querySelectorAll('.stock-toggle-switch input').forEach(toggle => {
    toggle.addEventListener('change', () => {
      toggleStock(toggle.dataset.itemId, toggle.checked);
    });
  });
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

  // Optimistic update
  const item = AdminState.menuItems.find(i => i.id === itemId);
  if (item) {
    item.is_available = isAvailable;
    renderStockFilters(); // Update badge counts
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
      await fetchMenuItems();
    } else {
      throw new Error(result.error || 'Failed to update stock');
    }
  } catch (error) {
    console.error("❌ Error updating stock:", error);
    // Revert toggle
    if (item) {
      item.is_available = !isAvailable;
    }
    renderStockFilters();
    renderStockItems();
  }
}


// ============================================
// DATA FETCHING
// ============================================

/**
 * Normalize preorder time to ISO string
 * Handles both ISO strings and "HH:MM:SS" time-only formats (assuming today)
 */
function normalizePreorderTime(timeStr) {
  if (!timeStr) return null;

  // 1. Try standard date parsing first (ISO)
  const timestamp = new Date(timeStr).getTime();
  if (!isNaN(timestamp)) {
    return timeStr;
  }

  // 2. Try time-only format (HH:MM:SS or HH:MM)
  const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeMatch) {
    const [_, h, m, s] = timeMatch;
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(h, 10), parseInt(m, 10), parseInt(s || '0', 10));
    return date.toISOString();
  }

  return null;
}

/**
 * Fetch orders from Supabase
 */
async function fetchOrders() {
  const { data, error } = await supabase.from('orders').select('*');

  if (error) {
    console.error("❌ Error fetching orders:", error);
    return;
  }

  // Normalize preorder_time dates
  AdminState.orders = (data || []).map(order => {
    if (order.preorder_time) {
      const normalized = normalizePreorderTime(order.preorder_time);
      if (normalized) {
        order.preorder_time = normalized;
      }
    }
    return order;
  });

  console.log("📦 Orders fetched:", AdminState.orders.length);

  // Clean up told state for items no longer in pending orders
  cleanupToldState();

  // Debounce render to prevent UI jitter on rapid updates (Requirement: Scalability)
  if (window.renderTimeout) clearTimeout(window.renderTimeout);
  window.renderTimeout = setTimeout(renderAll, 50);
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
 * Handle realtime order changes.
 * Avoids full refetch by updating local state directly from payload.
 * 
 * @param {Object} payload - Realtime event payload.
 */
function handleOrderChange(payload) {
  // Fallback to full refetch if payload is malformed
  if (!payload) {
    console.warn('⚠️ Malformed payload, falling back to full refetch');
    fetchOrders();
    return;
  }

  const { eventType, new: newOrder, old: oldOrder } = payload;

  if (eventType === 'INSERT' && newOrder) {
    // Normalize preorder_time
    if (newOrder.preorder_time) {
      newOrder.preorder_time = normalizePreorderTime(newOrder.preorder_time);
    }

    // Prevent duplicates
    const exists = AdminState.orders.find(o => o.id === newOrder.id);
    if (!exists) {
      console.log('📥 Surgical INSERT:', newOrder.id);
      AdminState.orders.unshift(newOrder);
    }
  } else if (eventType === 'UPDATE' && newOrder) {
    // Normalize preorder_time
    if (newOrder.preorder_time) {
      newOrder.preorder_time = normalizePreorderTime(newOrder.preorder_time);
    }

    // Find and update existing order
    const index = AdminState.orders.findIndex(o => o.id === newOrder.id);
    if (index > -1) {
      console.log('📝 Surgical UPDATE:', newOrder.id);
      // Preserve local-only properties if needed, but for now strict overwrite is safer
      AdminState.orders[index] = newOrder;
    } else {
      // Order not in local state (edge case: late subscription)
      console.warn('⚠️ Order not found locally, adding:', newOrder.id);
      AdminState.orders.unshift(newOrder);
    }
  } else if (eventType === 'DELETE' && oldOrder) {
    // Handle rare deletion cases (e.g. cleanup)
    console.log('🗑️ Surgical DELETE:', oldOrder.id);
    AdminState.orders = AdminState.orders.filter(o => o.id !== oldOrder.id);
  } else {
    // Fallback for unhandled cases
    // fetchOrders();
  }

  // Clean up told state for items no longer in pending orders
  cleanupToldState();

  // Re-render UI from local state (no DB call)
  renderAll();
}

/**
 * Initialize realtime subscriptions
 */
function initRealtimeSubscriptions() {
  RealtimeSubscriptionManager.init(supabase);

  // Register state change callback (Requirements: 14.1, 14.2, 14.3)
  RealtimeSubscriptionManager.onStateChange(updateConnectionStatus);

  // Subscribe to orders with surgical handler
  RealtimeSubscriptionManager.subscribeToTable('orders', handleOrderChange, fetchOrders);

  // Subscribe to menu items
  RealtimeSubscriptionManager.subscribeToTable('menu_items', fetchMenuItems);

  console.log('📡 Realtime subscriptions initialized');
  updateConnectionStatus('realtime');
}

/**
 * Update connection status indicator (Requirements: 14.4)
 * Wi-Fi style icon: live (green) or offline (red with slash)
 * @param {string} status - 'realtime' | 'polling' | 'disconnected'
 */
function updateConnectionStatus(status) {
  AdminState.connectionStatus = status;

  if (!DOM.connectionStatus) return;

  const isOffline = status === 'disconnected';

  // Toggle offline class for icon switching
  DOM.connectionStatus.classList.toggle('connection-indicator--offline', isOffline);

  // Show/hide appropriate icon
  const liveIcon = DOM.connectionStatus.querySelector('.connection-indicator__icon--live');
  const offlineIcon = DOM.connectionStatus.querySelector('.connection-indicator__icon--offline');

  if (liveIcon) liveIcon.classList.toggle('hidden', isOffline);
  if (offlineIcon) offlineIcon.classList.toggle('hidden', !isOffline);

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
 * Check session and verify admin access.
 * @returns {Promise<boolean>}
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
 * Verify admin access via backend API.
 * @param {string} accessToken - The access token.
 * @returns {Promise<boolean>}
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

    // Start Session Enforcement (Background)
    syncSession().then(() => {
      initSessionEnforcement();
    });

    fetchOrders();
    fetchMenuItems();
    initRealtimeSubscriptions();
  }
}

// ============================================
// SESSION ENFORCEMENT
// ============================================

/**
 * Sync Supabase session with backend to get a session token.
 * This bridges the Supabase Auth with our Single Device Enforcement system.
 */
async function syncSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const response = await fetch(`${window.SPOON_CONFIG.API_BASE_URL}/api/auth/sync-session`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.sessionToken) {
        localStorage.setItem('spoon-session-token', data.sessionToken);
        localStorage.setItem('spoon-is-logged-in', 'true');
        console.log('✅ Session synced with backend');
      }
    } else {
      console.warn('⚠️ Session sync failed', response.status);
    }
  } catch (error) {
    console.warn('⚠️ Session sync error', error);
  }
}

/**
 * Initialize Single Device Enforcement (Realtime + Heartbeat)
 */
async function initSessionEnforcement() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) return;

  const email = user.email;
  const filter = `email=eq.${email}`;

  // Store email for session-guard.js (backup enforcement)
  localStorage.setItem('spoon-user-email', email);

  console.log(`🛡️ Initializing session enforcement for ${email}`);

  // Listen for SessionGuard invalidation (Heartbeat/Visibility)
  window.addEventListener('session:invalidated', () => {
    console.warn('⚡ SessionGuard triggered invalidation');
    handleSessionInvalidated();
  });

  // Start SessionGuard explicitly (backup heartbeat for admin)
  // DOMContentLoaded may have already fired before spoon-is-logged-in was set
  if (window.sessionGuard) {
    window.sessionGuard.start();
  }

  // Primary: Realtime subscription for instant detection
  RealtimeSubscriptionManager.subscribeToTable(
    'users',
    (payload) => {
      console.log('📡 Realtime event on users table:', payload);
      // Check if active_session_token changed
      if (payload.new && payload.new.active_session_token) {
        const currentToken = localStorage.getItem('spoon-session-token');
        if (currentToken && payload.new.active_session_token !== currentToken) {
          console.warn('🚫 Session token changed remotely. Logging out.');
          handleSessionInvalidated();
        }
      }
    },
    null,
    filter
  );
}

/**
 * Handle session invalidation (Logout)
 */
function handleSessionInvalidated() {
  // Prevent loops
  if (AdminState.isLoggingOut) return;
  AdminState.isLoggingOut = true;

  // Stop SessionGuard immediately
  if (window.sessionGuard) {
    window.sessionGuard.stop();
  }

  // Clear ALL auth state SYNCHRONOUSLY (before async signOut)
  // This prevents race conditions with SessionGuard's performDefaultLogout
  localStorage.removeItem('spoon-session-token');
  localStorage.removeItem('spoon-user-email');
  localStorage.removeItem('spoon-is-logged-in');
  localStorage.removeItem('spoon-email');
  localStorage.removeItem('spoon-user');

  alert('Your session has been terminated because you logged in on another device.');

  supabase.auth.signOut().then(() => {
    window.location.href = 'login.html';
  });
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
    window.location.href = "../public/index.html";
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
  DOM.settingsMenu?.classList.add('hidden');
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
    // Removed toast - user can retry
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
 * Handle 401 response during API calls.
 * Shows non-blocking prompt instead of immediate redirect.
 */
function handleSessionExpiry() {
  // Show non-blocking prompt (Requirements: 13.2)
  showSessionExpiredPrompt();

  // Current view state is preserved (Requirements: 13.3)
  // User can continue viewing current data
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
 * Initialize the admin dashboard.
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

  // Load told state from localStorage
  loadToldState();

  // Migrate logic removed
  // migrateToldCountsIfNeeded();

  // Start UI timer for wait time updates
  startWaitTimeTimer();

  // Check session and verify admin
  const isAdmin = await checkSession();

  if (isAdmin) {
    hideLoading();

    // Start Session Enforcement (Background)
    syncSession().then(() => {
      initSessionEnforcement();
    });

    fetchOrders();
    fetchMenuItems();
    initRealtimeSubscriptions();
  }
}

// ============================================
// UI TIMER FOR WAIT TIME UPDATES
// ============================================

let waitTimeTimerId = null;

/**
 * Start a UI-only timer that re-renders wait times every 60 seconds.
 * No DB writes or API calls - just recomputes relative times from existing timestamps.
 */
function startWaitTimeTimer() {
  // Clear any existing timer
  if (waitTimeTimerId) {
    clearInterval(waitTimeTimerId);
  }

  // Update every 60 seconds
  waitTimeTimerId = setInterval(() => {
    // Only re-render if we have orders loaded
    if (AdminState.orders.length > 0) {
      console.log('⏱️ Refreshing wait times');
      renderItems();
      renderActiveOrders();
      renderCompletedOrders();
    }
  }, 60000);

  console.log('⏱️ Wait time timer started (60s interval)');
}

/**
 * Stop the wait time timer
 */
function stopWaitTimeTimer() {
  if (waitTimeTimerId) {
    clearInterval(waitTimeTimerId);
    waitTimeTimerId = null;
    console.log('⏱️ Wait time timer stopped');
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopWaitTimeTimer();
  RealtimeSubscriptionManager.cleanup();
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initAdmin);

/**
 * Format pre-order time for display
 * > 45 min → 2:05 PM (Absolute)
 * 1-45 min → in 15m
 * 0 min → Due now
 * < 0 min → Due 5m ago
 * @param {number} minutesUntil - Minutes until pickup (can be negative)
 * @param {string|number} timestamp - Original timestamp for absolute fallback
 * @returns {string} Formatted string
 */
function formatPreOrderTime(minutesUntil, timestamp) {
  if (minutesUntil > 45) {
    return formatAbsoluteTime(new Date(timestamp));
  }

  if (minutesUntil > 0) {
    return `in ${minutesUntil}m`;
  }

  if (minutesUntil === 0) {
    return 'Due now';
  }

  // Negative (Overdue)
  const overdueBy = Math.abs(minutesUntil);
  return `Due ${overdueBy}m ago`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AdminState,
    formatPreOrderTime,
    updateBadgeCounts,
    handleTabSwitch,
    handleTold,
    handleUntold,
    saveToldState,
    loadToldState,
    cleanupToldState,
    isTransitionedPreOrder,
    partitionOrders,
    getNeedsAnnouncingItems,
    getPreOrdersForPlanning,
    formatAbsoluteTime,
    formatRelativeTime
  };
}
