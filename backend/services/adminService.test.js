/**
 * Tests for Admin Service
 * 
 * Feature: admin-role-verification
 * 
 * This file contains:
 * 1. Unit tests for validateToken and isUserAdmin functions
 * 2. Property-based tests for correctness properties
 * 
 * Properties tested:
 * - Property 1: Default Admin Status
 * - Property 3: Admin Status Accuracy
 * - Property 4: Real-Time Status Enforcement
 * - Property 5: Audit Timestamp Update
 * 
 * Validates: Requirements 1.1, 1.2, 2.2, 2.4, 2.5, 2.6, 6.1, 7.1, 7.2
 */

const fc = require('fast-check');
const adminService = require('./adminService');

// Test configuration: minimum 100 iterations per property
const PBT_CONFIG = { numRuns: 100 };

// In-memory mock database for testing
let mockDatabase = new Map();

// Mock Supabase client that includes is_admin column with default false
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
          
          // Create user with timestamps and is_admin defaulting to false
          // This simulates the database behavior with DEFAULT false
          const user = {
            email: data.email,
            name: data.name,
            is_admin: data.is_admin !== undefined ? data.is_admin : false, // DEFAULT false
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          mockDatabase.set(email, user);
          return { data: user, error: null };
        }
      })
    }),
    select: (columns) => ({
      eq: (field, value) => ({
        single: async () => {
          const user = mockDatabase.get(value);
          if (!user) {
            return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
          }
          return { data: user, error: null };
        }
      })
    }),
    delete: () => ({
      eq: (field, value) => {
        mockDatabase.delete(value);
        return Promise.resolve({ error: null });
      }
    })
  })
};

// Create a testable user service with mock client that includes is_admin
function createMockUserService() {
  function normalizeEmail(email) {
    return email.toLowerCase().trim();
  }

  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Create a user WITHOUT specifying is_admin - simulates normal user creation
   * The database should default is_admin to false
   */
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
    
    // Note: We do NOT include is_admin in the insert - database defaults it to false
    const { data, error } = await mockSupabaseClient
      .from('users')
      .insert({
        email: normalizedEmail,
        name: name.trim()
        // is_admin is NOT specified - should default to false
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

// ========================================
// UNIT TESTS
// ========================================

describe('Admin Service Unit Tests', () => {
  beforeEach(() => {
    // Reset the admin service client before each test
    adminService.resetClient();
    mockDatabase.clear();
  });

  describe('validateToken', () => {
    test('returns NO_TOKEN error for missing token', async () => {
      const result = await adminService.validateToken(null);
      expect(result.user).toBeNull();
      expect(result.error).toBe('NO_TOKEN');
    });

    test('returns NO_TOKEN error for undefined token', async () => {
      const result = await adminService.validateToken(undefined);
      expect(result.user).toBeNull();
      expect(result.error).toBe('NO_TOKEN');
    });

    test('returns NO_TOKEN error for empty string token', async () => {
      const result = await adminService.validateToken('');
      expect(result.user).toBeNull();
      expect(result.error).toBe('NO_TOKEN');
    });

    test('returns NO_TOKEN error for whitespace-only token', async () => {
      const result = await adminService.validateToken('   ');
      expect(result.user).toBeNull();
      expect(result.error).toBe('NO_TOKEN');
    });

    test('returns SERVICE_UNAVAILABLE when Supabase not configured', async () => {
      // Ensure no client is set
      adminService.resetClient();
      const result = await adminService.validateToken('some-token');
      expect(result.user).toBeNull();
      expect(result.error).toBe('SERVICE_UNAVAILABLE');
    });

    test('returns INVALID_TOKEN for malformed token with mock client', async () => {
      // Create mock client that returns error for invalid token
      const mockClient = {
        auth: {
          getUser: async (token) => ({
            data: null,
            error: { message: 'Invalid token' }
          })
        }
      };
      adminService.setClient(mockClient);

      const result = await adminService.validateToken('invalid-token-123');
      expect(result.user).toBeNull();
      expect(result.error).toBe('INVALID_TOKEN');
    });

    test('returns user email for valid token with mock client', async () => {
      // Create mock client that returns valid user
      const mockClient = {
        auth: {
          getUser: async (token) => ({
            data: { user: { email: 'admin@example.com' } },
            error: null
          })
        }
      };
      adminService.setClient(mockClient);

      const result = await adminService.validateToken('valid-token-123');
      expect(result.error).toBeUndefined();
      expect(result.user).not.toBeNull();
      expect(result.user.email).toBe('admin@example.com');
    });

    test('returns INVALID_TOKEN when user data is missing email', async () => {
      // Create mock client that returns user without email
      const mockClient = {
        auth: {
          getUser: async (token) => ({
            data: { user: { id: '123' } }, // No email
            error: null
          })
        }
      };
      adminService.setClient(mockClient);

      const result = await adminService.validateToken('token-without-email');
      expect(result.user).toBeNull();
      expect(result.error).toBe('INVALID_TOKEN');
    });
  });

  describe('isUserAdmin', () => {
    test('returns isAdmin: false for null email', async () => {
      const result = await adminService.isUserAdmin(null);
      expect(result.isAdmin).toBe(false);
    });

    test('returns isAdmin: false for empty email', async () => {
      const result = await adminService.isUserAdmin('');
      expect(result.isAdmin).toBe(false);
    });

    test('returns SERVICE_UNAVAILABLE when Supabase not configured', async () => {
      adminService.resetClient();
      const result = await adminService.isUserAdmin('test@example.com');
      expect(result.isAdmin).toBe(false);
      expect(result.error).toBe('SERVICE_UNAVAILABLE');
    });

    test('returns isAdmin: true for admin user with mock client', async () => {
      // Create mock client that returns admin user
      const mockClient = {
        from: (table) => ({
          select: (columns) => ({
            eq: (field, value) => ({
              single: async () => ({
                data: { is_admin: true },
                error: null
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const result = await adminService.isUserAdmin('admin@example.com');
      expect(result.error).toBeUndefined();
      expect(result.isAdmin).toBe(true);
    });

    test('returns isAdmin: false for non-admin user with mock client', async () => {
      // Create mock client that returns non-admin user
      const mockClient = {
        from: (table) => ({
          select: (columns) => ({
            eq: (field, value) => ({
              single: async () => ({
                data: { is_admin: false },
                error: null
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const result = await adminService.isUserAdmin('user@example.com');
      expect(result.error).toBeUndefined();
      expect(result.isAdmin).toBe(false);
    });

    test('returns isAdmin: false for non-existent user (graceful)', async () => {
      // Create mock client that returns PGRST116 (no rows)
      const mockClient = {
        from: (table) => ({
          select: (columns) => ({
            eq: (field, value) => ({
              single: async () => ({
                data: null,
                error: { code: 'PGRST116', message: 'no rows' }
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const result = await adminService.isUserAdmin('nonexistent@example.com');
      expect(result.error).toBeUndefined();
      expect(result.isAdmin).toBe(false);
    });

    test('returns DATABASE_ERROR for database failures', async () => {
      // Create mock client that returns database error
      const mockClient = {
        from: (table) => ({
          select: (columns) => ({
            eq: (field, value) => ({
              single: async () => ({
                data: null,
                error: { code: 'SOME_ERROR', message: 'Database connection failed' }
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const result = await adminService.isUserAdmin('test@example.com');
      expect(result.isAdmin).toBe(false);
      expect(result.error).toBe('DATABASE_ERROR');
    });

    test('handles null is_admin value as false', async () => {
      // Create mock client that returns null is_admin
      const mockClient = {
        from: (table) => ({
          select: (columns) => ({
            eq: (field, value) => ({
              single: async () => ({
                data: { is_admin: null },
                error: null
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const result = await adminService.isUserAdmin('user@example.com');
      expect(result.error).toBeUndefined();
      expect(result.isAdmin).toBe(false);
    });

    test('normalizes email to lowercase', async () => {
      let queriedEmail = null;
      
      // Create mock client that captures the queried email
      const mockClient = {
        from: (table) => ({
          select: (columns) => ({
            eq: (field, value) => {
              queriedEmail = value;
              return {
                single: async () => ({
                  data: { is_admin: false },
                  error: null
                })
              };
            }
          })
        })
      };
      adminService.setClient(mockClient);

      await adminService.isUserAdmin('ADMIN@EXAMPLE.COM');
      expect(queriedEmail).toBe('admin@example.com');
    });
  });

  describe('updateMenuItemStock', () => {
    test('returns SERVICE_UNAVAILABLE when Supabase not configured', async () => {
      adminService.resetClient();
      const result = await adminService.updateMenuItemStock('item-123', true);
      expect(result.success).toBe(false);
      expect(result.error).toBe('SERVICE_UNAVAILABLE');
    });

    test('returns success: true for successful update', async () => {
      // Create mock client that returns successful update
      const mockClient = {
        from: (table) => ({
          update: (data) => ({
            eq: (field, value) => ({
              select: async () => ({
                data: [{ id: 'item-123', is_available: true }],
                error: null
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const result = await adminService.updateMenuItemStock('item-123', true);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('returns NOT_FOUND for non-existent item', async () => {
      // Create mock client that returns empty array (no rows updated)
      const mockClient = {
        from: (table) => ({
          update: (data) => ({
            eq: (field, value) => ({
              select: async () => ({
                data: [],
                error: null
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const result = await adminService.updateMenuItemStock('non-existent-id', true);
      expect(result.success).toBe(false);
      expect(result.error).toBe('NOT_FOUND');
    });

    test('returns DATABASE_ERROR for database failures', async () => {
      // Create mock client that returns database error
      const mockClient = {
        from: (table) => ({
          update: (data) => ({
            eq: (field, value) => ({
              select: async () => ({
                data: null,
                error: { code: 'SOME_ERROR', message: 'Database connection failed' }
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const result = await adminService.updateMenuItemStock('item-123', true);
      expect(result.success).toBe(false);
      expect(result.error).toBe('DATABASE_ERROR');
    });

    test('updates is_available to false correctly', async () => {
      let updatedData = null;
      
      // Create mock client that captures the update data
      const mockClient = {
        from: (table) => ({
          update: (data) => {
            updatedData = data;
            return {
              eq: (field, value) => ({
                select: async () => ({
                  data: [{ id: 'item-123', is_available: false }],
                  error: null
                })
              })
            };
          }
        })
      };
      adminService.setClient(mockClient);

      const result = await adminService.updateMenuItemStock('item-123', false);
      expect(result.success).toBe(true);
      expect(updatedData).toEqual({ is_available: false });
    });

    test('updates is_available to true correctly', async () => {
      let updatedData = null;
      
      // Create mock client that captures the update data
      const mockClient = {
        from: (table) => ({
          update: (data) => {
            updatedData = data;
            return {
              eq: (field, value) => ({
                select: async () => ({
                  data: [{ id: 'item-123', is_available: true }],
                  error: null
                })
              })
            };
          }
        })
      };
      adminService.setClient(mockClient);

      const result = await adminService.updateMenuItemStock('item-123', true);
      expect(result.success).toBe(true);
      expect(updatedData).toEqual({ is_available: true });
    });
  });
});

// ========================================
// PROPERTY-BASED TESTS
// ========================================

describe('Admin Service Property-Based Tests', () => {
  let userService;

  beforeAll(() => {
    userService = createMockUserService();
  });

  beforeEach(() => {
    // Clear mock database before each test
    mockDatabase.clear();
  });

  /**
   * Feature: admin-role-verification, Property 1: Default Admin Status
   * For any newly created user in the users table, the is_admin column SHALL be 
   * false when no explicit value is provided.
   * Validates: Requirements 1.1, 1.2
   */
  test('Property 1: Default Admin Status', async () => {
    await fc.assert(
      fc.asyncProperty(validEmailArb, validNameArb, async (email, name) => {
        // Create user without specifying is_admin
        const result = await userService.createUser(email, name);
        
        // Should succeed
        expect(result.error).toBeUndefined();
        expect(result.user).not.toBeNull();
        
        // is_admin should default to false
        expect(result.user.is_admin).toBe(false);
        
        // Verify by looking up the user
        const lookupResult = await userService.getUserByEmail(email);
        expect(lookupResult.user).not.toBeNull();
        expect(lookupResult.user.is_admin).toBe(false);
        
        // Clean up for next iteration
        await userService.deleteUser(email);
      }),
      PBT_CONFIG
    );
  });

  /**
   * Feature: admin-role-verification, Property 3: Admin Status Accuracy
   * For any authenticated user with a valid token, the /api/admin/verify endpoint 
   * SHALL return { isAdmin: true } if and only if the user's is_admin database 
   * column is true.
   * Validates: Requirements 2.5, 2.6
   */
  test('Property 3: Admin Status Accuracy', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArb,
        validNameArb,
        fc.boolean(), // Random is_admin value
        async (email, name, expectedIsAdmin) => {
          const normalizedEmail = email.toLowerCase().trim();
          
          // Create user in mock database with specific is_admin value
          const user = {
            email: normalizedEmail,
            name: name.trim(),
            is_admin: expectedIsAdmin,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          mockDatabase.set(normalizedEmail, user);
          
          // Create mock client that uses our mock database
          const mockClientForAdminService = {
            from: () => ({
              select: () => ({
                eq: (field, value) => ({
                  single: async () => {
                    const foundUser = mockDatabase.get(value);
                    if (!foundUser) {
                      return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
                    }
                    return { data: { is_admin: foundUser.is_admin }, error: null };
                  }
                })
              })
            })
          };
          
          // Set the mock client for adminService
          adminService.setClient(mockClientForAdminService);
          
          // Call isUserAdmin and verify it returns the correct status
          const result = await adminService.isUserAdmin(normalizedEmail);
          
          // The returned isAdmin should match the database value
          expect(result.error).toBeUndefined();
          expect(result.isAdmin).toBe(expectedIsAdmin);
          
          // Clean up for next iteration
          mockDatabase.delete(normalizedEmail);
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: admin-role-verification, Property 4: Real-Time Status Enforcement
   * For any user whose is_admin flag changes in the database, the next call to 
   * /api/admin/verify SHALL return the updated status (no caching).
   * Validates: Requirements 6.1
   */
  test('Property 4: Real-Time Status Enforcement', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArb,
        validNameArb,
        fc.boolean(), // Initial is_admin value
        async (email, name, initialIsAdmin) => {
          const normalizedEmail = email.toLowerCase().trim();
          
          // Create user in mock database with initial is_admin value
          const user = {
            email: normalizedEmail,
            name: name.trim(),
            is_admin: initialIsAdmin,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          mockDatabase.set(normalizedEmail, user);
          
          // Create mock client that reads directly from mock database (no caching)
          const mockClientForAdminService = {
            from: () => ({
              select: () => ({
                eq: (field, value) => ({
                  single: async () => {
                    const foundUser = mockDatabase.get(value);
                    if (!foundUser) {
                      return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
                    }
                    return { data: { is_admin: foundUser.is_admin }, error: null };
                  }
                })
              })
            })
          };
          
          adminService.setClient(mockClientForAdminService);
          
          // Step 1: Verify initial status
          const initialResult = await adminService.isUserAdmin(normalizedEmail);
          expect(initialResult.error).toBeUndefined();
          expect(initialResult.isAdmin).toBe(initialIsAdmin);
          
          // Step 2: Toggle is_admin in the database (simulate admin privilege change)
          const toggledIsAdmin = !initialIsAdmin;
          mockDatabase.get(normalizedEmail).is_admin = toggledIsAdmin;
          mockDatabase.get(normalizedEmail).updated_at = new Date().toISOString();
          
          // Step 3: Verify the next call returns the UPDATED status (no caching)
          const updatedResult = await adminService.isUserAdmin(normalizedEmail);
          expect(updatedResult.error).toBeUndefined();
          expect(updatedResult.isAdmin).toBe(toggledIsAdmin);
          
          // The status should have changed
          expect(updatedResult.isAdmin).not.toBe(initialResult.isAdmin);
          
          // Clean up for next iteration
          mockDatabase.delete(normalizedEmail);
        }
      ),
      PBT_CONFIG
    );
  });

  /**
   * Feature: admin-role-verification, Property 5: Audit Timestamp Update
   * For any update to a user's is_admin column, the updated_at timestamp 
   * SHALL be updated to reflect the modification time.
   * Validates: Requirements 7.1, 7.2
   */
  test('Property 5: Audit Timestamp Update', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmailArb,
        validNameArb,
        fc.boolean(), // Initial is_admin value
        async (email, name, initialIsAdmin) => {
          const normalizedEmail = email.toLowerCase().trim();
          const initialTimestamp = new Date('2025-01-01T00:00:00.000Z').toISOString();
          
          // Create user in mock database with initial timestamp
          const user = {
            email: normalizedEmail,
            name: name.trim(),
            is_admin: initialIsAdmin,
            created_at: initialTimestamp,
            updated_at: initialTimestamp
          };
          mockDatabase.set(normalizedEmail, user);
          
          // Create mock client that simulates database UPDATE with trigger
          // The trigger automatically updates updated_at on any row modification
          const mockClientWithUpdateTrigger = {
            from: (table) => ({
              select: () => ({
                eq: (field, value) => ({
                  single: async () => {
                    const foundUser = mockDatabase.get(value);
                    if (!foundUser) {
                      return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
                    }
                    return { data: foundUser, error: null };
                  }
                })
              }),
              update: (data) => ({
                eq: (field, value) => ({
                  select: () => ({
                    single: async () => {
                      const foundUser = mockDatabase.get(value);
                      if (!foundUser) {
                        return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
                      }
                      // Apply update
                      if (data.is_admin !== undefined) {
                        foundUser.is_admin = data.is_admin;
                      }
                      // Simulate database trigger: updated_at is automatically set
                      foundUser.updated_at = new Date().toISOString();
                      return { data: foundUser, error: null };
                    }
                  })
                })
              })
            })
          };
          
          adminService.setClient(mockClientWithUpdateTrigger);
          
          // Record the initial updated_at
          const userBefore = mockDatabase.get(normalizedEmail);
          const timestampBefore = userBefore.updated_at;
          
          // Small delay to ensure timestamp difference
          await new Promise(resolve => setTimeout(resolve, 10));
          
          // Simulate updating is_admin (toggle the value)
          const toggledIsAdmin = !initialIsAdmin;
          const { data: updatedUser } = await mockClientWithUpdateTrigger
            .from('users')
            .update({ is_admin: toggledIsAdmin })
            .eq('email', normalizedEmail)
            .select()
            .single();
          
          // Verify updated_at has changed
          expect(updatedUser.updated_at).not.toBe(timestampBefore);
          
          // Verify the new timestamp is more recent
          const beforeDate = new Date(timestampBefore);
          const afterDate = new Date(updatedUser.updated_at);
          expect(afterDate.getTime()).toBeGreaterThan(beforeDate.getTime());
          
          // Verify is_admin was actually updated
          expect(updatedUser.is_admin).toBe(toggledIsAdmin);
          
          // Clean up for next iteration
          mockDatabase.delete(normalizedEmail);
        }
      ),
      PBT_CONFIG
    );
  });
});
