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
