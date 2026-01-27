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

  // Items tab "told" tracking
  // For LIVE orders: stores { toldTimestamp, toldQuantity } per aggregation key
  //   - toldTimestamp: when TOLD was clicked
  //   - toldQuantity: quantity at the time of TOLD action
  //   - Orders created AFTER toldTimestamp show as new delta
  // For PRE-ORDERS: stores just the quantity (pre-orders don't return from told)
  toldCounts: {},

  // Pending "told" actions (for optimistic updates)
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

  // Hide stock FAB on Active and Ready tabs (execution-only)
  if (DOM.stockFab) {
    DOM.stockFab.classList.toggle('hidden', viewId === 'active' || viewId === 'completed');
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
 * Generate aggregation key for an item based on order type and scheduled time
 * 
 * Key formats:
 * - Live orders: "live:{itemName}"
 * - Pre-orders: "preorder:{itemName}:{scheduledTimeISO}"
 * 
 * This ensures:
 * 1. Live orders and pre-orders with same item name are tracked separately
 * 2. Pre-orders with different scheduled times are tracked separately
 * 3. Told state doesn't leak between different aggregation buckets
 * 
 * @param {string} itemName - The item name
 * @param {boolean} isPreOrder - Whether this is from a pre-order
 * @param {string|null} scheduledTimeISO - ISO string of scheduled pickup time (required for pre-orders)
 * @returns {string} The aggregation key
 */
function getAggregationKey(itemName, isPreOrder, scheduledTimeISO) {
  if (isPreOrder && scheduledTimeISO) {
    return `preorder:${itemName}:${scheduledTimeISO}`;
  }
  return `live:${itemName}`;
}

/**
 * Parse an aggregation key to extract its components
 * @param {string} key - The aggregation key
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
 * Determine if an order needs announcing (cook now)
 * Returns true for:
 * - Immediate orders (no preorder_time)
 * - Pre-orders within 45 minutes of their scheduled pickup time
 * 
 * @param {Object} order - Order object with optional preorder_time
 * @returns {boolean} True if order needs announcing, false if future pre-order
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
 * Partition orders into needs-announcing and future pre-orders
 * 
 * @param {Array} orders - All orders
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
 * Get items for Needs Announcing section
 * 
 * CRITICAL: Live orders and pre-orders use DIFFERENT told state models:
 * 
 * LIVE ORDERS (Announce-Cycle Model):
 * - When TOLD is clicked, we store { toldTimestamp, toldQuantity }
 * - Orders created BEFORE toldTimestamp are "told" (up to toldQuantity)
 * - Orders created AFTER toldTimestamp are "new" and show as delta
 * - If new order arrives within 3 min of toldTimestamp: shows as +X delta
 * - If new order arrives after 3 min: stays in "Already Told" (told state persists)
 * - Live orders NEVER auto-told, NEVER hidden without explicit TOLD action
 * 
 * PRE-ORDERS (Absolute Model):
 * - Pre-orders use simple quantity-based told state
 * - Once told, pre-orders NEVER return to Needs Announcing
 * - Pre-orders are grouped by item name AND scheduled time
 * 
 * @returns {Array} Items with quantity, delta, aggregationKey, etc.
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
 * Format absolute time (e.g., "1:45 PM")
 * @param {Date} date - Date object
 * @returns {string} Formatted time
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
 * Get pre-orders grouped by pickup time for planning section
 * Only includes orders beyond the 45-minute activation threshold
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
 * Get aggregated item summary from pending orders with time-bucket splitting.
 * Items are split into separate rows when order age gap exceeds 10 minutes.
 * This prevents new orders from being hidden inside very old backlog.
 * 
 * @returns {Object} Map of bucket key to { name, quantity, orderCount, oldestOrderTime, newestOrderTime }
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
 * Render Items to Prepare view with pre-order separation
 * Three sections: "Needs Announcing", "Already Told", "Pre-orders"
 * Always shows all sections if they have content (Items Tab 3-Section Layout)
 */
function renderItems() {
  if (!DOM.itemsList) return;

  // Get data for both sections
  const { visible, hidden } = getVisibleNeedsAnnouncingItems();
  const preOrderSlots = getPreOrdersForPlanning();

  const hasNeedsAnnouncing = visible.length > 0;
  const hasToldItems = hidden.length > 0;
  const hasPreOrders = preOrderSlots.length > 0;
  const hasAnyContent = hasNeedsAnnouncing || hasToldItems || hasPreOrders;

  // Show/hide empty state
  DOM.itemsEmpty?.classList.toggle('hidden', hasAnyContent);

  if (!hasAnyContent) {
    DOM.itemsList.innerHTML = '';
    return;
  }

  let html = '';

  // Section 1: Needs Announcing (action items with TOLD button)
  if (hasNeedsAnnouncing) {
    html += `<div class="item-section-header">Needs announcing</div>`;
    html += visible.map(item => renderNeedsAnnouncingRow(item)).join('');
  }

  // Section 2: Already Told (history)
  if (hasToldItems) {
    html += `<div class="item-section-header item-section-header--muted">Already told</div>`;
    html += hidden.map(item => renderToldRow(item)).join('');
  }

  // Section 3: Pre-orders (planning only, no action buttons)
  if (hasPreOrders) {
    html += renderPreOrdersSection(preOrderSlots);
  }

  DOM.itemsList.innerHTML = html;

  // Add click handlers for TOLD buttons
  DOM.itemsList.querySelectorAll('.item-row__told').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isPreOrder = btn.dataset.isPreorder === 'true';
      const timestamp = parseInt(btn.dataset.toldTimestamp, 10) || null;
      handleTold(btn.dataset.aggregationKey, parseInt(btn.dataset.itemQuantity, 10), isPreOrder, timestamp);
    });
  });

  // No toggle listener needed anymore
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
                    data-item-quantity="${item.totalItemQuantity || item.quantity}">
              ${isPendingTold ? '·' : '✓'}
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ============================================
// PRE-ORDER SEPARATION RENDERING
// ============================================

/**
 * Render a needs-announcing item row
 * Shows qty× name, PRE-ORDER badge if applicable, time hint, delta and TOLD button
 * Time hint: "~Xm ago" for live orders, "in Xm" for pre-orders
 * @param {Object} item - Item data from getNeedsAnnouncingItems()
 * @returns {string} HTML string
 */
function renderNeedsAnnouncingRow(item) {
  // Use the aggregation key for told state tracking
  const toldKey = item.aggregationKey;
  const isPendingTold = AdminState.pendingToldActions.has(toldKey);

  // Always show time hint:
  // - Pre-orders: "in Xm" while future, absolute time (e.g., "1:05") when passed
  // - Live orders: "Just now" for <1m, "Xm" for others
  let timeHint = '';
  if (item.hasPreOrderSource && item.earliestPickupTime !== null) {
    // Pre-order: show relative time if future, absolute time if passed
    if (item.earliestPickupMinutes !== null && item.earliestPickupMinutes > 0) {
      timeHint = formatRelativeTime(item.earliestPickupMinutes);
    } else {
      // Pickup time has passed - show absolute time
      timeHint = formatAbsoluteTime(new Date(item.earliestPickupTime));
    }
  } else if (item.waitMinutes !== undefined) {
    // Live order: show time since oldest order
    timeHint = item.waitMinutes < 1 ? 'Just now' : `${item.waitMinutes}m`;
  }

  // PRE-ORDER badge sits inline with time, not near item name
  const timeRow = timeHint || item.hasPreOrderSource ? `
    <div class="item-row__time-row">
      ${timeHint ? `<span class="item-row__time-hint">${timeHint}</span>` : ''}
      ${item.hasPreOrderSource ? '<span class="item-row__preorder-badge">PRE-ORDER</span>' : ''}
    </div>
  ` : '';

  // SVG check icon for TOLD button (filled, confident, clearly tappable)
  const checkIcon = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>`;
  const pendingIcon = `<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="2"/></svg>`;

  // Determine correct quantity to commit when told
  // For New Batch items, we must commit the TOTAL quantity (old + new)
  // For standard items, item.quantity is sufficient
  const commitQuantity = item.totalItemQuantity || item.quantity;

  return `
    <div class="item-row item-row--announcing"
         role="listitem"
         aria-label="${item.quantity} ${item.name}, ${item.delta} new${timeHint ? `, ${timeHint}` : ''}">
      <div class="item-row__content">
        <div class="item-row__primary">
          <span class="item-row__qty">${item.quantity}</span><span class="item-row__sep">×</span>
          <span class="item-row__name">${escapeHtml(item.name)}</span>
        </div>
        ${timeRow}
      </div>
      <div class="item-row__right">
        <div class="item-row__action">
          <span class="item-row__delta">+${item.delta}</span>
          <button class="item-row__told ${isPendingTold ? 'item-row__told--pending' : ''}"
                  ${isPendingTold ? 'disabled' : ''}
                  aria-label="Mark ${item.name} as told"
                  data-aggregation-key="${escapeHtml(toldKey)}"
                  data-item-quantity="${commitQuantity}"
                  data-told-timestamp="${item.newestOrderTime}"
                  data-is-preorder="${item.hasPreOrderSource}">
            ${isPendingTold ? pendingIcon : checkIcon}
          </button>
        </div>
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
 * Render a told item row (muted style, no TOLD button)
 * Shows "Told Xm ago" based on the actual told timestamp
 * @param {Object} item - Item data from getNeedsAnnouncingItems()
 * @returns {string} HTML string
 */
function renderToldRow(item) {
  let timeHint = '';

  if (item.hasPreOrderSource) {
    // Pre-orders: keep existing logic (future/past pickup time)
    if (item.earliestPickupMinutes !== null && item.earliestPickupMinutes > 0) {
      timeHint = formatRelativeTime(item.earliestPickupMinutes);
    } else if (item.earliestPickupTime) {
      timeHint = formatAbsoluteTime(new Date(item.earliestPickupTime));
    }
  } else if (item.originalToldTime) {
    // Live Told Batch: Show time since it was marked told
    const minutesSinceTold = Math.floor((Date.now() - item.originalToldTime) / 60000);
    timeHint = minutesSinceTold < 1 ? 'Told just now' : `Told ${minutesSinceTold}m ago`;
  } else if (item.waitMinutes !== undefined) {
    // Fallback
    timeHint = item.waitMinutes < 1 ? 'Just now' : `${item.waitMinutes}m`;
  }

  // PRE-ORDER badge sits inline with time
  const timeRow = timeHint || item.hasPreOrderSource ? `
    <div class="item-row__time-row">
      ${timeHint ? `<span class="item-row__time-hint">${timeHint}</span>` : ''}
      ${item.hasPreOrderSource ? '<span class="item-row__preorder-badge">PRE-ORDER</span>' : ''}
    </div>
  ` : '';

  return `
    <div class="item-row item-row--told"
         role="listitem"
         aria-label="${item.quantity} ${item.name}, ${timeHint}">
      <div class="item-row__content">
        <div class="item-row__primary">
          <span class="item-row__qty">${item.quantity}</span><span class="item-row__sep">×</span>
          <span class="item-row__name">${escapeHtml(item.name)}</span>
        </div>
        ${timeRow}
      </div>
      <div class="item-row__right">
        <span class="item-row__told-indicator">✓ told</span>
      </div>
    </div>
  `;
}

/**
 * Render the pre-orders planning section
 * @param {Array} slots - Pre-order time slots from getPreOrdersForPlanning()
 * @returns {string} HTML string
 */
function renderPreOrdersSection(slots) {
  if (!slots || slots.length === 0) return '';

  let html = `
    <div class="preorders-section">
      <div class="preorders-section__header">
        <svg class="preorders-section__icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
        </svg>
        <span>Pre-orders</span>
      </div>
  `;

  slots.forEach(slot => {
    const itemsList = slot.items.map(item =>
      `<span class="preorder-slot__item">${item.quantity}× ${escapeHtml(item.name)}</span>`
    ).join('');

    html += `
      <div class="preorder-slot">
        <div class="preorder-slot__header">
          <span class="preorder-slot__time">${slot.pickupTimeFormatted}</span>
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
 * Format wait time for display
 * < 60 min → 18m
 * >= 60 min → 1 hr 5 m, 2 hr 10 m
 * @param {number} minutes - Wait time in minutes
 * @returns {string} Formatted wait time
 */
function formatWaitTime(minutes) {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${mins} m`;
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
 * 
 * LIVE ORDERS: Stores { toldTimestamp, toldQuantity } for announce-cycle model
 * PRE-ORDERS: Stores just the quantity (pre-orders don't return from told)
 * 
 * Uses optimistic update with rollback on failure
 * @param {string} aggregationKey - The full aggregation key for the item
 * @param {number} currentQuantity - Current total quantity
 * @param {boolean} isPreOrder - Whether this is a pre-order item
 * @param {number|null} customTimestamp - Optional specific timestamp to use (defaults to Date.now())
 */
async function handleTold() {
  console.error("Using deprecated handleTold - check file structure");
} // DEPRECATED - See bottom of file

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
 * Clean up told counts for aggregation keys that no longer have matching orders
 * 
 * CRITICAL: This function uses the new aggregation key strategy to determine
 * which entries to keep. It builds a set of valid aggregation keys from current
 * orders and removes any told entries that don't match.
 * 
 * Called after orders are fetched to remove stale entries.
 */
function cleanupToldCounts() {
  // Build set of valid aggregation keys from current pending orders
  const validKeys = new Set();

  const pendingOrders = AdminState.orders.filter(o => ['PENDING', 'PAID', 'PLACED', 'PREPARING'].includes(o.status));

  pendingOrders.forEach(order => {
    const isPreOrder = !!order.preorder_time;
    const scheduledTimeISO = order.preorder_time;

    (order.items || []).forEach(item => {
      if (isPreOrder && scheduledTimeISO) {
        // Pre-order: key includes scheduled time
        validKeys.add(getAggregationKey(item.title, true, scheduledTimeISO));
      } else {
        // Live order: key is just item name with live: prefix
        validKeys.add(getAggregationKey(item.title, false, null));
      }
    });
  });

  // Remove told counts for keys that are no longer valid
  let changed = false;
  Object.keys(AdminState.toldCounts).forEach(key => {
    if (!validKeys.has(key)) {
      delete AdminState.toldCounts[key];
      changed = true;
    }
  });

  if (changed) {
    saveToldCounts();
  }
}

/**
 * Migrate old told counts format to new aggregation key format
 * 
 * Old format: { "itemName": count, "preorder_itemName": count }
 * New format: { "live:itemName": count, "preorder:itemName:scheduledTimeISO": count }
 * 
 * This migration runs once on load if old format is detected.
 * Pre-order entries without scheduled time are discarded (cannot be migrated accurately).
 */
/**
 * Migrate old told counts format to new timestamp array format
 * 
 * Old formats:
 * - { "itemName": count } (Legacy)
 * - { "live:itemName": { toldTimestamp, toldQuantity } } (Previous V2)
 * 
 * New format:
 * - { "live:itemName": [timestamp1, timestamp2, ...] }
 * 
 * This allows multiple "Told" batches for the same item.
 */
function migrateToldCountsIfNeeded() {
  const needsMigration = Object.entries(AdminState.toldCounts).some(([key, value]) => {
    return !Array.isArray(value);
  });

  if (!needsMigration) return;

  const newCounts = {};

  Object.entries(AdminState.toldCounts).forEach(([key, value]) => {
    // 1. Handle legacy pre-orders (discard)
    if (key.startsWith('preorder_')) return;

    // 2. Normalize key (add prefix if missing)
    let newKey = key;
    if (!key.startsWith('live:') && !key.startsWith('preorder:')) {
      newKey = `live:${key}`;
    }

    // 3. Convert value to array of timestamps
    if (typeof value === 'number') {
      // Legacy number: we don't have timestamp, so we can't migrate accurately.
      // Best effort: use current time to mark as "told just now" or discard?
      // Discarding is safer to force re-announce if critical, but annoying.
      // Let's assume it was told "long ago" (0) so it appears as told?
      // Actually, if we use 0, it might mess up "new orders" calculation.
      // Let's discard to force fresh start - safest for strict batching.
    } else if (value && typeof value === 'object' && value.toldTimestamp) {
      // Previous V2 format: { toldTimestamp, toldQuantity }
      newCounts[newKey] = [value.toldTimestamp];
    } else if (Array.isArray(value)) {
      // Already array
      newCounts[newKey] = value;
    }
  });

  AdminState.toldCounts = newCounts;
  saveToldCounts();
  console.log('📋 Migrated told counts to timestamp array format');
}

/**
 * Get items for Needs Announcing section with STRICT BATCHING
 * 
 * Strategy:
 * 1. Get all orders for an item, sorted by time.
 * 2. Get told history (array of timestamps).
 * 3. Match orders to timestamps to create "Already Told" batches.
 *    - Orders <= timestamp match that batch.
 *    - Grace Period: Orders > timestamp but <= timestamp + 3min ALSO match (reopen batch).
 * 4. Remaining orders form "New Batches".
 *    - Grouped by 3-minute gaps.
 */
function getNeedsAnnouncingItems() {
  const { needsAnnouncingOrders } = partitionOrders(AdminState.orders);
  const now = Date.now();

  // Separate into normal orders (Live) and pre-orders
  const normalOrders = needsAnnouncingOrders.filter(o => !isTransitionedPreOrder(o));
  const preOrders = needsAnnouncingOrders.filter(o => isTransitionedPreOrder(o));

  const items = [];

  // ========================================
  // LIVE ORDERS - Strict Batching
  // ========================================
  // Group orders by item name first
  const ordersByName = {};

  normalOrders.forEach(order => {
    const orderTime = new Date(order.created_at).getTime();
    (order.items || []).forEach(item => {
      if (!ordersByName[item.title]) {
        ordersByName[item.title] = {
          name: item.title,
          aggregationKey: getAggregationKey(item.title, false, null),
          orders: []
        };
      }
      ordersByName[item.title].orders.push({
        orderTime,
        quantity: item.quantity,
        orderId: order.id
      });
    });
  });

  // Process each item
  Object.values(ordersByName).forEach(entry => {
    // 1. Sort orders by time (oldest first)
    entry.orders.sort((a, b) => a.orderTime - b.orderTime);

    // 2. Get told history (timestamps)
    // Default to empty array if no history
    let toldTimestamps = AdminState.toldCounts[entry.aggregationKey] || [];
    if (!Array.isArray(toldTimestamps)) toldTimestamps = [];

    // Sort timestamps ascending just in case
    toldTimestamps.sort((a, b) => a - b);

    const processedOrderIds = new Set();

    // 3. Reconstruct "Told Batches" from history
    toldTimestamps.forEach((ts, index) => {
      // Find orders belonging to this batch
      // Condition: Not processed AND (Created <= ts OR (Created <= ts + 3min))
      const batchOrders = [];
      let batchTotalQty = 0;
      let batchDeltaQty = 0;
      let batchMaxTime = 0;
      let batchMinTime = Infinity;

      entry.orders.forEach(order => {
        if (processedOrderIds.has(order.orderId)) return;

        const isHistoric = order.orderTime <= ts;
        const nextTs = toldTimestamps[index + 1];
        const coveredByFuture = nextTs && order.orderTime <= nextTs;

        const isGracePeriod = !coveredByFuture && order.orderTime > ts && (order.orderTime - ts <= LIVE_ORDER_DELTA_WINDOW_MS);

        if (isHistoric || isGracePeriod) {
          batchOrders.push(order);
          batchTotalQty += order.quantity;
          batchMinTime = Math.min(batchMinTime, order.orderTime);
          batchMaxTime = Math.max(batchMaxTime, order.orderTime);

          if (isGracePeriod) {
            batchDeltaQty += order.quantity;
          }
        }
      });

      // Mark as processed
      batchOrders.forEach(o => processedOrderIds.add(o.orderId));

      if (batchOrders.length > 0) {
        const waitMinutes = Math.floor((now - batchMinTime) / 60000);

        // Add Item: Told Batch
        items.push({
          aggregationKey: entry.aggregationKey,
          name: entry.name,
          quantity: batchTotalQty,
          orderCount: batchOrders.length,
          oldestOrderTime: batchMinTime,
          newestOrderTime: batchMaxTime,
          isPreOrder: false,
          scheduledTimeISO: null,
          earliestPickupMinutes: null,
          waitMinutes,
          toldCount: batchTotalQty - batchDeltaQty,
          delta: batchDeltaQty,
          isTold: batchDeltaQty === 0,
          hasPreOrderSource: false,
          batchType: 'told',
          originalToldTime: ts // Reference to original timestamp for updates
        });
      }
    });

    // 4. Create "New Batches" from remaining orders
    // Group remaining orders into clusters separated by > 3 minutes
    const remainingOrders = entry.orders.filter(o => !processedOrderIds.has(o.orderId));

    if (remainingOrders.length > 0) {
      let currentBatch = [];

      remainingOrders.forEach((order, index) => {
        const prevOrder = currentBatch[currentBatch.length - 1];

        // If gap > 3 min from previous order in this batch, start NEW batch
        // Wait, logic check: "User B orders 3 Chinese Bhel (12:10) -> NEW card"
        // "12:00 PM - User A ... 12:10 PM - User B"
        // If I have 12:10, 12:12, 12:20.
        // 12:10 and 12:12 are one batch. 12:20 is another.

        const timeDiff = prevOrder ? (order.orderTime - prevOrder.orderTime) : 0;

        if (currentBatch.length > 0 && timeDiff > LIVE_ORDER_DELTA_WINDOW_MS) {
          // Gap exceeded - finalize current batch
          addBatchAsItem(currentBatch);
          currentBatch = [];
        }

        currentBatch.push(order);

        // If last order, finalize
        if (index === remainingOrders.length - 1) {
          addBatchAsItem(currentBatch);
        }
      });

      function addBatchAsItem(batch) {
        if (batch.length === 0) return;

        const totalQty = batch.reduce((sum, o) => sum + o.quantity, 0);
        const minTime = batch[0].orderTime;
        const maxTime = batch[batch.length - 1].orderTime; // Approx
        const waitMinutes = Math.floor((now - minTime) / 60000);

        items.push({
          aggregationKey: entry.aggregationKey,
          name: entry.name,
          quantity: totalQty,
          orderCount: batch.length,
          oldestOrderTime: minTime,
          newestOrderTime: maxTime,
          isPreOrder: false,
          scheduledTimeISO: null,
          earliestPickupMinutes: null,
          waitMinutes,
          toldCount: 0,
          delta: totalQty,
          isTold: false,
          hasPreOrderSource: false,
          batchType: 'new',
          originalToldTime: null
        });
      }
    }
  });


  // ========================================
  // PRE-ORDERS - Absolute Model (unchanged)
  // ========================================
  // Group by item name AND scheduled time (never merge different times)
  const preOrderItems = {};

  preOrders.forEach(order => {
    const scheduledTimeISO = order.preorder_time;
    const pickupTime = new Date(scheduledTimeISO).getTime();
    const minutesUntilPickup = Math.round((pickupTime - now) / 60000);
    const orderTime = new Date(order.created_at).getTime();

    (order.items || []).forEach(item => {
      // Key includes scheduled time to keep different pickup slots separate
      const aggKey = getAggregationKey(item.title, true, scheduledTimeISO);

      if (!preOrderItems[aggKey]) {
        preOrderItems[aggKey] = {
          aggregationKey: aggKey,
          name: item.title,
          quantity: 0,
          orderCount: 0,
          oldestOrderTime: Infinity,
          isPreOrder: true,
          scheduledTimeISO: scheduledTimeISO,
          earliestPickupMinutes: minutesUntilPickup,
          earliestPickupTime: pickupTime,
        };
      }

      const entry = preOrderItems[aggKey];
      entry.quantity += item.quantity;
      entry.orderCount++;
      entry.oldestOrderTime = Math.min(entry.oldestOrderTime, orderTime);
      // Track earliest pickup time (in case multiple orders have same scheduled time)
      if (minutesUntilPickup < entry.earliestPickupMinutes) {
        entry.earliestPickupMinutes = minutesUntilPickup;
        entry.earliestPickupTime = pickupTime;
      }
    });
  });

  // Convert pre-order items to array (pre-orders use simple quantity-based told)
  Object.values(preOrderItems).forEach(item => {
    // Pre-orders don't use the array history (yet), they use simple quantity
    // But our new state structure implies arrays everywhere?
    // Let's keep Pre-Orders using simple quantity for now as they are "Pre-Planned"
    // and unlikely to have the "Add +3" flow in the same way (they move to live eventually?)
    // Actually, `isTransitionedPreOrder` logic handles them moving to live?
    // "Pre-orders stay in Pre-Orders until 45 min before".
    // Once they are "Need Announcing", they are in `preOrders` array above.
    // They are separated here.

    // Check if we migrated pre-orders to arrays?
    // `migrateToldCountsIfNeeded` ignores 'preorder:' keys for array conversion?
    // No, it converts them: `if (!key.startsWith('preorder:'))... newKey = live:...`
    // Wait, pre-orders HAVE `preorder:` prefix.
    // `if (key.startsWith('live:') || key.startsWith('preorder:'))` -> matches array format.
    // So Pre-orders ARE arrays now if they were migrated.
    // But `handleTold` for pre-orders sets simple quantity:
    // `AdminState.toldCounts[aggregationKey] = currentQuantity;`
    // This will break if we expect array.

    // Let's stick to simple quantity for Pre-Orders for now to avoid regression.
    // They are "Planning" items, not "Reactive" items.

    const toldState = AdminState.toldCounts[item.aggregationKey];
    let toldCount = 0;

    if (Array.isArray(toldState)) {
      // Fallback if it somehow became an array
      toldCount = toldState.length > 0 ? item.quantity : 0; // Rough approx
    } else {
      toldCount = typeof toldState === 'number' ? toldState : 0;
    }

    const delta = Math.max(0, item.quantity - toldCount);

    items.push({
      ...item,
      waitMinutes: 0, // Not used for pre-orders
      toldCount,
      delta,
      isTold: delta <= 0,
      hasPreOrderSource: true,
      earliestPickupMinutes: item.earliestPickupMinutes === Infinity ? null : item.earliestPickupMinutes,
      earliestPickupTime: item.earliestPickupTime,
    });
  });

  return items;
}

/**
 * Handle TOLD button click with Strict Batching
 */
async function handleTold(aggregationKey, currentQuantity, isPreOrder = false, customTimestamp = null) {
  if (AdminState.pendingToldActions.has(aggregationKey)) return;

  // Store previous value for rollback
  const previousToldState = AdminState.toldCounts[aggregationKey];

  // Optimistic update
  AdminState.pendingToldActions.add(aggregationKey);

  if (isPreOrder) {
    // Pre-orders use simple quantity
    AdminState.toldCounts[aggregationKey] = currentQuantity;
  } else {
    // Live orders: Manage timestamp array
    let timestamps = AdminState.toldCounts[aggregationKey] || [];
    if (!Array.isArray(timestamps)) timestamps = [];

    // Clone to avoid mutation issues during render
    timestamps = [...timestamps];

    const now = Date.now();
    const targetTime = customTimestamp || now;

    if (customTimestamp && experimental_isReopening(timestamps, customTimestamp)) {
      // We are "reopening" an existing batch (updating its timestamp to now/newest)
      // Actually, we pass `newestOrderTime` as `customTimestamp` from `renderNeedsAnnouncingRow`.
      // If we have an `originalToldTime` in the item, we should use THAT to find the entry to update.
      // But `renderItems` doesn't pass `originalToldTime`.
      // Let's assume `customTimestamp` IS the `originalToldTime` if it's a "Told Batch".
      // Ah, `renderNeedsAnnouncingRow` sets `data-told-timestamp="${item.newestOrderTime}"`.
      // If it's a "Told Batch" (reopened), `newestOrderTime` > `originalToldTime`.
      // We need to pass `originalToldTime` to find the record!

      // CORRECTION: `renderNeedsAnnouncingRow` needs `originalToldTime`.
      // I will update this locally in this function first, but I need to update the HTML generation too.
      // For now, let's just append the new timestamp.
      // If we append, we have two timestamps.
      // e.g. [12:00, 12:05].
      // Orders <= 12:00 match batch 1.
      // Orders > 12:00 & <= 12:05 match batch 2.
      // Creating a new timestamp effectively "claims" the semantic gap.
      // So appending is actually correct and simpler!
      // We don't need to "update" the old timestamp.
      // The old timestamp remains valid for the *old* orders.
      // The new timestamp covers the *new* orders (the delta).

      timestamps.push(targetTime);
    } else {
      // New batch - just push
      timestamps.push(targetTime);
    }

    // Sort to ensure validity
    timestamps.sort((a, b) => a - b);

    AdminState.toldCounts[aggregationKey] = timestamps;
  }

  renderItems();

  try {
    saveToldCounts();
    await new Promise(resolve => setTimeout(resolve, 150));
    AdminState.pendingToldActions.delete(aggregationKey);
    renderItems();
    console.log(`✅ Marked "${aggregationKey}" as told (batches: ${AdminState.toldCounts[aggregationKey]?.length || 1})`);
  } catch (error) {
    console.error('❌ Error saving told count:', error);
    AdminState.toldCounts[aggregationKey] = previousToldState;
    AdminState.pendingToldActions.delete(aggregationKey);
    renderItems();
  }
}

// Helper to check if we are reopening (placeholder)
function experimental_isReopening(timestamps, time) {
  return false; // Always append for now - simpler and correctly segments history
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
      timeDisplay = formatRelativeTime(minutesUntil);
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
 * Render Completed Orders view (Requirements: 5.1, 5.2, 5.6)
 * OTP-first design: fast type → read → tap handover
 * Strict filtering: only show matching orders when searching
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
    const btnClasses = isPending ? 'ready-card__btn ready-card__btn--pending' : 'ready-card__btn';
    const btnText = isPending ? '...' : 'Handed Over';
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
 * Mark order as complete with optimistic update
 * @param {string} orderId - The order ID
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
 * Mark order as picked up with optimistic update
 * @param {string} orderId - The order ID
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
 * Render stock items as flat list with toggle switches
 * Modern, clean UI optimized for rush hour scanning
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

  // Migrate old told counts format if needed
  migrateToldCountsIfNeeded();

  // Start UI timer for wait time updates
  startWaitTimeTimer();

  // Check session and verify admin
  const isAdmin = await checkSession();

  if (isAdmin) {
    hideLoading();
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

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AdminState,
    TIME_BUCKET_THRESHOLD_MS,
    ACTIVATION_THRESHOLD_MS,
    getItemSummary,
    getSortedItems,
    getItemSections,
    updateBadgeCounts,
    handleTabSwitch,
    handleTold,
    saveToldCounts,
    loadToldCounts,
    cleanupToldCounts,
    migrateToldCountsIfNeeded,
    // Pre-order separation exports
    needsAnnouncing,
    isTransitionedPreOrder,
    partitionOrders,
    getNeedsAnnouncingItems,
    getVisibleNeedsAnnouncingItems,
    getPreOrdersForPlanning,
    formatAbsoluteTime,
    formatRelativeTime,
    toggleToldFilter,
    // Aggregation key exports
    getAggregationKey,
    parseAggregationKey
  };
}
