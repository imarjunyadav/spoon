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
  const pendingOrders = AdminState.orders.filter(o => o.status === 'PENDING');
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
  const pendingOrders = orders.filter(o => o.status === 'PENDING');
  
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

/**
 * Get items for Needs Announcing section
 * CRITICAL: Never merge PRE-ORDER and normal orders into the same row.
 * - Normal orders: show "~Xm ago", can merge if same item + within 3 min
 * - Pre-orders: show "in Xm · PRE-ORDER", never merge with normal orders
 * 
 * @returns {Array} Items with quantity, delta, preOrderInfo, etc.
 */
function getNeedsAnnouncingItems() {
  const { needsAnnouncingOrders } = partitionOrders(AdminState.orders);
  const now = Date.now();
  
  // Separate into normal orders and transitioned pre-orders
  const normalOrders = needsAnnouncingOrders.filter(o => !isTransitionedPreOrder(o));
  const preOrders = needsAnnouncingOrders.filter(o => isTransitionedPreOrder(o));
  
  const items = [];
  
  // Process NORMAL orders - can merge by item name + time proximity
  const normalItemBuckets = {}; // key: itemName, value: array of time buckets
  
  normalOrders.forEach(order => {
    const orderTime = new Date(order.created_at).getTime();
    
    (order.items || []).forEach(item => {
      if (!normalItemBuckets[item.title]) {
        normalItemBuckets[item.title] = [];
      }
      
      const buckets = normalItemBuckets[item.title];
      
      // Find a bucket this order can merge into (within 3 min of newest order in bucket)
      let merged = false;
      for (const bucket of buckets) {
        if (Math.abs(orderTime - bucket.newestOrderTime) <= NORMAL_ORDER_MERGE_THRESHOLD_MS) {
          bucket.quantity += item.quantity;
          bucket.orderCount++;
          bucket.oldestOrderTime = Math.min(bucket.oldestOrderTime, orderTime);
          bucket.newestOrderTime = Math.max(bucket.newestOrderTime, orderTime);
          merged = true;
          break;
        }
      }
      
      if (!merged) {
        // Create new bucket
        buckets.push({
          name: item.title,
          quantity: item.quantity,
          orderCount: 1,
          oldestOrderTime: orderTime,
          newestOrderTime: orderTime,
          isPreOrder: false,
          earliestPickupMinutes: null,
        });
      }
    });
  });
  
  // Convert normal buckets to items
  Object.values(normalItemBuckets).forEach(buckets => {
    buckets.forEach(bucket => {
      const waitMinutes = Math.floor((now - bucket.oldestOrderTime) / 60000);
      const toldCount = AdminState.toldCounts[bucket.name] || 0;
      // For normal orders, told count applies per-bucket
      const delta = Math.max(0, bucket.quantity - toldCount);
      
      items.push({
        ...bucket,
        waitMinutes,
        toldCount,
        delta,
        isTold: delta <= 0,
        hasPreOrderSource: false,
      });
    });
  });
  
  // Process PRE-ORDERS - never merge with normal, group by item name only
  const preOrderItems = {};
  
  preOrders.forEach(order => {
    const pickupTime = new Date(order.preorder_time).getTime();
    const minutesUntilPickup = Math.round((pickupTime - now) / 60000);
    const orderTime = new Date(order.created_at).getTime();
    
    (order.items || []).forEach(item => {
      const key = `preorder_${item.title}`;
      
      if (!preOrderItems[key]) {
        preOrderItems[key] = {
          name: item.title,
          quantity: 0,
          orderCount: 0,
          oldestOrderTime: Infinity,
          isPreOrder: true,
          earliestPickupMinutes: Infinity,
        };
      }
      
      const entry = preOrderItems[key];
      entry.quantity += item.quantity;
      entry.orderCount++;
      entry.oldestOrderTime = Math.min(entry.oldestOrderTime, orderTime);
      if (minutesUntilPickup >= 0) {
        entry.earliestPickupMinutes = Math.min(entry.earliestPickupMinutes, minutesUntilPickup);
      }
    });
  });
  
  // Convert pre-order items to array
  Object.values(preOrderItems).forEach(item => {
    const toldCount = AdminState.toldCounts[`preorder_${item.name}`] || 0;
    const delta = Math.max(0, item.quantity - toldCount);
    
    items.push({
      ...item,
      waitMinutes: 0, // Not used for pre-orders
      toldCount,
      delta,
      isTold: delta <= 0,
      hasPreOrderSource: true,
      earliestPickupMinutes: item.earliestPickupMinutes === Infinity ? null : item.earliestPickupMinutes,
    });
  });
  
  return items;
}

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
 * Format relative time (e.g., "in 43 min")
 * @param {number} minutes - Minutes until pickup
 * @returns {string} Formatted relative time
 */
function formatRelativeTime(minutes) {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `in ${hours} hr`;
  return `in ${hours} hr ${mins} min`;
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
    .filter(o => o.status === 'PENDING')
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
 * Two sections: "Needs Announcing" (action items) and "Pre-orders" (planning only)
 * Told items hidden by default with optional filter to show them
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
  
  // Told filter toggle (only show if there are hidden items)
  if (hasToldItems) {
    html += renderToldFilterToggle(hidden.length);
    
    // Show told items if filter is active
    if (AdminState.showToldItems) {
      html += `<div class="item-section-header item-section-header--muted">Already told</div>`;
      html += hidden.map(item => renderToldRow(item)).join('');
    }
  }
  
  // Section 2: Pre-orders (planning only, no action buttons)
  if (hasPreOrders) {
    html += renderPreOrdersSection(preOrderSlots);
  }
  
  DOM.itemsList.innerHTML = html;
  
  // Add click handlers for TOLD buttons
  DOM.itemsList.querySelectorAll('.item-row__told').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleTold(btn.dataset.itemName, parseInt(btn.dataset.itemQuantity, 10));
    });
  });
  
  // Add click handler for told filter toggle
  const toldToggle = DOM.itemsList.querySelector('.told-filter-toggle');
  if (toldToggle) {
    toldToggle.addEventListener('click', toggleToldFilter);
  }
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
  // Use different key for pre-orders to keep told counts separate
  const toldKey = item.hasPreOrderSource ? `preorder_${item.name}` : item.name;
  const isPendingTold = AdminState.pendingToldActions.has(toldKey);
  
  // Always show time hint:
  // - Pre-orders: "in Xm" (time until pickup)
  // - Live orders: "~Xm ago" (time since oldest order)
  let timeHint = '';
  if (item.hasPreOrderSource && item.earliestPickupMinutes !== null) {
    // Pre-order: show time until pickup
    timeHint = formatRelativeTime(item.earliestPickupMinutes);
  } else if (item.waitMinutes !== undefined) {
    // Live order: show time since oldest order
    timeHint = `~${item.waitMinutes}m ago`;
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
                  data-item-name="${escapeHtml(toldKey)}"
                  data-item-quantity="${item.quantity}">
            ${isPendingTold ? pendingIcon : checkIcon}
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render the told filter toggle button
 * @param {number} hiddenCount - Number of hidden (told) items
 * @returns {string} HTML string
 */
function renderToldFilterToggle(hiddenCount) {
  if (hiddenCount === 0) return '';
  
  const isActive = AdminState.showToldItems;
  const label = isActive ? `Hide told (${hiddenCount})` : `Show told (${hiddenCount})`;
  
  return `
    <button class="told-filter-toggle ${isActive ? 'told-filter-toggle--active' : ''}"
            aria-pressed="${isActive}"
            aria-label="${label}">
      ${label}
    </button>
  `;
}

/**
 * Render a told item row (muted style, no TOLD button)
 * Uses same time logic as Needs Announcing, just visually muted
 * @param {Object} item - Item data from getNeedsAnnouncingItems()
 * @returns {string} HTML string
 */
function renderToldRow(item) {
  // Same time hint logic as renderNeedsAnnouncingRow:
  // - Pre-orders: "in Xm" (time until pickup)
  // - Live orders: "~Xm ago" (time since oldest order)
  let timeHint = '';
  if (item.hasPreOrderSource && item.earliestPickupMinutes !== null) {
    timeHint = formatRelativeTime(item.earliestPickupMinutes);
  } else if (item.waitMinutes !== undefined) {
    timeHint = `~${item.waitMinutes}m ago`;
  }
  
  // PRE-ORDER badge sits inline with time, not near item name
  const timeRow = timeHint || item.hasPreOrderSource ? `
    <div class="item-row__time-row">
      ${timeHint ? `<span class="item-row__time-hint">${timeHint}</span>` : ''}
      ${item.hasPreOrderSource ? '<span class="item-row__preorder-badge">PRE-ORDER</span>' : ''}
    </div>
  ` : '';
  
  return `
    <div class="item-row item-row--told"
         role="listitem"
         aria-label="${item.quantity} ${item.name}, told${timeHint ? `, ${timeHint}` : ''}">
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
    
    // Removed toast - UI state change is sufficient feedback
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
  // Get unique base item names (not bucket keys)
  const currentItemNames = new Set(Object.values(currentItems).map(item => item.name));
  
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
 * Simple card layout focused on items readability
 * Header: time, pre-order label (if applicable), items count, done button
 * Body: items list
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
  
  // Filter by COMPLETE status and sort by time ascending (oldest first) (Requirements: 5.6)
  let orders = AdminState.orders
    .filter(o => o.status === 'COMPLETE')
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
  
  // Apply strict search filter - only show matching orders
  const searchQuery = AdminState.searchQuery.trim().toUpperCase();
  
  if (searchQuery) {
    orders = orders.filter(order => 
      order.verification_code?.toUpperCase().includes(searchQuery)
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
        timeDisplay = waitMinutes >= 0 ? `~${waitMinutes} min` : '';
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
    // Pre-order separation exports
    needsAnnouncing,
    isTransitionedPreOrder,
    partitionOrders,
    getNeedsAnnouncingItems,
    getVisibleNeedsAnnouncingItems,
    getPreOrdersForPlanning,
    formatAbsoluteTime,
    formatRelativeTime,
    toggleToldFilter
  };
}
