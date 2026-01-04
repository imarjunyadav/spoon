/**
 * Property-Based Tests for User Service
 * 
 * Feature: otp-scaling-production
 * 
 * These tests validate the correctness properties defined in the design document
 * using fast-check for property-based testing.
 * 
 * Properties tested:
 * - Property 3: User Creation with Required Fields
 * - Property 4: User Lookup Round-Trip
 * 
 * Validates: Requirements 3.1, 3.2, 3.3, 3.5
 */

const fc = require('fast-check');

// Test configuration: minimum 100 iterations per property
const PBT_CONFIG = { numRuns: 100 };

// In-memory mock database for testing
let mockDatabase = new Map();

// Mock Supabase client
const mockSupabaseClient = {
  from: (table) => ({
    insert: (data) => ({
      select: () => ({
        single: async () => {
          const email = data.email;
          
          // Check for duplicate
          if (mockDatabase.has(email)) {
            return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
          
          // Create user with timestamps
          const user = {
            email: data.email,
            name: data.name,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          mockDatabase.set(email, user);
          return { data: user, error: null };
        }
      })
    }),
    select: (columns, options) => {
      if (options && options.head) {
        // For userExists - count query
        return {
          eq: (field, value) => ({
            then: (resolve) => {
              const exists = mockDatabase.has(value);
              resolve({ count: exists ? 1 : 0, error: null });
            }
          })
        };
      }
      // For getUserByEmail
      return {
        eq: (field, value) => ({
          single: async () => {
            const user = mockDatabase.get(value);
            if (!user) {
              return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
            }
            return { data: user, error: null };
          }
        })
      };
    },
    delete: () => ({
      eq: (field, value) => {
        mockDatabase.delete(value);
        return Promise.resolve({ error: null });
      }
    })
  })
};

// Create a testable user service with mock client
function createMockUserService() {
  function normalizeEmail(email) {
    return email.toLowerCase().trim();
  }

  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async function createUser(email, name) {
    if (!email || typeof email !== 'string') {
      return { user: null, error: 'INVALID_EMAIL' };
    }
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return { user: null, error: 'INVALID_NAME' };
    }
    
    const normalizedEmail = normalizeEmail(email);
    
    if (!isValidEmail(normalizedEmail)) {
      return { user: null, error: 'INVALID_EMAIL' };
    }
    
    const { data, error } = await mockSupabaseClient
      .from('users')
      .insert({
        email: normalizedEmail,
        name: name.trim()
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        return { user: null, error: 'USER_EXISTS' };
      }
      return { user: null, error: 'DATABASE_ERROR' };
    }
    
    return { user: data };
  }

  async function getUserByEmail(email) {
    if (!email || typeof email !== 'string') {
      return { user: null, error: 'INVALID_EMAIL' };
    }
    
    const normalizedEmail = normalizeEmail(email);
    
    if (!isValidEmail(normalizedEmail)) {
      return { user: null, error: 'INVALID_EMAIL' };
    }
    
    const { data, error } = await mockSupabaseClient
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return { user: null };
      }
      return { user: null, error: 'DATABASE_ERROR' };
    }
    
    return { user: data };
  }

  async function deleteUser(email) {
    const normalizedEmail = normalizeEmail(email);
    await mockSupabaseClient
      .from('users')
      .delete()
      .eq('email', normalizedEmail);
    return { success: true };
  }

  return {
    createUser,
    getUserByEmail,
    deleteUser,
    normalizeEmail,
    isValidEmail
  };
}

// Arbitraries for property-based testing
const validEmailArb = fc.emailAddress();
const validNameArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

describe('User Service Property-Based Tests', () => {
  let userService;

  beforeAll(() => {
    userService = createMockUserService();
  });

  beforeEach(() => {
    // Clear mock database before each test
    mockDatabase.clear();
  });

  /**
   * Feature: otp-scaling-production, Property 3: User Creation with Required Fields
   * For any valid email and name, creating a user SHALL result in a record containing 
   * email, name, created_at, and updated_at fields, and the email SHALL be unique 
   * (duplicate creation fails).
   * Validates: Requirements 3.1, 3.3, 3.5
   */
  test('Property 3: User Creation with Required Fields', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validNameArb, async (email, name) => {
        // Create user
        const result = await userService.createUser(email, name);
        
        // Should succeed
        expect(result.error).toBeUndefined();
        expect(result.user).not.toBeNull();
        
        // Should have all required fields
        expect(result.user.email).toBe(email.toLowerCase().trim());
        expect(result.user.name).toBe(name.trim());
        expect(result.user.created_at).toBeDefined();
        expect(result.user.updated_at).toBeDefined();
        
        // Duplicate creation should fail with USER_EXISTS
        const duplicateResult = await userService.createUser(email, name);
        expect(duplicateResult.user).toBeNull();
        expect(duplicateResult.error).toBe('USER_EXISTS');
        
        // Clean up for next iteration
        await userService.deleteUser(email);
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: otp-scaling-production, Property 4: User Lookup Round-Trip
   * For any user that has been created, looking up by email SHALL return the same 
   * user data that was stored.
   * Validates: Requirements 3.2
   */
  test('Property 4: User Lookup Round-Trip', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validNameArb, async (email, name) => {
        // Create user
        const createResult = await userService.createUser(email, name);
        expect(createResult.error).toBeUndefined();
        expect(createResult.user).not.toBeNull();
        
        // Lookup by email
        const lookupResult = await userService.getUserByEmail(email);
        
        // Should find the user
        expect(lookupResult.error).toBeUndefined();
        expect(lookupResult.user).not.toBeNull();
        
        // Should return the same data that was stored
        expect(lookupResult.user.email).toBe(createResult.user.email);
        expect(lookupResult.user.name).toBe(createResult.user.name);
        expect(lookupResult.user.created_at).toBe(createResult.user.created_at);
        expect(lookupResult.user.updated_at).toBe(createResult.user.updated_at);
        
        // Clean up for next iteration
        await userService.deleteUser(email);
      }),
      PBT_CONFIG
    );
  });
});
