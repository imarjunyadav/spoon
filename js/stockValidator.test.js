/**
 * Property-Based Tests for StockValidator
 * 
 * Feature: realtime-subscriptions
 * 
 * These tests validate the correctness properties defined in the design document
 * using fast-check for property-based testing.
 */

const fc = require('fast-check');
const { StockValidator } = require('./stockValidator');

// Test configuration: minimum 100 iterations per property
const PBT_CONFIG = { numRuns: 100 };

// Item ID generator
const itemIdArb = fc.integer({ min: 1, max: 10000 });

// Item name generator
const itemNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

// Availability status generator
const availabilityArb = fc.boolean();

/**
 * Mock Supabase client for testing
 * Creates a minimal mock that simulates database queries
 */
function createMockSupabase(mockData = {}) {
  return {
    from(tableName) {
      return {
        select(columns) {
          return {
            eq(column, value) {
              return {
                single() {
                  // Return mock data based on item ID
                  const item = mockData[value];
                  if (item) {
                    return Promise.resolve({ data: item, error: null });
                  }
                  return Promise.resolve({ data: null, error: { message: 'Item not found' } });
                }
              };
            }
          };
        }
      };
    }
  };
}

/**
 * Mock Supabase client that simulates network errors
 */
function createErrorSupabase(errorMessage = 'Network error') {
  return {
    from(tableName) {
      return {
        select(columns) {
          return {
            eq(column, value) {
              return {
                single() {
                  return Promise.resolve({ data: null, error: { message: errorMessage } });
                }
              };
            }
          };
        }
      };
    }
  };
}

describe('StockValidator Property-Based Tests', () => {
  let validator;

  beforeEach(() => {
    // Create a fresh validator instance for each test
    validator = Object.assign({}, StockValidator);
    validator._supabase = null;
  });

  /**
   * Feature: realtime-subscriptions, Property 3: Add-to-cart validates stock availability
   * 
   * For any add-to-cart action on the customer menu, the system should query
   * the database to verify the item's current availability before proceeding.
   * 
   * **Validates: Requirements 3.3**
   */
  test('Property 3: Add-to-cart validates stock availability', async () => {
    await fc.assert(
      fc.asyncProperty(
        itemIdArb,
        itemNameArb,
        availabilityArb,
        async (itemId, itemName, isAvailable) => {
          // Create mock data for this item
          const mockData = {
            [itemId]: {
              id: itemId,
              name: itemName,
              is_available: isAvailable
            }
          };
          
          // Initialize validator with mock Supabase
          const mockSupabase = createMockSupabase(mockData);
          validator.init(mockSupabase);
          
          // Call checkAvailability
          const result = await validator.checkAvailability(itemId);
          
          // Property: The result should reflect the actual availability status
          expect(result.available).toBe(isAvailable);
          
          // Property: The item data should be returned
          expect(result.item).not.toBeNull();
          expect(result.item.id).toBe(itemId);
          expect(result.item.name).toBe(itemName);
          expect(result.item.is_available).toBe(isAvailable);
          
          // Property: No error should be returned for valid queries
          expect(result.error).toBeNull();
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: realtime-subscriptions, Property 4: Unavailable items are blocked from cart
   * 
   * For any item where `is_available` is false at the time of add-to-cart,
   * the system should prevent the addition, show an alert, and disable the button.
   * 
   * **Validates: Requirements 3.4**
   */
  test('Property 4: Unavailable items are blocked from cart', async () => {
    await fc.assert(
      fc.asyncProperty(
        itemIdArb,
        itemNameArb,
        async (itemId, itemName) => {
          // Create mock data with item marked as unavailable
          const mockData = {
            [itemId]: {
              id: itemId,
              name: itemName,
              is_available: false // Always unavailable for this test
            }
          };
          
          // Initialize validator with mock Supabase
          const mockSupabase = createMockSupabase(mockData);
          validator.init(mockSupabase);
          
          // Call checkAvailability
          const result = await validator.checkAvailability(itemId);
          
          // Property: Unavailable items should return available: false
          expect(result.available).toBe(false);
          
          // Property: The item data should indicate unavailability
          expect(result.item).not.toBeNull();
          expect(result.item.is_available).toBe(false);
          
          // Property: No error should be returned (this is a valid response)
          expect(result.error).toBeNull();
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Additional property test: Network errors return optimistic result
   * 
   * For any network error during stock check, the system should return
   * an optimistic result (available: true) to allow the add-to-cart action.
   * The backend will validate at checkout.
   * 
   * **Validates: Requirements 3.5**
   */
  test('Property: Network errors return optimistic result', async () => {
    await fc.assert(
      fc.asyncProperty(
        itemIdArb,
        fc.string({ minLength: 1, maxLength: 100 }), // Error message
        async (itemId, errorMessage) => {
          // Initialize validator with error-throwing Supabase
          const errorSupabase = createErrorSupabase(errorMessage);
          validator.init(errorSupabase);
          
          // Call checkAvailability
          const result = await validator.checkAvailability(itemId);
          
          // Property: On error, should return optimistic result (available: true)
          expect(result.available).toBe(true);
          
          // Property: Item should be null on error
          expect(result.item).toBeNull();
          
          // Property: Error message should be captured
          expect(result.error).toBe(errorMessage);
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Additional property test: Uninitialized validator returns optimistic result
   * 
   * If the validator is not initialized with a Supabase client,
   * it should return an optimistic result to not block the user.
   */
  test('Property: Uninitialized validator returns optimistic result', async () => {
    await fc.assert(
      fc.asyncProperty(
        itemIdArb,
        async (itemId) => {
          // Don't initialize the validator (no Supabase client)
          
          // Call checkAvailability
          const result = await validator.checkAvailability(itemId);
          
          // Property: Should return optimistic result
          expect(result.available).toBe(true);
          
          // Property: Item should be null
          expect(result.item).toBeNull();
          
          // Property: Error should indicate client not initialized
          expect(result.error).toBe('Client not initialized');
        }
      ),
      PBT_CONFIG
    );
  });
});
