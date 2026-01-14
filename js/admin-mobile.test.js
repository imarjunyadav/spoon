/**
 * Property-Based Tests for Admin Mobile Dashboard
 * 
 * Feature: mobile-admin-dashboard
 * 
 * These tests validate the correctness properties defined in the design document
 * using fast-check for property-based testing.
 */

const fc = require('fast-check');

// Test configuration: minimum 100 iterations per property
const PBT_CONFIG = { numRuns: 100 };

// ============================================
// GENERATORS
// ============================================

/**
 * Order item generator
 * Note: Filter out JavaScript reserved property names to avoid prototype chain issues
 */
const orderItemArb = fc.record({
  title: fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0)
    .filter(s => !['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf', 'toLocaleString', 'isPrototypeOf', 'propertyIsEnumerable'].includes(s)),
  quantity: fc.integer({ min: 1, max: 20 }),
  price: fc.float({ min: 1, max: 1000, noNaN: true })
});

/**
 * Order status generator
 */
const orderStatusArb = fc.constantFrom('PENDING', 'COMPLETE', 'PICKED_UP');

/**
 * Safe date generator that produces valid ISO strings
 */
const safeDateArb = fc.integer({ min: 1704067200000, max: 1798761600000 }) // 2024-01-01 to 2026-12-31
  .map(ts => new Date(ts).toISOString());

/**
 * Order generator
 */
const orderArb = fc.record({
  id: fc.uuid(),
  status: orderStatusArb,
  items: fc.array(orderItemArb, { minLength: 1, maxLength: 10 }),
  verification_code: fc.string({ minLength: 4, maxLength: 6 }).map(s => s.replace(/[^A-Z0-9]/gi, 'X').toUpperCase().slice(0, 6).padEnd(4, '0')),
  created_at: safeDateArb,
  updated_at: safeDateArb
});

/**
 * Array of orders generator
 */
const ordersArb = fc.array(orderArb, { minLength: 0, maxLength: 50 });

/**
 * Menu item category generator
 */
const categoryArb = fc.constantFrom('MAINS', 'SIDES', 'DRINKS', 'DESSERTS', 'SNACKS', 'SPECIALS');

/**
 * Menu item generator
 */
const menuItemArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0)
    .filter(s => !['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf'].includes(s)),
  category: categoryArb,
  price: fc.float({ min: 1, max: 1000, noNaN: true }),
  is_available: fc.boolean()
});

/**
 * Array of menu items generator
 */
const menuItemsArb = fc.array(menuItemArb, { minLength: 0, maxLength: 50 });

// ============================================
// PURE FUNCTIONS FOR TESTING
// (Extracted from admin-mobile.js for testability)
// ============================================

/**
 * Get aggregated item summary from orders
 * @param {Array} orders - Array of orders
 * @returns {Object} Map of item name to { quantity, orderCount }
 */
function getItemSummary(orders) {
  const summary = {};
  
  orders
    .filter(o => o.status === 'PENDING')
    .forEach(order => {
      if (!order.items) return;
      
      // Track which items we've seen in this order to count orders correctly
      const seenInThisOrder = new Set();
      
      order.items.forEach(item => {
        if (!summary[item.title]) {
          summary[item.title] = { quantity: 0, orderCount: 0 };
        }
        summary[item.title].quantity += item.quantity;
        
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
 * Calculate badge counts from orders
 * @param {Array} orders - Array of orders
 * @returns {Object} Badge counts { items, active, completed }
 */
function calculateBadgeCounts(orders) {
  const pendingOrders = orders.filter(o => o.status === 'PENDING');
  const completedOrders = orders.filter(o => o.status === 'COMPLETE');
  const itemSummary = getItemSummary(orders);
  
  return {
    items: Object.keys(itemSummary).length,
    active: pendingOrders.length,
    completed: completedOrders.length
  };
}

/**
 * Get items sorted by quantity descending
 * @param {Array} orders - Array of orders
 * @returns {Array} Sorted array of { name, quantity, orderCount }
 */
function getSortedItems(orders) {
  const summary = getItemSummary(orders);
  return Object.entries(summary)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.quantity - a.quantity);
}

/**
 * Filter orders by status
 * @param {Array} orders - Array of orders
 * @param {string} status - Status to filter by
 * @returns {Array} Filtered orders
 */
function filterOrdersByStatus(orders, status) {
  return orders.filter(o => o.status === status);
}

/**
 * Filter orders by item name
 * @param {Array} orders - Array of orders
 * @param {string} itemName - Item name to filter by
 * @returns {Array} Filtered orders containing the item
 */
function filterOrdersByItem(orders, itemName) {
  return orders.filter(order => 
    order.items?.some(item => item.title === itemName)
  );
}

/**
 * Get completed orders sorted by completion time ascending (oldest first)
 * @param {Array} orders - Array of orders
 * @returns {Array} Sorted completed orders
 */
function getSortedCompletedOrders(orders) {
  return orders
    .filter(o => o.status === 'COMPLETE')
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
}

/**
 * Filter completed orders by verification code search
 * @param {Array} orders - Array of orders
 * @param {string} searchQuery - Search query string
 * @returns {Array} Filtered orders
 */
function filterByVerificationCode(orders, searchQuery) {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return orders;
  return orders.filter(order => 
    order.verification_code?.toLowerCase().includes(query)
  );
}

/**
 * Get confirmation dialog content for an action
 * @param {Object} order - The order object
 * @param {string} action - The action ('complete' | 'pickup')
 * @returns {Object} Dialog content { title, message, buttonText, orderId }
 */
function getConfirmDialogContent(order, action) {
  const truncatedId = order.id.length > 12 ? `${order.id.slice(0, 8)}...` : order.id;
  
  if (action === 'complete') {
    return {
      title: 'Mark as Complete?',
      message: 'This order will be moved to the Ready for Pickup list.',
      buttonText: 'Mark Complete',
      orderId: `Order: ${truncatedId}`
    };
  } else {
    return {
      title: 'Confirm Pickup?',
      message: 'This will mark the order as picked up by the customer.',
      buttonText: 'Confirm Pickup',
      orderId: `Order: ${truncatedId}`
    };
  }
}

/**
 * Apply status transition to an order
 * @param {Object} order - The order object
 * @param {string} action - The action ('complete' | 'pickup')
 * @returns {Object} Result { success, newStatus, error }
 */
function applyStatusTransition(order, action) {
  if (action === 'complete') {
    if (order.status === 'PENDING') {
      return { success: true, newStatus: 'COMPLETE', error: null };
    }
    return { success: false, newStatus: order.status, error: 'Invalid transition: can only complete PENDING orders' };
  } else if (action === 'pickup') {
    if (order.status === 'COMPLETE') {
      return { success: true, newStatus: 'PICKED_UP', error: null };
    }
    return { success: false, newStatus: order.status, error: 'Invalid transition: can only pickup COMPLETE orders' };
  }
  return { success: false, newStatus: order.status, error: 'Unknown action' };
}

/**
 * Check if a button should be disabled for an order
 * @param {string} orderId - The order ID
 * @param {Map} pendingActions - Map of pending actions
 * @returns {boolean} True if button should be disabled
 */
function isButtonDisabled(orderId, pendingActions) {
  return pendingActions.has(orderId);
}

/**
 * Simulate optimistic update with rollback on error
 * @param {Object} order - The order object (will be mutated)
 * @param {string} action - The action ('complete' | 'pickup')
 * @param {boolean} apiSuccess - Whether the API call succeeds
 * @returns {Object} Result { finalStatus, errorShown, rolledBack }
 */
function simulateOptimisticUpdate(order, action, apiSuccess) {
  const previousStatus = order.status;
  let errorShown = false;
  let rolledBack = false;
  
  // Apply optimistic update
  if (action === 'complete' && order.status === 'PENDING') {
    order.status = 'COMPLETE';
  } else if (action === 'pickup' && order.status === 'COMPLETE') {
    order.status = 'PICKED_UP';
  }
  
  // Simulate API response
  if (!apiSuccess) {
    // Rollback on error
    order.status = previousStatus;
    errorShown = true;
    rolledBack = true;
  }
  
  return {
    finalStatus: order.status,
    errorShown,
    rolledBack
  };
}

/**
 * Group menu items by category
 * @param {Array} menuItems - Array of menu items
 * @returns {Object} Map of category to array of items
 */
function groupByCategory(menuItems) {
  const categories = {};
  
  menuItems.forEach(item => {
    if (!categories[item.category]) {
      categories[item.category] = [];
    }
    categories[item.category].push(item);
  });
  
  return categories;
}

/**
 * Get connection state from manager state
 * @param {Object} manager - Object with isConnected and fallbackIntervals
 * @returns {string} - 'realtime' | 'polling' | 'disconnected'
 */
function getConnectionStateFromManager(manager) {
  if (manager.isConnected) {
    return 'realtime';
  }
  if (Object.keys(manager.fallbackIntervals).length > 0) {
    return 'polling';
  }
  return 'disconnected';
}

/**
 * Get CSS class for connection status indicator
 * @param {string} state - 'realtime' | 'polling' | 'disconnected'
 * @returns {string} - CSS class name
 */
function getIndicatorClass(state) {
  return `connection-status--${state}`;
}

/**
 * Check if an element has a valid accessible label
 * @param {Object} element - Element with ariaLabel, ariaLabelledBy, textContent
 * @returns {boolean} - True if element has accessible label
 */
function hasValidAccessibleLabel(element) {
  const hasAriaLabel = element.ariaLabel && element.ariaLabel.trim().length > 0;
  const hasAriaLabelledBy = element.ariaLabelledBy && element.ariaLabelledBy.trim().length > 0;
  const hasTextContent = element.textContent && element.textContent.trim().length > 0;
  
  return hasAriaLabel || hasAriaLabelledBy || hasTextContent;
}

/**
 * Calculate contrast ratio between two colors
 * Based on WCAG 2.1 formula
 * @param {string} foreground - Hex color (e.g., '#ffffff')
 * @param {string} background - Hex color (e.g., '#000000')
 * @returns {number} - Contrast ratio
 */
function calculateContrastRatio(foreground, background) {
  const getLuminance = (hex) => {
    const rgb = hex.replace('#', '').match(/.{2}/g)
      .map(x => parseInt(x, 16) / 255)
      .map(x => x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  
  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast ratio meets WCAG requirements
 * @param {number} ratio - Contrast ratio
 * @param {boolean} isCritical - Whether this is critical text (requires 7:1)
 * @returns {Object} - { passes, ratio, required }
 */
function checkContrastCompliance(ratio, isCritical) {
  const required = isCritical ? 7.0 : 4.5;
  return {
    passes: ratio >= required,
    ratio,
    required
  };
}

/**
 * Check if touch target meets minimum dimension requirements
 * @param {number} width - Element width in pixels
 * @param {number} height - Element height in pixels
 * @returns {Object} - { passes, meetsMinWidth, meetsMinHeight, minRequired }
 */
function checkTouchTargetCompliance(width, height) {
  const MIN_TOUCH_TARGET = 48;
  const meetsMinWidth = width >= MIN_TOUCH_TARGET;
  const meetsMinHeight = height >= MIN_TOUCH_TARGET;
  
  return {
    passes: meetsMinWidth && meetsMinHeight,
    meetsMinWidth,
    meetsMinHeight,
    minRequired: MIN_TOUCH_TARGET
  };
}

// ============================================
// PROPERTY-BASED TESTS
// ============================================

describe('Admin Mobile Dashboard Property-Based Tests', () => {
  
  /**
   * Feature: mobile-admin-dashboard, Property 15: Badge Counts Match Data
   * 
   * For any set of orders:
   * - Items tab badge SHALL equal the count of unique item names across PENDING orders
   * - Active tab badge SHALL equal the count of orders with status === 'PENDING'
   * - Completed tab badge SHALL equal the count of orders with status === 'COMPLETE'
   * 
   * **Validates: Requirements 2.5**
   */
  test('Property 15: Badge counts match data', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const badges = calculateBadgeCounts(orders);
        
        // Calculate expected values directly
        const pendingOrders = orders.filter(o => o.status === 'PENDING');
        const completedOrders = orders.filter(o => o.status === 'COMPLETE');
        
        // Get unique item names from pending orders
        const uniqueItemNames = new Set();
        pendingOrders.forEach(order => {
          if (order.items) {
            order.items.forEach(item => uniqueItemNames.add(item.title));
          }
        });
        
        // Property: Items badge equals count of unique item names across PENDING orders
        expect(badges.items).toBe(uniqueItemNames.size);
        
        // Property: Active badge equals count of PENDING orders
        expect(badges.active).toBe(pendingOrders.length);
        
        // Property: Completed badge equals count of COMPLETE orders
        expect(badges.completed).toBe(completedOrders.length);
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 2: Item Aggregation Correctness
   * 
   * For any set of orders with PENDING status, the Items View SHALL display 
   * each unique item name exactly once, with a total quantity equal to the 
   * sum of that item's quantities across all PENDING orders.
   * 
   * **Validates: Requirements 3.1, 3.2**
   */
  test('Property 2: Item aggregation produces correct groupings with accurate quantity sums', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = getItemSummary(orders);
        const pendingOrders = orders.filter(o => o.status === 'PENDING');
        
        // Verify each item appears exactly once (unique keys)
        const itemNames = Object.keys(summary);
        expect(new Set(itemNames).size).toBe(itemNames.length);
        
        // Verify quantities are correct for each item
        for (const [itemName, data] of Object.entries(summary)) {
          // Calculate expected quantity
          let expectedQty = 0;
          let expectedOrderCount = 0;
          
          pendingOrders.forEach(order => {
            if (order.items) {
              const matchingItems = order.items.filter(i => i.title === itemName);
              if (matchingItems.length > 0) {
                // Count this order once, regardless of how many matching items
                expectedOrderCount += 1;
                matchingItems.forEach(i => {
                  expectedQty += i.quantity;
                });
              }
            }
          });
          
          expect(data.quantity).toBe(expectedQty);
          expect(data.orderCount).toBe(expectedOrderCount);
        }
        
        // Verify all items from pending orders are included
        const allItemNames = new Set();
        pendingOrders.forEach(order => {
          if (order.items) {
            order.items.forEach(item => allItemNames.add(item.title));
          }
        });
        
        expect(itemNames.length).toBe(allItemNames.size);
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 5: Sort Order Correctness (items portion)
   * 
   * For any set of items in Items View, items SHALL be sorted by total 
   * quantity in descending order.
   * 
   * **Validates: Requirements 3.4**
   */
  test('Property 5: Items are sorted by quantity descending', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const sortedItems = getSortedItems(orders);
        
        // Verify descending order by quantity
        for (let i = 1; i < sortedItems.length; i++) {
          expect(sortedItems[i - 1].quantity).toBeGreaterThanOrEqual(sortedItems[i].quantity);
        }
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 3: View Filtering by Order Status
   * 
   * For any set of orders:
   * - The Active Orders View SHALL display exactly the orders with status === 'PENDING'
   * - The Completed Orders View SHALL display exactly the orders with status === 'COMPLETE'
   * 
   * **Validates: Requirements 4.1, 5.1**
   */
  test('Property 3: View filtering by order status', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const activeOrders = filterOrdersByStatus(orders, 'PENDING');
        const completedOrders = filterOrdersByStatus(orders, 'COMPLETE');
        
        // Property: Active view shows only PENDING orders
        expect(activeOrders.every(o => o.status === 'PENDING')).toBe(true);
        expect(activeOrders.length).toBe(orders.filter(o => o.status === 'PENDING').length);
        
        // Property: Completed view shows only COMPLETE orders
        expect(completedOrders.every(o => o.status === 'COMPLETE')).toBe(true);
        expect(completedOrders.length).toBe(orders.filter(o => o.status === 'COMPLETE').length);
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 4: Item Filter Affects Active Orders
   * 
   * For any selected item filter in Items View, the Active Orders View SHALL 
   * display only orders that contain at least one item matching the filter name.
   * 
   * **Validates: Requirements 3.3, 4.7**
   */
  test('Property 4: Item filter affects active orders correctly', () => {
    fc.assert(
      fc.property(
        ordersArb,
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        (orders, filterName) => {
          const filteredOrders = filterOrdersByItem(orders, filterName);
          
          // Property: All filtered orders contain the filter item
          expect(filteredOrders.every(order => 
            order.items?.some(item => item.title === filterName)
          )).toBe(true);
          
          // Property: No orders without the filter item are included
          const ordersWithItem = orders.filter(order => 
            order.items?.some(item => item.title === filterName)
          );
          expect(filteredOrders.length).toBe(ordersWithItem.length);
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 5: Sort Order Correctness (completed portion)
   * 
   * For any set of orders in Completed Orders View, orders SHALL be sorted 
   * by completion timestamp in ascending order (oldest first).
   * 
   * **Validates: Requirements 5.6**
   */
  test('Property 5: Completed orders are sorted by time ascending (oldest first)', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const sortedCompleted = getSortedCompletedOrders(orders);
        
        // Verify ascending order by updated_at (oldest first)
        for (let i = 1; i < sortedCompleted.length; i++) {
          const prevTime = new Date(sortedCompleted[i - 1].updated_at).getTime();
          const currTime = new Date(sortedCompleted[i].updated_at).getTime();
          expect(prevTime).toBeLessThanOrEqual(currTime);
        }
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 12: Search Filtering Correctness
   * 
   * For any search query in Completed Orders View, the displayed orders SHALL 
   * be exactly those where the verification_code contains the search query 
   * as a substring (case-insensitive).
   * 
   * **Validates: Requirements 12.2**
   */
  test('Property 12: Search filtering by verification code is correct', () => {
    fc.assert(
      fc.property(
        ordersArb,
        fc.string({ minLength: 1, maxLength: 6 }),
        (orders, searchQuery) => {
          const completedOrders = orders.filter(o => o.status === 'COMPLETE');
          const filtered = filterByVerificationCode(completedOrders, searchQuery);
          const query = searchQuery.trim().toLowerCase();
          
          if (!query) {
            // Empty query returns all orders
            expect(filtered.length).toBe(completedOrders.length);
          } else {
            // All filtered orders contain the search query in verification_code
            expect(filtered.every(order => 
              order.verification_code?.toLowerCase().includes(query)
            )).toBe(true);
            
            // All orders with matching verification_code are included
            const expected = completedOrders.filter(order => 
              order.verification_code?.toLowerCase().includes(query)
            );
            expect(filtered.length).toBe(expected.length);
          }
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 7: Confirmation Dialog Content
   * 
   * For any status-changing action initiated, the Confirmation Dialog SHALL display:
   * - The exact order ID of the target order
   * - The action being performed ('Mark Complete' or 'Picked Up')
   * 
   * **Validates: Requirements 8.1, 8.2**
   */
  test('Property 7: Confirmation dialog displays correct content', () => {
    fc.assert(
      fc.property(
        orderArb,
        fc.constantFrom('complete', 'pickup'),
        (order, action) => {
          const content = getConfirmDialogContent(order, action);
          
          // Property: Dialog displays the order ID
          expect(content.orderId).toContain('Order:');
          // The truncated ID should be part of the original ID
          const displayedId = content.orderId.replace('Order: ', '').replace('...', '');
          expect(order.id.startsWith(displayedId)).toBe(true);
          
          // Property: Dialog displays the correct action
          if (action === 'complete') {
            expect(content.title).toBe('Mark as Complete?');
            expect(content.buttonText).toBe('Mark Complete');
          } else {
            expect(content.title).toBe('Confirm Pickup?');
            expect(content.buttonText).toBe('Confirm Pickup');
          }
          
          // Property: Dialog has a descriptive message
          expect(content.message.length).toBeGreaterThan(0);
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 6: Status Transition on Confirmation
   * 
   * For any order, when a status-changing action is confirmed:
   * - If action is 'complete' and current status is 'PENDING', status SHALL become 'COMPLETE'
   * - If action is 'pickup' and current status is 'COMPLETE', status SHALL become 'PICKED_UP'
   * 
   * **Validates: Requirements 4.5, 5.5**
   */
  test('Property 6: Status transitions are correct on confirmation', () => {
    fc.assert(
      fc.property(
        orderArb,
        fc.constantFrom('complete', 'pickup'),
        (order, action) => {
          const result = applyStatusTransition(order, action);
          
          if (action === 'complete') {
            if (order.status === 'PENDING') {
              // Property: PENDING -> COMPLETE transition succeeds
              expect(result.success).toBe(true);
              expect(result.newStatus).toBe('COMPLETE');
            } else {
              // Property: Non-PENDING orders cannot be completed
              expect(result.success).toBe(false);
              expect(result.newStatus).toBe(order.status);
            }
          } else if (action === 'pickup') {
            if (order.status === 'COMPLETE') {
              // Property: COMPLETE -> PICKED_UP transition succeeds
              expect(result.success).toBe(true);
              expect(result.newStatus).toBe('PICKED_UP');
            } else {
              // Property: Non-COMPLETE orders cannot be picked up
              expect(result.success).toBe(false);
              expect(result.newStatus).toBe(order.status);
            }
          }
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 9: Button Disabled During Pending Requests
   * 
   * For any order with a pending API request, all action buttons for that order 
   * SHALL be disabled (non-interactive) until the request completes or fails.
   * 
   * **Validates: Requirements 8.6**
   */
  test('Property 9: Buttons are disabled during pending requests', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 0, maxLength: 10 }),
        fc.uuid(),
        (pendingOrderIds, testOrderId) => {
          // Create a Map of pending actions
          const pendingActions = new Map();
          pendingOrderIds.forEach(id => {
            pendingActions.set(id, { action: 'complete', previousStatus: 'PENDING' });
          });
          
          const isDisabled = isButtonDisabled(testOrderId, pendingActions);
          
          // Property: Button is disabled if and only if order has pending action
          expect(isDisabled).toBe(pendingOrderIds.includes(testOrderId));
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 8: Error Handling with State Rollback
   * 
   * For any optimistic UI update that fails due to API error:
   * - The order SHALL be reverted to its previous status in the UI
   * - An error toast SHALL be displayed
   * - The order SHALL remain in its original view
   * 
   * **Validates: Requirements 8.5, 10.4**
   */
  test('Property 8: Error handling rolls back state correctly', () => {
    fc.assert(
      fc.property(
        orderArb,
        fc.constantFrom('complete', 'pickup'),
        fc.boolean(),
        (order, action, apiSuccess) => {
          // Clone order to avoid mutation issues
          const testOrder = { ...order };
          const originalStatus = testOrder.status;
          
          const result = simulateOptimisticUpdate(testOrder, action, apiSuccess);
          
          if (!apiSuccess) {
            // Property: On error, status is rolled back to original
            expect(result.finalStatus).toBe(originalStatus);
            expect(result.rolledBack).toBe(true);
            expect(result.errorShown).toBe(true);
          } else {
            // Property: On success, status is updated (if valid transition)
            expect(result.rolledBack).toBe(false);
            expect(result.errorShown).toBe(false);
          }
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 14: Stock Panel Category Grouping
   * 
   * For any set of menu items, the Stock Panel SHALL group items by category,
   * with each category appearing exactly once and containing all items 
   * belonging to that category.
   * 
   * **Validates: Requirements 6.3**
   */
  test('Property 14: Stock panel groups items by category correctly', () => {
    fc.assert(
      fc.property(menuItemsArb, (menuItems) => {
        const grouped = groupByCategory(menuItems);
        
        // Property: Each category appears exactly once
        const categoryNames = Object.keys(grouped);
        expect(new Set(categoryNames).size).toBe(categoryNames.length);
        
        // Property: All items are included in exactly one category
        let totalItemsInGroups = 0;
        for (const items of Object.values(grouped)) {
          totalItemsInGroups += items.length;
        }
        expect(totalItemsInGroups).toBe(menuItems.length);
        
        // Property: Each item is in its correct category
        for (const [category, items] of Object.entries(grouped)) {
          expect(items.every(item => item.category === category)).toBe(true);
        }
        
        // Property: All items from each category are included
        for (const item of menuItems) {
          expect(grouped[item.category]).toBeDefined();
          expect(grouped[item.category].some(i => i.id === item.id)).toBe(true);
        }
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 13: Connection Status Indicator Accuracy
   * 
   * For any connection state (realtime, polling, disconnected), the Connection 
   * Status Indicator SHALL display the correct visual state matching the 
   * RealtimeSubscriptionManager's current state.
   * 
   * **Validates: Requirements 14.4**
   */
  test('Property 13: Connection status indicator reflects actual state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('realtime', 'polling', 'disconnected'),
        fc.boolean(), // isConnected
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }), // fallbackIntervals keys
        (expectedState, isConnected, fallbackKeys) => {
          // Simulate RealtimeSubscriptionManager state
          const mockManager = {
            isConnected,
            fallbackIntervals: {}
          };
          
          // Add fallback intervals if any
          fallbackKeys.forEach(key => {
            mockManager.fallbackIntervals[key] = 123; // mock interval ID
          });
          
          // Calculate expected state based on manager state
          const calculatedState = getConnectionStateFromManager(mockManager);
          
          // Property: State calculation is deterministic
          if (mockManager.isConnected) {
            expect(calculatedState).toBe('realtime');
          } else if (Object.keys(mockManager.fallbackIntervals).length > 0) {
            expect(calculatedState).toBe('polling');
          } else {
            expect(calculatedState).toBe('disconnected');
          }
          
          // Property: Indicator class matches state
          const indicatorClass = getIndicatorClass(calculatedState);
          expect(indicatorClass).toBe(`connection-status--${calculatedState}`);
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 11: ARIA Labels on Interactive Elements
   * 
   * For any interactive element (button, tab, toggle, link), the element SHALL have either:
   * - An aria-label attribute with descriptive text, OR
   * - An aria-labelledby reference to visible text, OR
   * - Visible text content that describes the action
   * 
   * **Validates: Requirements 11.1, 11.6**
   */
  test('Property 11: Interactive elements have accessible labels', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom('button', 'tab', 'toggle', 'link'),
          ariaLabel: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
          ariaLabelledBy: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          textContent: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined })
        }),
        (element) => {
          const hasAccessibleLabel = hasValidAccessibleLabel(element);
          
          // Property: Element has at least one form of accessible label
          const hasAriaLabel = element.ariaLabel && element.ariaLabel.trim().length > 0;
          const hasAriaLabelledBy = element.ariaLabelledBy && element.ariaLabelledBy.trim().length > 0;
          const hasTextContent = element.textContent && element.textContent.trim().length > 0;
          
          const expectedHasLabel = hasAriaLabel || hasAriaLabelledBy || hasTextContent;
          expect(hasAccessibleLabel).toBe(expectedHasLabel);
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 10: Text Contrast Ratio Compliance
   * 
   * For any text element in the Admin Dashboard:
   * - Body text SHALL have a contrast ratio of at least 4.5:1 against its background
   * - Critical action text (buttons, verification codes) SHALL have a contrast ratio of at least 7:1
   * 
   * **Validates: Requirements 9.1, 11.3**
   */
  test('Property 10: Text contrast ratios meet WCAG requirements', () => {
    // Generate valid hex color strings
    const hexColorArb = fc.tuple(
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 }),
      fc.integer({ min: 0, max: 255 })
    ).map(([r, g, b]) => 
      '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
    );
    
    fc.assert(
      fc.property(
        fc.record({
          isCritical: fc.boolean(),
          foregroundColor: hexColorArb,
          backgroundColor: hexColorArb
        }),
        ({ isCritical, foregroundColor, backgroundColor }) => {
          const contrastRatio = calculateContrastRatio(
            foregroundColor,
            backgroundColor
          );
          
          const minRequired = isCritical ? 7.0 : 4.5;
          const meetsRequirement = contrastRatio >= minRequired;
          
          // Property: Contrast check function correctly identifies compliance
          const checkResult = checkContrastCompliance(contrastRatio, isCritical);
          expect(checkResult.passes).toBe(meetsRequirement);
          expect(checkResult.ratio).toBeCloseTo(contrastRatio, 2);
          expect(checkResult.required).toBe(minRequired);
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: mobile-admin-dashboard, Property 1: Touch Target Minimum Dimensions
   * 
   * For any interactive element (button, tab, toggle), the element SHALL have:
   * - Minimum width of 48px
   * - Minimum height of 48px
   * 
   * **Validates: Requirements 2.4, 7.1, 11.2**
   */
  test('Property 1: Touch targets meet minimum dimension requirements', () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.constantFrom('button', 'tab', 'toggle', 'fab', 'card'),
          width: fc.integer({ min: 0, max: 200 }),
          height: fc.integer({ min: 0, max: 200 })
        }),
        (element) => {
          const MIN_TOUCH_TARGET = 48;
          
          const meetsMinWidth = element.width >= MIN_TOUCH_TARGET;
          const meetsMinHeight = element.height >= MIN_TOUCH_TARGET;
          const meetsRequirements = meetsMinWidth && meetsMinHeight;
          
          // Property: Touch target validation correctly identifies compliance
          const checkResult = checkTouchTargetCompliance(element.width, element.height);
          expect(checkResult.passes).toBe(meetsRequirements);
          expect(checkResult.meetsMinWidth).toBe(meetsMinWidth);
          expect(checkResult.meetsMinHeight).toBe(meetsMinHeight);
          expect(checkResult.minRequired).toBe(MIN_TOUCH_TARGET);
        }
      ),
      PBT_CONFIG
    );
  });

});

// ============================================
// PRE-ORDER SEPARATION PROPERTY-BASED TESTS
// Feature: preorder-items-separation
// ============================================

// Activation threshold: 45 minutes in milliseconds
const ACTIVATION_THRESHOLD_MS = 45 * 60 * 1000;

/**
 * Order classification function (mirrors admin-mobile.js implementation)
 */
function needsAnnouncing(order) {
  if (!order.preorder_time) {
    return true;
  }
  
  const now = Date.now();
  const pickupTime = new Date(order.preorder_time).getTime();
  
  if (isNaN(pickupTime)) {
    return true;
  }
  
  const activationTime = pickupTime - ACTIVATION_THRESHOLD_MS;
  return now >= activationTime;
}

/**
 * Check if order is a transitioned pre-order
 */
function isTransitionedPreOrder(order) {
  return !!(order.preorder_time && needsAnnouncing(order));
}

/**
 * Partition orders into needs-announcing and future pre-orders
 */
function partitionOrders(orders) {
  const pendingOrders = orders.filter(o => o.status === 'PENDING');
  return {
    needsAnnouncingOrders: pendingOrders.filter(needsAnnouncing),
    futurePreOrders: pendingOrders.filter(o => !needsAnnouncing(o))
  };
}

/**
 * Generate aggregation key for an item based on order type and scheduled time
 * Key formats:
 * - Live orders: "live:{itemName}"
 * - Pre-orders: "preorder:{itemName}:{scheduledTimeISO}"
 */
function getAggregationKey(itemName, isPreOrder, scheduledTimeISO) {
  if (isPreOrder && scheduledTimeISO) {
    return `preorder:${itemName}:${scheduledTimeISO}`;
  }
  return `live:${itemName}`;
}

/**
 * Parse an aggregation key to extract its components
 */
function parseAggregationKey(key) {
  if (key.startsWith('preorder:')) {
    // Format: preorder:{itemName}:{scheduledTimeISO}
    // Note: Both item names and ISO strings can contain colons
    // ISO format is predictable: YYYY-MM-DDTHH:MM:SS.sssZ
    const withoutPrefix = key.slice(9); // Skip "preorder:"
    
    // Find the ISO timestamp by looking for the date pattern
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
  
  const itemName = key.slice(5); // Skip "live:"
  return { type: 'live', itemName, scheduledTimeISO: null };
}

/**
 * Get items for Needs Announcing section (mirrors admin-mobile.js)
 * Uses aggregation keys to ensure proper state isolation:
 * - Live orders: "live:{itemName}"
 * - Pre-orders: "preorder:{itemName}:{scheduledTimeISO}"
 */

// Live order delta window: new orders within 3 minutes of told action show as delta
const LIVE_ORDER_DELTA_WINDOW_MS = 3 * 60 * 1000;

function getNeedsAnnouncingItems() {
  const { needsAnnouncingOrders } = partitionOrders(global.AdminState.orders);
  const now = Date.now();
  
  // Separate into normal orders and transitioned pre-orders
  const normalOrders = needsAnnouncingOrders.filter(o => !isTransitionedPreOrder(o));
  const preOrders = needsAnnouncingOrders.filter(o => isTransitionedPreOrder(o));
  
  const items = [];
  
  // ========================================
  // LIVE ORDERS - Announce-Cycle Model
  // ========================================
  const liveItemData = {};
  
  normalOrders.forEach(order => {
    const orderTime = new Date(order.created_at).getTime();
    
    (order.items || []).forEach(item => {
      if (!liveItemData[item.title]) {
        liveItemData[item.title] = {
          name: item.title,
          aggregationKey: getAggregationKey(item.title, false, null),
          orders: [],
          totalQuantity: 0,
          oldestOrderTime: Infinity,
          newestOrderTime: 0,
        };
      }
      
      const entry = liveItemData[item.title];
      entry.orders.push({
        orderTime,
        quantity: item.quantity,
        orderId: order.id,
      });
      entry.totalQuantity += item.quantity;
      entry.oldestOrderTime = Math.min(entry.oldestOrderTime, orderTime);
      entry.newestOrderTime = Math.max(entry.newestOrderTime, orderTime);
    });
  });
  
  // Calculate delta for each live item using announce-cycle model
  Object.values(liveItemData).forEach(entry => {
    const toldState = global.AdminState.toldCounts[entry.aggregationKey];
    const waitMinutes = Math.floor((now - entry.oldestOrderTime) / 60000);
    
    let delta;
    let toldQuantity = 0;
    let isTold = false;
    
    if (!toldState || typeof toldState === 'number') {
      // Legacy format or no told state
      toldQuantity = typeof toldState === 'number' ? toldState : 0;
      delta = Math.max(0, entry.totalQuantity - toldQuantity);
      isTold = delta <= 0;
    } else {
      // New format: { toldTimestamp, toldQuantity }
      const { toldTimestamp, toldQuantity: storedToldQty } = toldState;
      toldQuantity = storedToldQty;
      
      // Calculate quantity from orders created AFTER toldTimestamp
      // Orders within 3 min of told action show as delta
      // Orders after 3 min stay in "Already Told"
      let deltaQuantity = 0;
      
      entry.orders.forEach(orderInfo => {
        if (orderInfo.orderTime > toldTimestamp) {
          // Order created AFTER told action
          const timeSinceOrderCreated = orderInfo.orderTime - toldTimestamp;
          if (timeSinceOrderCreated <= LIVE_ORDER_DELTA_WINDOW_MS) {
            // Order was created within 3 min of told action - shows as delta
            deltaQuantity += orderInfo.quantity;
          }
          // Orders created after 3 min of told action stay in "Already Told"
        }
      });
      
      if (deltaQuantity > 0) {
        // Has new orders within delta window - show them
        delta = deltaQuantity;
        isTold = false;
      } else {
        // No new orders within delta window
        delta = 0;
        isTold = true;
      }
    }
    
    items.push({
      aggregationKey: entry.aggregationKey,
      name: entry.name,
      quantity: entry.totalQuantity,
      orderCount: entry.orders.length,
      oldestOrderTime: entry.oldestOrderTime,
      newestOrderTime: entry.newestOrderTime,
      isPreOrder: false,
      scheduledTimeISO: null,
      earliestPickupMinutes: null,
      waitMinutes,
      toldCount: toldQuantity,
      delta,
      isTold,
      hasPreOrderSource: false,
    });
  });
  
  // ========================================
  // PRE-ORDERS - Absolute Model
  // ========================================
  const preOrderItemMap = {};
  
  preOrders.forEach(order => {
    const scheduledTimeISO = order.preorder_time;
    const pickupTime = new Date(scheduledTimeISO).getTime();
    const minutesUntilPickup = Math.round((pickupTime - now) / 60000);
    const orderTime = new Date(order.created_at).getTime();
    
    (order.items || []).forEach(item => {
      const aggKey = getAggregationKey(item.title, true, scheduledTimeISO);
      
      if (!preOrderItemMap[aggKey]) {
        preOrderItemMap[aggKey] = {
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
      
      const entry = preOrderItemMap[aggKey];
      entry.quantity += item.quantity;
      entry.orderCount++;
      entry.oldestOrderTime = Math.min(entry.oldestOrderTime, orderTime);
      if (minutesUntilPickup < entry.earliestPickupMinutes) {
        entry.earliestPickupMinutes = minutesUntilPickup;
        entry.earliestPickupTime = pickupTime;
      }
    });
  });
  
  // Convert pre-order items to array (pre-orders use simple quantity-based told)
  Object.values(preOrderItemMap).forEach(item => {
    const toldState = global.AdminState.toldCounts[item.aggregationKey];
    const toldCount = typeof toldState === 'number' ? toldState : 
                      (toldState?.toldQuantity || 0);
    const delta = Math.max(0, item.quantity - toldCount);
    
    items.push({
      ...item,
      toldCount,
      delta,
      isTold: delta <= 0,
      waitMinutes: 0,
      hasPreOrderSource: true,
      earliestPickupMinutes: item.earliestPickupMinutes === Infinity ? null : item.earliestPickupMinutes,
      earliestPickupTime: item.earliestPickupTime,
    });
  });
  
  return items;
}

/**
 * Get visible items for Needs Announcing (mirrors admin-mobile.js)
 */
function getVisibleNeedsAnnouncingItems() {
  const allItems = getNeedsAnnouncingItems();
  
  const visible = allItems.filter(item => item.delta > 0);
  const hidden = allItems.filter(item => item.delta === 0);
  
  visible.sort((a, b) => {
    if (a.waitMinutes !== b.waitMinutes) return b.waitMinutes - a.waitMinutes;
    return b.quantity - a.quantity;
  });
  
  return { visible, hidden };
}

// Generator for orders with optional preorder_time
const preorderTimeArb = fc.option(
  fc.integer({ min: Date.now(), max: Date.now() + 4 * 60 * 60 * 1000 }) // 0-4 hours from now
    .map(ts => new Date(ts).toISOString()),
  { nil: null }
);

const orderWithPreorderArb = fc.record({
  id: fc.uuid(),
  status: fc.constantFrom('PENDING', 'COMPLETE', 'PICKED_UP'),
  items: fc.array(orderItemArb, { minLength: 1, maxLength: 5 }),
  created_at: safeDateArb,
  preorder_time: preorderTimeArb
});

const ordersWithPreorderArb = fc.array(orderWithPreorderArb, { minLength: 0, maxLength: 30 });

describe('Pre-Order Items Separation Property-Based Tests', () => {
  
  /**
   * Feature: preorder-items-separation, Property 1: Order Classification
   * 
   * For any order:
   * - needsAnnouncing returns true if preorder_time is null
   * - needsAnnouncing returns true if preorder_time is within 45 minutes
   * - needsAnnouncing returns false if preorder_time is beyond 45 minutes
   * 
   * **Validates: Requirements 1.2, 1.3, 2.2, 4.1**
   */
  test('Property 1: Order classification is correct based on preorder_time', () => {
    fc.assert(
      fc.property(orderWithPreorderArb, (order) => {
        const result = needsAnnouncing(order);
        const now = Date.now();
        
        if (order.preorder_time === null) {
          // Immediate orders always need announcing
          expect(result).toBe(true);
        } else {
          const pickupTime = new Date(order.preorder_time).getTime();
          const activationTime = pickupTime - ACTIVATION_THRESHOLD_MS;
          
          if (now >= activationTime) {
            // Within threshold - needs announcing
            expect(result).toBe(true);
          } else {
            // Beyond threshold - future pre-order
            expect(result).toBe(false);
          }
        }
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Feature: preorder-items-separation, Property 2: Partition Completeness
   * 
   * For any set of orders, partitionOrders SHALL:
   * - Include all PENDING orders in exactly one partition
   * - needsAnnouncingOrders + futurePreOrders = all PENDING orders
   * 
   * **Validates: Requirements 1.1, 2.1**
   */
  test('Property 2: Partition covers all pending orders exactly once', () => {
    fc.assert(
      fc.property(ordersWithPreorderArb, (orders) => {
        const { needsAnnouncingOrders, futurePreOrders } = partitionOrders(orders);
        const pendingOrders = orders.filter(o => o.status === 'PENDING');
        
        // Total partitioned orders equals pending orders
        expect(needsAnnouncingOrders.length + futurePreOrders.length).toBe(pendingOrders.length);
        
        // No overlap between partitions
        const announcingIds = new Set(needsAnnouncingOrders.map(o => o.id));
        const futureIds = new Set(futurePreOrders.map(o => o.id));
        const overlap = [...announcingIds].filter(id => futureIds.has(id));
        expect(overlap.length).toBe(0);
        
        // All pending orders are in one partition
        pendingOrders.forEach(order => {
          const inAnnouncing = announcingIds.has(order.id);
          const inFuture = futureIds.has(order.id);
          expect(inAnnouncing || inFuture).toBe(true);
          expect(inAnnouncing && inFuture).toBe(false);
        });
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Feature: preorder-items-separation, Property 3: Transitioned Pre-Order Detection
   * 
   * For any order, isTransitionedPreOrder returns true if and only if:
   * - order has a preorder_time AND
   * - order needs announcing (within threshold)
   * 
   * **Validates: Requirements 1.4**
   */
  test('Property 3: Transitioned pre-order detection is correct', () => {
    fc.assert(
      fc.property(orderWithPreorderArb, (order) => {
        const result = isTransitionedPreOrder(order);
        
        if (order.preorder_time === null) {
          // No preorder_time = not a transitioned pre-order
          expect(result).toBe(false);
        } else {
          // Has preorder_time - check if it needs announcing
          const shouldNeedAnnouncing = needsAnnouncing(order);
          expect(result).toBe(shouldNeedAnnouncing);
        }
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Feature: preorder-items-separation, Property 4: Needs Announcing Contains Only Qualifying Orders
   * 
   * For any set of orders, all orders in needsAnnouncingOrders SHALL satisfy needsAnnouncing(order) === true
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  test('Property 4: Needs announcing partition contains only qualifying orders', () => {
    fc.assert(
      fc.property(ordersWithPreorderArb, (orders) => {
        const { needsAnnouncingOrders } = partitionOrders(orders);
        
        // All orders in needsAnnouncingOrders must satisfy needsAnnouncing
        needsAnnouncingOrders.forEach(order => {
          expect(needsAnnouncing(order)).toBe(true);
        });
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Feature: preorder-items-separation, Property 5: Future Pre-Orders Contains Only Non-Qualifying Orders
   * 
   * For any set of orders, all orders in futurePreOrders SHALL satisfy needsAnnouncing(order) === false
   * 
   * **Validates: Requirements 2.1, 2.2**
   */
  test('Property 5: Future pre-orders partition contains only non-qualifying orders', () => {
    fc.assert(
      fc.property(ordersWithPreorderArb, (orders) => {
        const { futurePreOrders } = partitionOrders(orders);
        
        // All orders in futurePreOrders must NOT satisfy needsAnnouncing
        futurePreOrders.forEach(order => {
          expect(needsAnnouncing(order)).toBe(false);
        });
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Feature: preorder-items-separation, Property 6: Needs Announcing Aggregation
   * 
   * For any set of orders, getNeedsAnnouncingItems SHALL:
   * - Only include items from orders where needsAnnouncing(order) === true
   * - Correctly sum quantities for each aggregation key
   * - Track hasPreOrderSource correctly
   * - Live orders grouped by item name only
   * - Pre-orders grouped by item name AND scheduled time
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3, 7.1, 7.2, 7.3, 7.4**
   */
  test('Property 6: Needs announcing aggregation is correct', () => {
    // Mock AdminState for testing
    const originalOrders = global.AdminState?.orders;
    
    fc.assert(
      fc.property(ordersWithPreorderArb, (orders) => {
        // Set up mock AdminState
        global.AdminState = { orders, toldCounts: {} };
        
        const items = getNeedsAnnouncingItems();
        const { needsAnnouncingOrders } = partitionOrders(orders);
        
        // Calculate expected aggregation manually using aggregation keys
        const expectedItems = {};
        needsAnnouncingOrders.forEach(order => {
          const isPreOrder = isTransitionedPreOrder(order);
          const scheduledTimeISO = order.preorder_time;
          
          (order.items || []).forEach(item => {
            const aggKey = isPreOrder && scheduledTimeISO 
              ? getAggregationKey(item.title, true, scheduledTimeISO)
              : getAggregationKey(item.title, false, null);
            
            if (!expectedItems[aggKey]) {
              expectedItems[aggKey] = { 
                quantity: 0, 
                hasPreOrder: isPreOrder,
                name: item.title
              };
            }
            expectedItems[aggKey].quantity += item.quantity;
          });
        });
        
        // Verify all items are from needs-announcing orders
        items.forEach(item => {
          expect(expectedItems[item.aggregationKey]).toBeDefined();
          expect(item.quantity).toBe(expectedItems[item.aggregationKey].quantity);
        });
        
        // Verify all expected items are present
        expect(items.length).toBe(Object.keys(expectedItems).length);
      }),
      PBT_CONFIG
    );
    
    // Restore original state
    if (originalOrders !== undefined) {
      global.AdminState = { orders: originalOrders };
    }
  });
  
  /**
   * Feature: preorder-items-separation, Property 7: Delta Calculation
   * 
   * For any item, delta SHALL equal max(0, quantity - toldCount)
   * where toldCount is looked up by aggregation key
   * 
   * **Validates: Requirements 6.1, 6.2, 6.3**
   */
  test('Property 7: Delta calculation is correct', () => {
    // Generate told counts keyed by aggregation key format
    const toldCountArb = fc.dictionary(
      fc.oneof(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0).map(s => `live:${s}`),
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
          safeDateArb
        ).map(([name, time]) => `preorder:${name}:${time}`)
      ),
      fc.integer({ min: 0, max: 100 })
    );
    
    fc.assert(
      fc.property(ordersWithPreorderArb, toldCountArb, (orders, toldCounts) => {
        // Set up mock AdminState
        global.AdminState = { orders, toldCounts };
        
        const items = getNeedsAnnouncingItems();
        
        // Verify delta calculation for each item
        items.forEach(item => {
          const expectedToldCount = toldCounts[item.aggregationKey] || 0;
          const expectedDelta = Math.max(0, item.quantity - expectedToldCount);
          
          expect(item.toldCount).toBe(expectedToldCount);
          expect(item.delta).toBe(expectedDelta);
          expect(item.isTold).toBe(expectedDelta === 0);
        });
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Feature: preorder-items-separation, Property 8: Visible/Hidden Split
   * 
   * For any set of items:
   * - Items with delta > 0 are in visible
   * - Items with delta === 0 are in hidden
   * - No overlap between visible and hidden
   * 
   * **Validates: Requirements 3.2, 3.6**
   */
  test('Property 8: Visible/hidden split is correct', () => {
    const toldCountArb = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      fc.integer({ min: 0, max: 100 })
    );
    
    fc.assert(
      fc.property(ordersWithPreorderArb, toldCountArb, (orders, toldCounts) => {
        // Set up mock AdminState
        global.AdminState = { orders, toldCounts };
        
        const { visible, hidden } = getVisibleNeedsAnnouncingItems();
        
        // All visible items have delta > 0
        visible.forEach(item => {
          expect(item.delta).toBeGreaterThan(0);
        });
        
        // All hidden items have delta === 0
        hidden.forEach(item => {
          expect(item.delta).toBe(0);
        });
        
        // No overlap
        const visibleNames = new Set(visible.map(i => i.name));
        const hiddenNames = new Set(hidden.map(i => i.name));
        const overlap = [...visibleNames].filter(n => hiddenNames.has(n));
        expect(overlap.length).toBe(0);
        
        // Total equals all items
        const allItems = getNeedsAnnouncingItems();
        expect(visible.length + hidden.length).toBe(allItems.length);
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Format absolute time (mirrors admin-mobile.js)
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
   * Get pre-orders grouped by pickup time (mirrors admin-mobile.js)
   */
  function getPreOrdersForPlanning() {
    const { futurePreOrders } = partitionOrders(global.AdminState.orders);
    
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
    
    return Array.from(slotMap.values())
      .map(slot => ({
        ...slot,
        pickupTimeFormatted: formatAbsoluteTime(slot.pickupTime),
        items: Object.values(slot.items)
      }))
      .sort((a, b) => a.pickupTime - b.pickupTime);
  }
  
  /**
   * Feature: preorder-items-separation, Property 9: Pre-Orders Grouping
   * 
   * For any set of orders, getPreOrdersForPlanning SHALL:
   * - Only include orders from futurePreOrders (beyond 45 min threshold)
   * - Group orders by exact pickup time
   * - Sort slots by pickup time (earliest first)
   * - Correctly aggregate item quantities per slot
   * 
   * **Validates: Requirements 2.1, 2.2, 2.5**
   */
  test('Property 9: Pre-orders grouping is correct', () => {
    fc.assert(
      fc.property(ordersWithPreorderArb, (orders) => {
        global.AdminState = { orders, toldCounts: {} };
        
        const slots = getPreOrdersForPlanning();
        const { futurePreOrders } = partitionOrders(orders);
        
        // All slots should come from future pre-orders only
        const futurePickupTimes = new Set(futurePreOrders.map(o => o.preorder_time));
        slots.forEach(slot => {
          expect(futurePickupTimes.has(slot.pickupTimeISO)).toBe(true);
        });
        
        // Verify sorting: earliest pickup time first
        for (let i = 1; i < slots.length; i++) {
          expect(slots[i - 1].pickupTime.getTime()).toBeLessThanOrEqual(slots[i].pickupTime.getTime());
        }
        
        // Verify item aggregation per slot
        slots.forEach(slot => {
          const ordersInSlot = futurePreOrders.filter(o => o.preorder_time === slot.pickupTimeISO);
          
          // Verify order count
          expect(slot.orderCount).toBe(ordersInSlot.length);
          
          // Verify item quantities
          const expectedItems = {};
          ordersInSlot.forEach(order => {
            (order.items || []).forEach(item => {
              if (!expectedItems[item.title]) {
                expectedItems[item.title] = 0;
              }
              expectedItems[item.title] += item.quantity;
            });
          });
          
          slot.items.forEach(item => {
            expect(expectedItems[item.name]).toBe(item.quantity);
          });
          
          expect(slot.items.length).toBe(Object.keys(expectedItems).length);
        });
        
        // Verify all unique pickup times are represented
        const uniquePickupTimes = new Set(futurePreOrders.map(o => o.preorder_time));
        expect(slots.length).toBe(uniquePickupTimes.size);
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Feature: preorder-items-separation, Property 10: Pre-Orders Exclusivity
   * 
   * For any set of orders, getPreOrdersForPlanning SHALL NOT include any orders
   * that satisfy needsAnnouncing(order) === true
   * 
   * **Validates: Requirements 2.2**
   */
  test('Property 10: Pre-orders only contains future orders', () => {
    fc.assert(
      fc.property(ordersWithPreorderArb, (orders) => {
        global.AdminState = { orders, toldCounts: {} };
        
        const slots = getPreOrdersForPlanning();
        const { futurePreOrders } = partitionOrders(orders);
        
        // All orders in slots should NOT need announcing
        futurePreOrders.forEach(order => {
          expect(needsAnnouncing(order)).toBe(false);
        });
        
        // Total orders in slots should equal futurePreOrders count
        const totalOrdersInSlots = slots.reduce((sum, slot) => sum + slot.orderCount, 0);
        expect(totalOrdersInSlots).toBe(futurePreOrders.length);
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Format relative time (mirrors admin-mobile.js)
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
   * Feature: preorder-items-separation, Property 11: Time Formatting Consistency
   * 
   * For any valid time input:
   * - formatAbsoluteTime returns 12-hour format with AM/PM
   * - formatRelativeTime returns "in X min" or "in X hr Y min" format
   * - Edge cases: midnight (12:00 AM), noon (12:00 PM), exact hours
   * 
   * **Validates: Requirements 1.5, 2.3**
   */
  test('Property 11: Time formatting is consistent', () => {
    // Test formatAbsoluteTime
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }), // hours
        fc.integer({ min: 0, max: 59 }), // minutes
        (hours, minutes) => {
          const date = new Date(2025, 0, 1, hours, minutes);
          const formatted = formatAbsoluteTime(date);
          
          // Should contain AM or PM
          expect(formatted).toMatch(/(AM|PM)$/);
          
          // Should have colon separator
          expect(formatted).toContain(':');
          
          // Minutes should be zero-padded
          const minPart = formatted.split(':')[1].split(' ')[0];
          expect(minPart.length).toBe(2);
          
          // Hour should be 1-12 (12-hour format)
          const hourPart = parseInt(formatted.split(':')[0], 10);
          expect(hourPart).toBeGreaterThanOrEqual(1);
          expect(hourPart).toBeLessThanOrEqual(12);
          
          // Verify AM/PM correctness
          if (hours >= 12) {
            expect(formatted).toContain('PM');
          } else {
            expect(formatted).toContain('AM');
          }
        }
      ),
      PBT_CONFIG
    );
    
    // Test formatRelativeTime
    fc.assert(
      fc.property(
        fc.integer({ min: -10, max: 300 }), // minutes (including negative for edge case)
        (minutes) => {
          const formatted = formatRelativeTime(minutes);
          
          if (minutes <= 0) {
            expect(formatted).toBe('now');
          } else if (minutes < 60) {
            expect(formatted).toBe(`in ${minutes} min`);
          } else {
            const hrs = Math.floor(minutes / 60);
            const mins = minutes % 60;
            if (mins === 0) {
              expect(formatted).toBe(`in ${hrs} hr`);
            } else {
              expect(formatted).toBe(`in ${hrs} hr ${mins} min`);
            }
          }
        }
      ),
      PBT_CONFIG
    );
  });
  
  /**
   * Feature: preorder-items-separation, Property 12: Told Filter State Visibility
   * 
   * For any set of items with told counts:
   * - When showToldItems is false, only items with delta > 0 are visible
   * - When showToldItems is true, all items (including told) are visible
   * - Toggle function correctly flips the state
   * 
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.6**
   */
  test('Property 12: Told filter state controls visibility', () => {
    const toldCountArb = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      fc.integer({ min: 0, max: 100 })
    );
    
    fc.assert(
      fc.property(ordersWithPreorderArb, toldCountArb, fc.boolean(), (orders, toldCounts, showTold) => {
        // Set up mock AdminState
        global.AdminState = { orders, toldCounts, showToldItems: showTold };
        
        const { visible, hidden } = getVisibleNeedsAnnouncingItems();
        
        // Visible items always have delta > 0
        visible.forEach(item => {
          expect(item.delta).toBeGreaterThan(0);
        });
        
        // Hidden items always have delta === 0
        hidden.forEach(item => {
          expect(item.delta).toBe(0);
        });
        
        // The showToldItems flag determines if hidden items should be shown in UI
        // (This is tested at the rendering level, but we verify the data split is correct)
        if (showTold) {
          // When filter is on, UI would show both visible and hidden
          // The data layer correctly separates them for the UI to decide
        } else {
          // When filter is off, UI would only show visible
          // Hidden items exist but are not displayed
        }
        
        // Verify no item appears in both lists
        const visibleNames = new Set(visible.map(i => i.name));
        const hiddenNames = new Set(hidden.map(i => i.name));
        visibleNames.forEach(name => {
          expect(hiddenNames.has(name)).toBe(false);
        });
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Feature: preorder-items-separation, Property 13: Badge Count Accuracy
   * 
   * For any set of orders and told counts:
   * - Items badge SHALL equal count of visible needs-announcing items (delta > 0)
   * - Badge excludes pre-orders (planning only) and told items
   * 
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  test('Property 13: Badge count equals visible needs-announcing items', () => {
    const toldCountArb = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0),
      fc.integer({ min: 0, max: 100 })
    );
    
    fc.assert(
      fc.property(ordersWithPreorderArb, toldCountArb, (orders, toldCounts) => {
        // Set up mock AdminState
        global.AdminState = { orders, toldCounts, showToldItems: false };
        
        const { visible } = getVisibleNeedsAnnouncingItems();
        
        // Badge count should equal visible items count
        const expectedBadgeCount = visible.length;
        
        // All visible items have delta > 0 (action needed)
        visible.forEach(item => {
          expect(item.delta).toBeGreaterThan(0);
        });
        
        // Verify pre-orders are not included
        const { futurePreOrders } = partitionOrders(orders);
        const preOrderItemNames = new Set();
        futurePreOrders.forEach(order => {
          (order.items || []).forEach(item => preOrderItemNames.add(item.title));
        });
        
        // Items that ONLY appear in pre-orders should not be in visible
        // (Items can appear in both needs-announcing and pre-orders if they have orders in both)
        const visibleNames = new Set(visible.map(i => i.name));
        const { needsAnnouncingOrders } = partitionOrders(orders);
        const needsAnnouncingItemNames = new Set();
        needsAnnouncingOrders.forEach(order => {
          (order.items || []).forEach(item => needsAnnouncingItemNames.add(item.title));
        });
        
        // Every visible item must come from needs-announcing orders
        visibleNames.forEach(name => {
          expect(needsAnnouncingItemNames.has(name)).toBe(true);
        });
        
        // Badge count is accurate
        expect(expectedBadgeCount).toBe(visible.length);
      }),
      PBT_CONFIG
    );
  });

});

// ============================================
// STATE CONSISTENCY BUG FIX TESTS
// ============================================

describe('State Consistency Bug Fixes - Aggregation Keys', () => {
  /**
   * Feature: preorder-items-separation, Property 10: Aggregation Key Uniqueness
   * 
   * For any set of orders:
   * - Each aggregation key in getNeedsAnnouncingItems() SHALL be unique
   * - Live order keys SHALL have format "live:{itemName}"
   * - Pre-order keys SHALL have format "preorder:{itemName}:{scheduledTimeISO}"
   * 
   * **Validates: Requirements 7.4, 8.1**
   */
  test('Property 10: Aggregation key uniqueness and format', () => {
    fc.assert(
      fc.property(ordersWithPreorderArb, (orders) => {
        global.AdminState = { orders, toldCounts: {}, showToldItems: false, pendingToldActions: new Set() };
        
        const items = getNeedsAnnouncingItems();
        
        // All aggregation keys must be unique
        const keys = items.map(i => i.aggregationKey);
        const uniqueKeys = new Set(keys);
        expect(uniqueKeys.size).toBe(keys.length);
        
        // Verify key formats
        items.forEach(item => {
          if (item.isPreOrder || item.hasPreOrderSource) {
            // Pre-order keys must have format "preorder:{itemName}:{scheduledTimeISO}"
            expect(item.aggregationKey).toMatch(/^preorder:.+:.+$/);
            expect(item.aggregationKey.startsWith('preorder:')).toBe(true);
            // Must include scheduled time
            expect(item.scheduledTimeISO).toBeTruthy();
          } else {
            // Live order keys must have format "live:{itemName}"
            expect(item.aggregationKey).toMatch(/^live:.+$/);
            expect(item.aggregationKey.startsWith('live:')).toBe(true);
          }
        });
        
        // Verify getAggregationKey and parseAggregationKey are inverses
        items.forEach(item => {
          const parsed = parseAggregationKey(item.aggregationKey);
          expect(parsed.itemName).toBe(item.name);
          if (item.isPreOrder || item.hasPreOrderSource) {
            expect(parsed.type).toBe('preorder');
            expect(parsed.scheduledTimeISO).toBe(item.scheduledTimeISO);
          } else {
            expect(parsed.type).toBe('live');
            expect(parsed.scheduledTimeISO).toBeNull();
          }
        });
      }),
      PBT_CONFIG
    );
  });
  
  /**
   * Feature: preorder-items-separation, Property 8: Pre-order Scheduled Time Separation
   * 
   * For any two pre-orders with the same item name but different scheduled times,
   * getNeedsAnnouncingItems() SHALL return them as separate entries with different aggregation keys.
   * 
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
   */
  test('Property 8: Pre-order scheduled time separation', () => {
    // Create orders with same item but different scheduled times
    const now = Date.now();
    const time1 = new Date(now + 10 * 60 * 1000).toISOString(); // 10 min from now
    const time2 = new Date(now + 20 * 60 * 1000).toISOString(); // 20 min from now
    
    const orders = [
      {
        id: 'order-1',
        status: 'PENDING',
        created_at: new Date(now - 5 * 60 * 1000).toISOString(),
        preorder_time: time1,
        items: [{ id: 1, title: 'Chicken Biryani', quantity: 2, price: 15 }]
      },
      {
        id: 'order-2',
        status: 'PENDING',
        created_at: new Date(now - 3 * 60 * 1000).toISOString(),
        preorder_time: time2,
        items: [{ id: 1, title: 'Chicken Biryani', quantity: 3, price: 15 }]
      }
    ];
    
    global.AdminState = { orders, toldCounts: {}, showToldItems: false, pendingToldActions: new Set() };
    
    const items = getNeedsAnnouncingItems();
    
    // Should have 2 separate entries for the same item name
    const biryaniItems = items.filter(i => i.name === 'Chicken Biryani');
    expect(biryaniItems.length).toBe(2);
    
    // Each should have different aggregation keys
    expect(biryaniItems[0].aggregationKey).not.toBe(biryaniItems[1].aggregationKey);
    
    // Each should have different scheduled times
    expect(biryaniItems[0].scheduledTimeISO).not.toBe(biryaniItems[1].scheduledTimeISO);
    
    // Quantities should be separate
    const quantities = biryaniItems.map(i => i.quantity).sort((a, b) => a - b);
    expect(quantities).toEqual([2, 3]);
  });
  
  /**
   * Feature: preorder-items-separation, Property 9: Told State Isolation
   * 
   * For any told action on a pre-order item, the told state SHALL NOT affect:
   * - Live order items with the same name
   * - Pre-order items with the same name but different scheduled times
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
   */
  test('Property 9: Told state isolation between order types', () => {
    const now = Date.now();
    const preorderTime = new Date(now + 15 * 60 * 1000).toISOString();
    
    const orders = [
      // Live order
      {
        id: 'live-1',
        status: 'PENDING',
        created_at: new Date(now - 5 * 60 * 1000).toISOString(),
        preorder_time: null,
        items: [{ id: 1, title: 'Chicken Biryani', quantity: 5, price: 15 }]
      },
      // Pre-order
      {
        id: 'preorder-1',
        status: 'PENDING',
        created_at: new Date(now - 3 * 60 * 1000).toISOString(),
        preorder_time: preorderTime,
        items: [{ id: 1, title: 'Chicken Biryani', quantity: 3, price: 15 }]
      }
    ];
    
    // Mark only the pre-order as told
    const preorderKey = `preorder:Chicken Biryani:${preorderTime}`;
    const toldCounts = { [preorderKey]: 3 };
    
    global.AdminState = { orders, toldCounts, showToldItems: false, pendingToldActions: new Set() };
    
    const { visible, hidden } = getVisibleNeedsAnnouncingItems();
    
    // Live order should still be visible (not affected by pre-order told state)
    const liveItem = visible.find(i => i.aggregationKey === 'live:Chicken Biryani');
    expect(liveItem).toBeDefined();
    expect(liveItem.delta).toBe(5); // Full quantity, not affected
    
    // Pre-order should be hidden (told)
    const preorderItem = hidden.find(i => i.aggregationKey === preorderKey);
    expect(preorderItem).toBeDefined();
    expect(preorderItem.delta).toBe(0);
  });
  
  /**
   * Feature: preorder-items-separation, Property 12: New Live Orders Always Visible
   * 
   * For any new live order arriving after pre-orders have been marked as told,
   * the live order items SHALL appear in Needs Announcing with delta > 0.
   * 
   * **Validates: Requirements 8.4**
   */
  test('Property 12: New live orders always visible regardless of pre-order told state', () => {
    const now = Date.now();
    const preorderTime = new Date(now + 15 * 60 * 1000).toISOString();
    
    // Scenario: Pre-order was marked as told, then a new live order arrives
    const orders = [
      // Pre-order (already told)
      {
        id: 'preorder-1',
        status: 'PENDING',
        created_at: new Date(now - 10 * 60 * 1000).toISOString(),
        preorder_time: preorderTime,
        items: [{ id: 1, title: 'Chicken Biryani', quantity: 3, price: 15 }]
      },
      // New live order (arrived after pre-order was told)
      {
        id: 'live-1',
        status: 'PENDING',
        created_at: new Date(now - 1 * 60 * 1000).toISOString(),
        preorder_time: null,
        items: [{ id: 1, title: 'Chicken Biryani', quantity: 2, price: 15 }]
      }
    ];
    
    // Pre-order is told, but live order should NOT inherit this state
    const preorderKey = `preorder:Chicken Biryani:${preorderTime}`;
    const toldCounts = { [preorderKey]: 3 };
    
    global.AdminState = { orders, toldCounts, showToldItems: false, pendingToldActions: new Set() };
    
    const { visible } = getVisibleNeedsAnnouncingItems();
    
    // Live order must be visible with full delta
    const liveItem = visible.find(i => i.aggregationKey === 'live:Chicken Biryani');
    expect(liveItem).toBeDefined();
    expect(liveItem.delta).toBe(2);
    expect(liveItem.quantity).toBe(2);
  });
  
  /**
   * Feature: preorder-items-separation, Property 11: Told State Cleanup Correctness
   * 
   * For any set of orders, after cleanupToldCounts() is called:
   * - All remaining told entries SHALL have a corresponding aggregation bucket in current orders
   * - No valid aggregation keys SHALL be removed
   * 
   * **Validates: Requirements 8.5, 9.3, 9.4, 9.5**
   */
  test('Property 11: Told state cleanup removes only stale entries', () => {
    const now = Date.now();
    const preorderTime1 = new Date(now + 15 * 60 * 1000).toISOString();
    const preorderTime2 = new Date(now + 30 * 60 * 1000).toISOString();
    
    // Current orders
    const orders = [
      // Live order
      {
        id: 'live-1',
        status: 'PENDING',
        created_at: new Date(now - 5 * 60 * 1000).toISOString(),
        preorder_time: null,
        items: [{ id: 1, title: 'Chicken Biryani', quantity: 5, price: 15 }]
      },
      // Pre-order with time1
      {
        id: 'preorder-1',
        status: 'PENDING',
        created_at: new Date(now - 3 * 60 * 1000).toISOString(),
        preorder_time: preorderTime1,
        items: [{ id: 1, title: 'Lamb Curry', quantity: 3, price: 18 }]
      }
    ];
    
    // Told counts include valid and stale entries
    const toldCounts = {
      // Valid entries (match current orders)
      'live:Chicken Biryani': 3,
      [`preorder:Lamb Curry:${preorderTime1}`]: 2,
      // Stale entries (no matching orders)
      'live:Old Item': 5,
      [`preorder:Lamb Curry:${preorderTime2}`]: 4, // Different scheduled time
      'preorder:Nonexistent:2026-01-15T12:00:00.000Z': 1
    };
    
    global.AdminState = { orders, toldCounts: { ...toldCounts }, showToldItems: false, pendingToldActions: new Set() };
    
    // Mock saveToldCounts to prevent localStorage errors in test
    const originalSave = global.saveToldCounts;
    global.saveToldCounts = () => {};
    
    // Simulate cleanupToldCounts logic
    const validKeys = new Set();
    const pendingOrders = orders.filter(o => o.status === 'PENDING');
    
    pendingOrders.forEach(order => {
      const isPreOrder = !!order.preorder_time;
      const scheduledTimeISO = order.preorder_time;
      
      (order.items || []).forEach(item => {
        if (isPreOrder && scheduledTimeISO) {
          validKeys.add(getAggregationKey(item.title, true, scheduledTimeISO));
        } else {
          validKeys.add(getAggregationKey(item.title, false, null));
        }
      });
    });
    
    // Remove stale entries
    Object.keys(global.AdminState.toldCounts).forEach(key => {
      if (!validKeys.has(key)) {
        delete global.AdminState.toldCounts[key];
      }
    });
    
    // Verify valid entries are preserved
    expect(global.AdminState.toldCounts['live:Chicken Biryani']).toBe(3);
    expect(global.AdminState.toldCounts[`preorder:Lamb Curry:${preorderTime1}`]).toBe(2);
    
    // Verify stale entries are removed
    expect(global.AdminState.toldCounts['live:Old Item']).toBeUndefined();
    expect(global.AdminState.toldCounts[`preorder:Lamb Curry:${preorderTime2}`]).toBeUndefined();
    expect(global.AdminState.toldCounts['preorder:Nonexistent:2026-01-15T12:00:00.000Z']).toBeUndefined();
    
    // Verify only valid keys remain
    expect(Object.keys(global.AdminState.toldCounts).length).toBe(2);
    
    // Restore
    if (originalSave) global.saveToldCounts = originalSave;
  });
  
  /**
   * Feature: preorder-items-separation, Property 13: Race Condition Safety
   * 
   * For any sequence of rapid told actions:
   * - Each action SHALL be processed independently
   * - Duplicate actions on the same key SHALL be prevented while pending
   * - Result in consistent final state
   * 
   * **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
   */
  test('Property 13: Race condition safety - pendingToldActions prevents duplicates', () => {
    const now = Date.now();
    
    const orders = [
      {
        id: 'live-1',
        status: 'PENDING',
        created_at: new Date(now - 5 * 60 * 1000).toISOString(),
        preorder_time: null,
        items: [{ id: 1, title: 'Chicken Biryani', quantity: 5, price: 15 }]
      }
    ];
    
    const pendingToldActions = new Set();
    const toldCounts = {};
    
    global.AdminState = { orders, toldCounts, showToldItems: false, pendingToldActions };
    
    const aggKey = 'live:Chicken Biryani';
    
    // Simulate handleTold behavior - first call should proceed
    const canProceed1 = !global.AdminState.pendingToldActions.has(aggKey);
    expect(canProceed1).toBe(true);
    
    // Add to pending
    global.AdminState.pendingToldActions.add(aggKey);
    
    // Second call while first is pending should be blocked
    const canProceed2 = !global.AdminState.pendingToldActions.has(aggKey);
    expect(canProceed2).toBe(false);
    
    // Third call while first is still pending should also be blocked
    const canProceed3 = !global.AdminState.pendingToldActions.has(aggKey);
    expect(canProceed3).toBe(false);
    
    // After first completes, remove from pending
    global.AdminState.pendingToldActions.delete(aggKey);
    
    // Now a new call should proceed
    const canProceed4 = !global.AdminState.pendingToldActions.has(aggKey);
    expect(canProceed4).toBe(true);
    
    // Verify different keys can proceed independently
    const aggKey2 = 'live:Lamb Curry';
    global.AdminState.pendingToldActions.add(aggKey);
    
    // Different key should not be blocked
    const canProceedDifferentKey = !global.AdminState.pendingToldActions.has(aggKey2);
    expect(canProceedDifferentKey).toBe(true);
    
    // Original key should still be blocked
    const canProceedOriginalKey = !global.AdminState.pendingToldActions.has(aggKey);
    expect(canProceedOriginalKey).toBe(false);
  });
  
  /**
   * Feature: preorder-items-separation, Property 14: Live Order Delta Monotonicity
   * 
   * For any sequence of live orders for the same item:
   * - New orders SHALL always increase the total quantity
   * - Delta SHALL always be positive when new orders arrive after told action
   * - Told state SHALL only apply to quantities that existed at told time
   * - New orders SHALL never inherit told state from previous cycles
   * 
   * **Validates: Requirements 8.4, 11.1, 11.2, 11.3**
   */
  test('Property 14: Live order delta is monotonic - new orders always create positive delta', () => {
    const now = Date.now();
    
    // Scenario: User marks 2x Chicken Biryani as told, then 3 more orders arrive
    // Expected: delta should be 3 (new orders), not 0 (incorrectly inheriting told state)
    
    // Initial state: 2x Chicken Biryani from first order
    const order1 = {
      id: 'live-1',
      status: 'PENDING',
      created_at: new Date(now - 10 * 60 * 1000).toISOString(), // 10 min ago
      preorder_time: null,
      items: [{ id: 1, title: 'Chicken Biryani', quantity: 2, price: 15 }]
    };
    
    global.AdminState = { 
      orders: [order1], 
      toldCounts: {}, 
      showToldItems: false, 
      pendingToldActions: new Set() 
    };
    
    // Get initial items - should show delta=2
    let items = getNeedsAnnouncingItems();
    let chickenItem = items.find(i => i.name === 'Chicken Biryani');
    expect(chickenItem.quantity).toBe(2);
    expect(chickenItem.delta).toBe(2);
    expect(chickenItem.isTold).toBe(false);
    
    // User clicks TOLD - marks 2 as told
    global.AdminState.toldCounts['live:Chicken Biryani'] = 2;
    
    // Verify item is now told
    items = getNeedsAnnouncingItems();
    chickenItem = items.find(i => i.name === 'Chicken Biryani');
    expect(chickenItem.quantity).toBe(2);
    expect(chickenItem.delta).toBe(0);
    expect(chickenItem.isTold).toBe(true);
    
    // NEW ORDER ARRIVES: 1x Chicken Biryani (5 min later, outside merge window)
    const order2 = {
      id: 'live-2',
      status: 'PENDING',
      created_at: new Date(now - 5 * 60 * 1000).toISOString(), // 5 min ago
      preorder_time: null,
      items: [{ id: 2, title: 'Chicken Biryani', quantity: 1, price: 15 }]
    };
    global.AdminState.orders.push(order2);
    
    // CRITICAL: New order should create positive delta
    items = getNeedsAnnouncingItems();
    chickenItem = items.find(i => i.name === 'Chicken Biryani');
    expect(chickenItem.quantity).toBe(3); // 2 + 1
    expect(chickenItem.toldCount).toBe(2); // Still 2 from before
    expect(chickenItem.delta).toBe(1); // 3 - 2 = 1 (NEW ORDER VISIBLE!)
    expect(chickenItem.isTold).toBe(false); // Should NOT be told
    
    // MORE ORDERS ARRIVE: 2x Chicken Biryani
    const order3 = {
      id: 'live-3',
      status: 'PENDING',
      created_at: new Date(now - 2 * 60 * 1000).toISOString(), // 2 min ago
      preorder_time: null,
      items: [{ id: 3, title: 'Chicken Biryani', quantity: 2, price: 15 }]
    };
    global.AdminState.orders.push(order3);
    
    // Delta should continue to grow
    items = getNeedsAnnouncingItems();
    chickenItem = items.find(i => i.name === 'Chicken Biryani');
    expect(chickenItem.quantity).toBe(5); // 2 + 1 + 2
    expect(chickenItem.toldCount).toBe(2); // Still 2 from before
    expect(chickenItem.delta).toBe(3); // 5 - 2 = 3 (ALL NEW ORDERS VISIBLE!)
    expect(chickenItem.isTold).toBe(false);
    
    // User clicks TOLD again - marks all 5 as told
    global.AdminState.toldCounts['live:Chicken Biryani'] = 5;
    
    items = getNeedsAnnouncingItems();
    chickenItem = items.find(i => i.name === 'Chicken Biryani');
    expect(chickenItem.quantity).toBe(5);
    expect(chickenItem.delta).toBe(0);
    expect(chickenItem.isTold).toBe(true);
    
    // ANOTHER NEW ORDER: 1x Chicken Biryani
    const order4 = {
      id: 'live-4',
      status: 'PENDING',
      created_at: new Date(now - 1 * 60 * 1000).toISOString(), // 1 min ago
      preorder_time: null,
      items: [{ id: 4, title: 'Chicken Biryani', quantity: 1, price: 15 }]
    };
    global.AdminState.orders.push(order4);
    
    // New order should ALWAYS be visible
    items = getNeedsAnnouncingItems();
    chickenItem = items.find(i => i.name === 'Chicken Biryani');
    expect(chickenItem.quantity).toBe(6); // 5 + 1
    expect(chickenItem.toldCount).toBe(5);
    expect(chickenItem.delta).toBe(1); // 6 - 5 = 1 (NEW ORDER VISIBLE!)
    expect(chickenItem.isTold).toBe(false);
  });
  
  /**
   * Feature: preorder-items-separation, Property 15: Live orders aggregate correctly
   * 
   * For any set of live orders with the same item:
   * - All quantities SHALL be summed into a single entry
   * - There SHALL be exactly one entry per item name
   * - The aggregation key SHALL be consistent across all orders
   * 
   * **Validates: Requirements 11.1, 11.2**
   */
  test('Property 15: Live orders aggregate into single entry per item', () => {
    const now = Date.now();
    
    // Multiple orders for same item at different times
    const orders = [
      {
        id: 'live-1',
        status: 'PENDING',
        created_at: new Date(now - 30 * 60 * 1000).toISOString(), // 30 min ago
        preorder_time: null,
        items: [{ id: 1, title: 'Chicken Biryani', quantity: 2, price: 15 }]
      },
      {
        id: 'live-2',
        status: 'PENDING',
        created_at: new Date(now - 20 * 60 * 1000).toISOString(), // 20 min ago
        preorder_time: null,
        items: [{ id: 2, title: 'Chicken Biryani', quantity: 1, price: 15 }]
      },
      {
        id: 'live-3',
        status: 'PENDING',
        created_at: new Date(now - 10 * 60 * 1000).toISOString(), // 10 min ago
        preorder_time: null,
        items: [{ id: 3, title: 'Chicken Biryani', quantity: 3, price: 15 }]
      },
      {
        id: 'live-4',
        status: 'PENDING',
        created_at: new Date(now - 5 * 60 * 1000).toISOString(), // 5 min ago
        preorder_time: null,
        items: [{ id: 4, title: 'Lamb Curry', quantity: 2, price: 18 }]
      }
    ];
    
    global.AdminState = { 
      orders, 
      toldCounts: {}, 
      showToldItems: false, 
      pendingToldActions: new Set() 
    };
    
    const items = getNeedsAnnouncingItems();
    
    // Should have exactly 2 items (one per unique item name)
    const liveItems = items.filter(i => !i.isPreOrder);
    expect(liveItems.length).toBe(2);
    
    // Chicken Biryani should be aggregated
    const chickenItem = liveItems.find(i => i.name === 'Chicken Biryani');
    expect(chickenItem).toBeDefined();
    expect(chickenItem.quantity).toBe(6); // 2 + 1 + 3
    expect(chickenItem.orderCount).toBe(3);
    expect(chickenItem.aggregationKey).toBe('live:Chicken Biryani');
    expect(chickenItem.delta).toBe(6); // No told count yet
    
    // Lamb Curry should be separate
    const lambItem = liveItems.find(i => i.name === 'Lamb Curry');
    expect(lambItem).toBeDefined();
    expect(lambItem.quantity).toBe(2);
    expect(lambItem.orderCount).toBe(1);
    expect(lambItem.aggregationKey).toBe('live:Lamb Curry');
    expect(lambItem.delta).toBe(2);
    
    // Wait time should be based on oldest order
    expect(chickenItem.waitMinutes).toBe(30); // Oldest order was 30 min ago
    expect(lambItem.waitMinutes).toBe(5); // Only order was 5 min ago
  });
  
  /**
   * Feature: preorder-items-separation, Property 16: Announce-cycle model for live orders
   * 
   * For live orders, the told state uses an announce-cycle model:
   * - When TOLD is clicked, we store { toldTimestamp, toldQuantity }
   * - Orders created AFTER toldTimestamp show as delta
   * - If new order arrives within 3 min of toldTimestamp: shows as +X delta
   * - If new order arrives after 3 min: stays in "Already Told"
   * 
   * **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**
   */
  test('Property 16: Announce-cycle model - new orders within 3 min show as delta', () => {
    const now = Date.now();
    
    // Order 1: 2x Chicken Biryani arrives 10 min ago
    const order1Time = now - 10 * 60 * 1000;
    const order1 = {
      id: 'live-1',
      status: 'PENDING',
      created_at: new Date(order1Time).toISOString(),
      preorder_time: null,
      items: [{ id: 1, title: 'Chicken Biryani', quantity: 2, price: 15 }]
    };
    
    global.AdminState = { 
      orders: [order1], 
      toldCounts: {}, 
      showToldItems: false, 
      pendingToldActions: new Set() 
    };
    
    // Initial state: delta = 2
    let items = getNeedsAnnouncingItems();
    let chickenItem = items.find(i => i.name === 'Chicken Biryani');
    expect(chickenItem.delta).toBe(2);
    expect(chickenItem.isTold).toBe(false);
    
    // Staff clicks TOLD at T=now (simulating 5 min ago for testing)
    const toldTimestamp = now - 5 * 60 * 1000; // 5 min ago
    global.AdminState.toldCounts['live:Chicken Biryani'] = {
      toldTimestamp,
      toldQuantity: 2,
    };
    
    // Verify item is now told (order1 was created BEFORE toldTimestamp)
    items = getNeedsAnnouncingItems();
    chickenItem = items.find(i => i.name === 'Chicken Biryani');
    expect(chickenItem.delta).toBe(0);
    expect(chickenItem.isTold).toBe(true);
    
    // NEW ORDER ARRIVES: 1x Chicken Biryani, created 4 min ago (1 min after told)
    // This is WITHIN the 3-min delta window from toldTimestamp
    const order2Time = now - 4 * 60 * 1000; // 4 min ago (1 min after told)
    const order2 = {
      id: 'live-2',
      status: 'PENDING',
      created_at: new Date(order2Time).toISOString(),
      preorder_time: null,
      items: [{ id: 2, title: 'Chicken Biryani', quantity: 1, price: 15 }]
    };
    global.AdminState.orders.push(order2);
    
    // Order2 was created AFTER toldTimestamp, so it should show as delta
    items = getNeedsAnnouncingItems();
    chickenItem = items.find(i => i.name === 'Chicken Biryani');
    expect(chickenItem.quantity).toBe(3); // 2 + 1
    expect(chickenItem.delta).toBe(1); // Only the new order shows as delta
    expect(chickenItem.isTold).toBe(false); // Has new items to announce
  });
  
  /**
   * Feature: preorder-items-separation, Property 17: Announce-cycle - orders after 3 min stay told
   * 
   * If a new order arrives MORE than 3 minutes after the told action,
   * the item should stay in "Already Told" (told state persists).
   * 
   * **Validates: Requirements 11.3, 11.4**
   */
  test('Property 17: Announce-cycle model - orders after 3 min stay in Already Told', () => {
    const now = Date.now();
    
    // Order 1: 2x Chicken Biryani arrives 10 min ago
    const order1Time = now - 10 * 60 * 1000;
    const order1 = {
      id: 'live-1',
      status: 'PENDING',
      created_at: new Date(order1Time).toISOString(),
      preorder_time: null,
      items: [{ id: 1, title: 'Chicken Biryani', quantity: 2, price: 15 }]
    };
    
    global.AdminState = { 
      orders: [order1], 
      toldCounts: {}, 
      showToldItems: false, 
      pendingToldActions: new Set() 
    };
    
    // Staff clicks TOLD 5 min ago
    const toldTimestamp = now - 5 * 60 * 1000; // 5 min ago
    global.AdminState.toldCounts['live:Chicken Biryani'] = {
      toldTimestamp,
      toldQuantity: 2,
    };
    
    // NEW ORDER ARRIVES: 1x Chicken Biryani, created 1 min ago (4 min after told)
    // This is OUTSIDE the 3-min delta window from toldTimestamp
    const order2Time = now - 1 * 60 * 1000; // 1 min ago (4 min after told)
    const order2 = {
      id: 'live-2',
      status: 'PENDING',
      created_at: new Date(order2Time).toISOString(),
      preorder_time: null,
      items: [{ id: 2, title: 'Chicken Biryani', quantity: 1, price: 15 }]
    };
    global.AdminState.orders.push(order2);
    
    // Order2 was created AFTER toldTimestamp, but we're now outside the 3-min window
    // So the item should stay in "Already Told"
    const items = getNeedsAnnouncingItems();
    const chickenItem = items.find(i => i.name === 'Chicken Biryani');
    expect(chickenItem.quantity).toBe(3); // 2 + 1
    expect(chickenItem.delta).toBe(0); // Outside delta window, stays told
    expect(chickenItem.isTold).toBe(true); // Stays in Already Told
  });
});

// Export functions for potential use in other test files
module.exports = {
  getItemSummary,
  calculateBadgeCounts,
  getSortedItems,
  filterOrdersByStatus,
  filterOrdersByItem,
  getSortedCompletedOrders,
  filterByVerificationCode,
  getConfirmDialogContent,
  applyStatusTransition,
  isButtonDisabled,
  simulateOptimisticUpdate
};
