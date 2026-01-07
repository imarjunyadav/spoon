/**
 * Tests for Admin Routes
 * 
 * Feature: admin-role-verification
 * 
 * This file contains:
 * 1. Unit tests for GET /api/admin/verify endpoint
 * 2. Property-based tests for correctness properties
 * 
 * Properties tested:
 * - Property 2: Invalid Token Rejection
 * - Property 6: Email Parameter Rejection
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.3
 */

const fc = require('fast-check');
const adminService = require('../services/adminService');

// Test configuration: minimum 100 iterations per property
const PBT_CONFIG = { numRuns: 100 };

// ========================================
// MOCK EXPRESS REQUEST/RESPONSE
// ========================================

/**
 * Create a mock Express request object
 */
function createMockRequest(options = {}) {
  return {
    headers: options.headers || {},
    query: options.query || {},
    body: options.body || {}
  };
}

/**
 * Create a mock Express response object
 */
function createMockResponse() {
  const res = {
    statusCode: 200,
    jsonData: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
}

// ========================================
// IMPORT ROUTE HANDLER
// ========================================

// We need to extract the route handler for testing
const adminRouter = require('./admin');

// Get the verify handler from the router stack
function getVerifyHandler() {
  // Find the GET /verify route in the router stack
  const layer = adminRouter.stack.find(
    layer => layer.route && layer.route.path === '/verify' && layer.route.methods.get
  );
  if (!layer) {
    throw new Error('Could not find GET /verify route handler');
  }
  return layer.route.stack[0].handle;
}

// ========================================
// UNIT TESTS
// ========================================

describe('Admin Routes Unit Tests', () => {
  let verifyHandler;

  beforeAll(() => {
    verifyHandler = getVerifyHandler();
  });

  beforeEach(() => {
    // Reset the admin service client before each test
    adminService.resetClient();
  });

  describe('GET /api/admin/verify', () => {
    
    test('returns 401 when no Authorization header is provided', async () => {
      const req = createMockRequest({
        headers: {}
      });
      const res = createMockResponse();

      await verifyHandler(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error).toBe('UNAUTHORIZED');
      expect(res.jsonData.message).toBe('No authorization token provided');
    });

    test('returns 401 when Authorization header is not Bearer format', async () => {
      const req = createMockRequest({
        headers: { authorization: 'Basic abc123' }
      });
      const res = createMockResponse();

      await verifyHandler(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error).toBe('INVALID_TOKEN');
      expect(res.jsonData.message).toBe('Invalid authorization token format');
    });

    test('returns 401 when token is invalid', async () => {
      // Mock adminService to return INVALID_TOKEN
      const mockClient = {
        auth: {
          getUser: async () => ({
            data: null,
            error: { message: 'Invalid token' }
          })
        }
      };
      adminService.setClient(mockClient);

      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' }
      });
      const res = createMockResponse();

      await verifyHandler(req, res);

      expect(res.statusCode).toBe(401);
      expect(res.jsonData.error).toBe('INVALID_TOKEN');
      expect(res.jsonData.message).toBe('Token expired or invalid');
    });

    test('returns 200 with isAdmin: true for admin user', async () => {
      // Mock adminService for valid token and admin user
      const mockClient = {
        auth: {
          getUser: async () => ({
            data: { user: { email: 'admin@example.com' } },
            error: null
          })
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { is_admin: true },
                error: null
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-admin-token' }
      });
      const res = createMockResponse();

      await verifyHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.isAdmin).toBe(true);
    });

    test('returns 200 with isAdmin: false for non-admin user', async () => {
      // Mock adminService for valid token and non-admin user
      const mockClient = {
        auth: {
          getUser: async () => ({
            data: { user: { email: 'user@example.com' } },
            error: null
          })
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { is_admin: false },
                error: null
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-user-token' }
      });
      const res = createMockResponse();

      await verifyHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.isAdmin).toBe(false);
    });

    test('returns 200 with isAdmin: false for non-existent user', async () => {
      // Mock adminService for valid token but user not in database
      const mockClient = {
        auth: {
          getUser: async () => ({
            data: { user: { email: 'newuser@example.com' } },
            error: null
          })
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: null,
                error: { code: 'PGRST116', message: 'no rows' }
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token-new-user' }
      });
      const res = createMockResponse();

      await verifyHandler(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.isAdmin).toBe(false);
    });

    test('ignores email query parameter (security)', async () => {
      // Mock adminService - token email is user@example.com (non-admin)
      // but query param tries to check admin@example.com
      let queriedEmail = null;
      
      const mockClient = {
        auth: {
          getUser: async () => ({
            data: { user: { email: 'user@example.com' } },
            error: null
          })
        },
        from: () => ({
          select: () => ({
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

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
        query: { email: 'admin@example.com' } // Should be ignored
      });
      const res = createMockResponse();

      await verifyHandler(req, res);

      // Should use email from token, not query param
      expect(queriedEmail).toBe('user@example.com');
      expect(res.statusCode).toBe(200);
      expect(res.jsonData.isAdmin).toBe(false);
    });

    test('ignores email in request body (security)', async () => {
      // Mock adminService - token email is user@example.com (non-admin)
      // but body tries to check admin@example.com
      let queriedEmail = null;
      
      const mockClient = {
        auth: {
          getUser: async () => ({
            data: { user: { email: 'user@example.com' } },
            error: null
          })
        },
        from: () => ({
          select: () => ({
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

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token' },
        body: { email: 'admin@example.com' } // Should be ignored
      });
      const res = createMockResponse();

      await verifyHandler(req, res);

      // Should use email from token, not body
      expect(queriedEmail).toBe('user@example.com');
      expect(res.statusCode).toBe(200);
      expect(res.jsonData.isAdmin).toBe(false);
    });

    test('returns 500 when database error occurs', async () => {
      // Mock adminService for valid token but database error
      const mockClient = {
        auth: {
          getUser: async () => ({
            data: { user: { email: 'user@example.com' } },
            error: null
          })
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: null,
                error: { code: 'CONNECTION_ERROR', message: 'Database unavailable' }
              })
            })
          })
        })
      };
      adminService.setClient(mockClient);

      const req = createMockRequest({
        headers: { authorization: 'Bearer valid-token' }
      });
      const res = createMockResponse();

      await verifyHandler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData.error).toBe('DATABASE_ERROR');
    });

    test('returns 500 when Supabase service is unavailable', async () => {
      // Reset client to simulate service unavailable
      adminService.resetClient();

      const req = createMockRequest({
        headers: { authorization: 'Bearer some-token' }
      });
      const res = createMockResponse();

      await verifyHandler(req, res);

      expect(res.statusCode).toBe(500);
      expect(res.jsonData.error).toBe('SERVICE_UNAVAILABLE');
    });
  });
});


// ========================================
// PROPERTY-BASED TESTS
// ========================================

describe('Admin Routes Property-Based Tests', () => {
  let verifyHandler;

  beforeAll(() => {
    verifyHandler = getVerifyHandler();
  });

  // Note: We don't use beforeEach to reset the client here because
  // property-based tests run multiple iterations within a single test,
  // and each iteration sets up its own mock client.

  /**
   * Feature: admin-role-verification, Property 2: Invalid Token Rejection
   * For any request to /api/admin/verify with a missing, malformed, or expired token,
   * the response SHALL be 401 Unauthorized.
   * Validates: Requirements 2.4, 5.3
   */
  describe('Property 2: Invalid Token Rejection', () => {
    
    // Set up mock client that rejects all tokens as invalid
    // This must be set before each test to ensure consistent behavior
    function setupInvalidTokenMock() {
      const mockClient = {
        auth: {
          getUser: async () => ({
            data: null,
            error: { message: 'Invalid token' }
          })
        }
      };
      adminService.setClient(mockClient);
    }

    test('Empty tokens return 401', () => {
      fc.assert(
        fc.asyncProperty(
          fc.constantFrom('', ' ', '  ', '\t', '\n', '\r\n'),
          async (emptyToken) => {
            setupInvalidTokenMock();
            
            const req = createMockRequest({
              headers: { authorization: `Bearer ${emptyToken}` }
            });
            const res = createMockResponse();

            await verifyHandler(req, res);

            expect(res.statusCode).toBe(401);
            expect(['UNAUTHORIZED', 'INVALID_TOKEN', 'NO_TOKEN']).toContain(res.jsonData.error);
          }
        ),
        PBT_CONFIG
      );
    });

    test('Random string tokens return 401', () => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 500 }),
          async (randomToken) => {
            setupInvalidTokenMock();
            
            const req = createMockRequest({
              headers: { authorization: `Bearer ${randomToken}` }
            });
            const res = createMockResponse();

            await verifyHandler(req, res);

            expect(res.statusCode).toBe(401);
            expect(['UNAUTHORIZED', 'INVALID_TOKEN', 'NO_TOKEN']).toContain(res.jsonData.error);
          }
        ),
        PBT_CONFIG
      );
    });

    test('Malformed JWT-like tokens return 401', () => {
      // Generate tokens that look like JWTs but are invalid
      const malformedJwtArb = fc.tuple(
        fc.base64String({ minLength: 10, maxLength: 50 }),
        fc.base64String({ minLength: 10, maxLength: 50 }),
        fc.base64String({ minLength: 10, maxLength: 50 })
      ).map(([header, payload, signature]) => `${header}.${payload}.${signature}`);

      fc.assert(
        fc.asyncProperty(malformedJwtArb, async (malformedJwt) => {
          setupInvalidTokenMock();
          
          const req = createMockRequest({
            headers: { authorization: `Bearer ${malformedJwt}` }
          });
          const res = createMockResponse();

          await verifyHandler(req, res);

          expect(res.statusCode).toBe(401);
          expect(['UNAUTHORIZED', 'INVALID_TOKEN', 'NO_TOKEN']).toContain(res.jsonData.error);
        }),
        PBT_CONFIG
      );
    });

    test('Missing Authorization header returns 401', () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            'content-type': fc.constant('application/json'),
            'accept': fc.constant('*/*')
          }),
          async (headers) => {
            setupInvalidTokenMock();
            
            const req = createMockRequest({ headers });
            const res = createMockResponse();

            await verifyHandler(req, res);

            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('UNAUTHORIZED');
          }
        ),
        PBT_CONFIG
      );
    });

    test('Non-Bearer authorization schemes return 401', () => {
      const nonBearerSchemes = fc.constantFrom(
        'Basic', 'Digest', 'HOBA', 'Mutual', 'Negotiate', 
        'OAuth', 'SCRAM-SHA-1', 'SCRAM-SHA-256', 'vapid'
      );

      fc.assert(
        fc.asyncProperty(
          nonBearerSchemes,
          fc.base64String({ minLength: 10, maxLength: 50 }),
          async (scheme, credentials) => {
            setupInvalidTokenMock();
            
            const req = createMockRequest({
              headers: { authorization: `${scheme} ${credentials}` }
            });
            const res = createMockResponse();

            await verifyHandler(req, res);

            expect(res.statusCode).toBe(401);
            expect(res.jsonData.error).toBe('INVALID_TOKEN');
          }
        ),
        PBT_CONFIG
      );
    });
  });

  /**
   * Feature: admin-role-verification, Property 6: Email Parameter Rejection
   * For any request to /api/admin/verify that includes an email in query parameters 
   * or request body, the endpoint SHALL ignore these parameters and only use the 
   * email extracted from the validated JWT token.
   * Validates: Requirements 2.2, 2.3
   */
  describe('Property 6: Email Parameter Rejection', () => {
    
    // Reset client before each test to ensure clean state
    beforeEach(() => {
      adminService.resetClient();
    });
    
    /**
     * Helper to create a mock client that tracks which email is queried
     * Returns a fresh mock client for each call to avoid shared state issues
     */
    function createTrackingMockClient(tokenEmail, isAdmin) {
      const emailTracker = { queriedEmail: null };
      const mockClient = {
        auth: {
          getUser: async () => ({
            data: { user: { email: tokenEmail } },
            error: null
          })
        },
        from: () => ({
          select: () => ({
            eq: (field, value) => {
              emailTracker.queriedEmail = value;
              return {
                single: async () => ({
                  data: { is_admin: isAdmin },
                  error: null
                })
              };
            }
          })
        })
      };
      return { mockClient, emailTracker };
    }

    test('Email in query params is ignored - only token email is used', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(), // Token email (the real one)
          fc.emailAddress(), // Query param email (should be ignored)
          fc.boolean(),      // Is the token user an admin?
          async (tokenEmail, queryEmail, isAdmin) => {
            // Skip if emails are the same (can't distinguish)
            if (tokenEmail.toLowerCase() === queryEmail.toLowerCase()) {
              return true;
            }
            
            // Reset client first, then set up fresh mock client for this iteration
            adminService.resetClient();
            const { mockClient, emailTracker } = createTrackingMockClient(tokenEmail, isAdmin);
            adminService.setClient(mockClient);
            
            const req = createMockRequest({
              headers: { authorization: 'Bearer valid-token' },
              query: { email: queryEmail }
            });
            const res = createMockResponse();

            await verifyHandler(req, res);

            // The queried email should be from the token, not the query param
            expect(emailTracker.queriedEmail).toBe(tokenEmail.toLowerCase().trim());
            expect(emailTracker.queriedEmail).not.toBe(queryEmail.toLowerCase().trim());
            expect(res.statusCode).toBe(200);
            expect(res.jsonData.isAdmin).toBe(isAdmin);
          }
        ),
        PBT_CONFIG
      );
    });

    test('Email in request body is ignored - only token email is used', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(), // Token email (the real one)
          fc.emailAddress(), // Body email (should be ignored)
          fc.boolean(),      // Is the token user an admin?
          async (tokenEmail, bodyEmail, isAdmin) => {
            // Skip if emails are the same (can't distinguish)
            if (tokenEmail.toLowerCase() === bodyEmail.toLowerCase()) {
              return true;
            }
            
            // Reset client first, then set up fresh mock client for this iteration
            adminService.resetClient();
            const { mockClient, emailTracker } = createTrackingMockClient(tokenEmail, isAdmin);
            adminService.setClient(mockClient);
            
            const req = createMockRequest({
              headers: { authorization: 'Bearer valid-token' },
              body: { email: bodyEmail }
            });
            const res = createMockResponse();

            await verifyHandler(req, res);

            // The queried email should be from the token, not the body
            expect(emailTracker.queriedEmail).toBe(tokenEmail.toLowerCase().trim());
            expect(emailTracker.queriedEmail).not.toBe(bodyEmail.toLowerCase().trim());
            expect(res.statusCode).toBe(200);
            expect(res.jsonData.isAdmin).toBe(isAdmin);
          }
        ),
        PBT_CONFIG
      );
    });

    test('Email in both query and body is ignored - only token email is used', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(), // Token email (the real one)
          fc.emailAddress(), // Query param email (should be ignored)
          fc.emailAddress(), // Body email (should be ignored)
          fc.boolean(),      // Is the token user an admin?
          async (tokenEmail, queryEmail, bodyEmail, isAdmin) => {
            // Skip if any emails are the same (can't distinguish)
            const normalizedToken = tokenEmail.toLowerCase();
            const normalizedQuery = queryEmail.toLowerCase();
            const normalizedBody = bodyEmail.toLowerCase();
            
            if (normalizedToken === normalizedQuery || 
                normalizedToken === normalizedBody) {
              return true;
            }
            
            // Reset client first, then set up fresh mock client for this iteration
            adminService.resetClient();
            const { mockClient, emailTracker } = createTrackingMockClient(tokenEmail, isAdmin);
            adminService.setClient(mockClient);
            
            const req = createMockRequest({
              headers: { authorization: 'Bearer valid-token' },
              query: { email: queryEmail },
              body: { email: bodyEmail }
            });
            const res = createMockResponse();

            await verifyHandler(req, res);

            // The queried email should be from the token only
            expect(emailTracker.queriedEmail).toBe(tokenEmail.toLowerCase().trim());
            expect(emailTracker.queriedEmail).not.toBe(normalizedQuery);
            expect(emailTracker.queriedEmail).not.toBe(normalizedBody);
            expect(res.statusCode).toBe(200);
            expect(res.jsonData.isAdmin).toBe(isAdmin);
          }
        ),
        PBT_CONFIG
      );
    });

    test('Attacker cannot check admin status of arbitrary users via params', async () => {
      // This test specifically validates the security requirement:
      // An attacker with a valid non-admin token cannot check if other users are admins
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(), // Attacker's email (from their token)
          fc.emailAddress(), // Target admin email (attacker wants to check)
          async (attackerEmail, targetAdminEmail) => {
            // Skip if emails are the same
            if (attackerEmail.toLowerCase() === targetAdminEmail.toLowerCase()) {
              return true;
            }
            
            // Reset client first, then set up fresh mock client for this iteration
            // Mock: attacker is NOT admin
            adminService.resetClient();
            const { mockClient, emailTracker } = createTrackingMockClient(attackerEmail, false);
            adminService.setClient(mockClient);
            
            // Attacker tries to check target's admin status
            const req = createMockRequest({
              headers: { authorization: 'Bearer attacker-token' },
              query: { email: targetAdminEmail },
              body: { email: targetAdminEmail }
            });
            const res = createMockResponse();

            await verifyHandler(req, res);

            // Should query attacker's email, not target's
            expect(emailTracker.queriedEmail).toBe(attackerEmail.toLowerCase().trim());
            // Should return attacker's status (false), not target's (true)
            expect(res.jsonData.isAdmin).toBe(false);
          }
        ),
        PBT_CONFIG
      );
    });
  });
});