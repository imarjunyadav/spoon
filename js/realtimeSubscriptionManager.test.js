/**
 * Property-Based Tests for RealtimeSubscriptionManager
 * 
 * Feature: realtime-subscriptions
 * 
 * These tests validate the correctness properties defined in the design document
 * using fast-check for property-based testing.
 */

const fc = require('fast-check');
const { RealtimeSubscriptionManager } = require('./realtimeSubscriptionManager');

// Test configuration: minimum 100 iterations per property
const PBT_CONFIG = { numRuns: 100 };

// Table name generator - valid table names for subscriptions
const tableNameArb = fc.constantFrom('orders', 'menu_items', 'users', 'products', 'inventory');

// Generate array of unique table names (1-5 tables)
const tableNamesArb = fc.uniqueArray(tableNameArb, { minLength: 1, maxLength: 5 });

/**
 * Mock Supabase client for testing
 * Creates a minimal mock that tracks channel operations
 * Note: We don't call the status callback to avoid async issues in tests
 */
function createMockSupabase() {
  const channels = new Map();
  const removedChannels = [];
  
  return {
    channels,
    removedChannels,
    channel(name) {
      const channelObj = {
        name,
        subscribed: false,
        listeners: [],
        on(event, config, callback) {
          this.listeners.push({ event, config, callback });
          return this;
        },
        subscribe(statusCallback) {
          this.subscribed = true;
          this.statusCallback = statusCallback;
          channels.set(name, this);
          // Don't call statusCallback to avoid async issues in tests
          // The subscription is tracked synchronously
          return this;
        },
        unsubscribe() {
          this.subscribed = false;
          return Promise.resolve();
        }
      };
      return channelObj;
    },
    removeChannel(channel) {
      if (channel && channel.name) {
        channels.delete(channel.name);
        removedChannels.push(channel.name);
      }
      return Promise.resolve();
    }
  };
}

describe('RealtimeSubscriptionManager Property-Based Tests', () => {
  let manager;
  let mockSupabase;

  beforeEach(() => {
    // Create a fresh manager instance for each test
    manager = Object.assign({}, RealtimeSubscriptionManager);
    manager.channels = {};
    manager.fallbackIntervals = {};
    manager.isConnected = true;
    manager._supabase = null;
    
    mockSupabase = createMockSupabase();
    manager.init(mockSupabase);
  });

  afterEach(() => {
    // Clean up any remaining intervals
    Object.keys(manager.fallbackIntervals).forEach(key => {
      clearInterval(manager.fallbackIntervals[key]);
    });
    manager.channels = {};
    manager.fallbackIntervals = {};
  });

  /**
   * Feature: realtime-subscriptions, Property 2: Cleanup removes all subscriptions on unload
   * 
   * For any set of active subscriptions, when the cleanup function is called,
   * all channels should be unsubscribed and the channels object should be empty.
   * 
   * **Validates: Requirements 1.4, 2.3, 5.1**
   */
  test('Property 2: Cleanup removes all subscriptions on unload', () => {
    fc.assert(
      fc.property(tableNamesArb, (tableNames) => {
        // Reset manager state for this iteration
        manager.channels = {};
        manager.fallbackIntervals = {};
        mockSupabase = createMockSupabase();
        manager._supabase = mockSupabase;
        
        // Create subscriptions for each table name
        const mockCallback = jest.fn();
        tableNames.forEach(tableName => {
          manager.subscribeToTable(tableName, mockCallback);
        });
        
        // Verify subscriptions were created
        const subscriptionCountBefore = Object.keys(manager.channels).length;
        expect(subscriptionCountBefore).toBe(tableNames.length);
        
        // Call cleanup
        manager.cleanup();
        
        // Property: After cleanup, channels object should be empty
        expect(Object.keys(manager.channels).length).toBe(0);
        
        // Property: After cleanup, fallbackIntervals should be empty
        expect(Object.keys(manager.fallbackIntervals).length).toBe(0);
        
        // Property: All channels should have been removed from Supabase
        expect(mockSupabase.removedChannels.length).toBe(tableNames.length);
        
        // Property: isConnected should be false after cleanup
        expect(manager.isConnected).toBe(false);
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: realtime-subscriptions, Property 1: Database changes trigger UI refresh
   * 
   * For any database change event (INSERT or UPDATE) on the orders or menu_items table,
   * the corresponding fetch function should be called within the subscription callback.
   * 
   * **Validates: Requirements 1.2, 1.3, 2.2**
   */
  test('Property 1: Database changes trigger UI refresh', () => {
    // Event type generator
    const eventTypeArb = fc.constantFrom('INSERT', 'UPDATE');
    
    // Payload generator for database changes
    const payloadArb = fc.record({
      commit_timestamp: fc.date().map(d => d.toISOString()),
      eventType: eventTypeArb,
      new: fc.record({
        id: fc.integer({ min: 1, max: 10000 }),
        name: fc.string({ minLength: 1, maxLength: 50 })
      }),
      old: fc.record({
        id: fc.integer({ min: 1, max: 10000 }),
        name: fc.string({ minLength: 1, maxLength: 50 })
      }),
      schema: fc.constant('public'),
      table: tableNameArb
    });

    fc.assert(
      fc.property(tableNameArb, payloadArb, (tableName, payload) => {
        // Reset manager state for this iteration
        manager.channels = {};
        manager.fallbackIntervals = {};
        mockSupabase = createMockSupabase();
        manager._supabase = mockSupabase;
        
        // Create a mock callback to track calls
        const mockCallback = jest.fn();
        
        // Subscribe to the table
        manager.subscribeToTable(tableName, mockCallback);
        
        // Get the channel and find the listeners
        const channel = manager.channels[tableName];
        expect(channel).toBeDefined();
        
        // Find the listener for the event type
        const listeners = channel.listeners.filter(
          l => l.config.event === payload.eventType && l.config.table === tableName
        );
        
        // Property: There should be a listener for this event type
        expect(listeners.length).toBeGreaterThan(0);
        
        // Simulate the database change by calling the listener callback
        listeners.forEach(listener => {
          listener.callback(payload);
        });
        
        // Property: The callback should have been called for each matching listener
        expect(mockCallback).toHaveBeenCalledWith(payload);
        expect(mockCallback).toHaveBeenCalledTimes(listeners.length);
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: realtime-subscriptions, Property 5: No duplicate subscriptions
   * 
   * For any sequence of subscription initialization calls, there should be
   * at most one active subscription per table name.
   * 
   * **Validates: Requirements 5.4**
   */
  test('Property 5: No duplicate subscriptions', () => {
    // Generate a sequence of subscription attempts (1-10 attempts per table)
    const subscriptionAttemptsArb = fc.integer({ min: 1, max: 10 });

    fc.assert(
      fc.property(tableNameArb, subscriptionAttemptsArb, (tableName, attempts) => {
        // Reset manager state for this iteration
        manager.channels = {};
        manager.fallbackIntervals = {};
        mockSupabase = createMockSupabase();
        manager._supabase = mockSupabase;
        
        const mockCallback = jest.fn();
        
        // Attempt to subscribe multiple times to the same table
        const channels = [];
        for (let i = 0; i < attempts; i++) {
          const channel = manager.subscribeToTable(tableName, mockCallback);
          channels.push(channel);
        }
        
        // Property: There should be exactly one subscription for this table
        expect(Object.keys(manager.channels).length).toBe(1);
        expect(manager.channels[tableName]).toBeDefined();
        
        // Property: All returned channels should be the same instance
        const firstChannel = channels[0];
        channels.forEach(channel => {
          expect(channel).toBe(firstChannel);
        });
        
        // Property: Only one channel should have been created in Supabase
        expect(mockSupabase.channels.size).toBe(1);
      }),
      PBT_CONFIG
    );
  });
});
