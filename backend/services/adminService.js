/**
 * ========================================
 * ADMIN SERVICE
 * ========================================
 * 
 * PURPOSE:
 * Handles admin role verification for the Spoon application.
 * Validates Supabase JWT tokens and checks admin status in database.
 * 
 * REQUIREMENTS COVERED:
 * - 1.3: Query is_admin column to determine admin status
 * - 2.5: Return { isAdmin: false } for non-admin users
 * - 2.6: Return { isAdmin: true } for admin users
 * - 5.2: Validate token using Supabase's getUser() method
 * - 5.3: Return 401 for expired or invalid tokens
 * - 5.4: Extract user's email from validated token
 */

const { createClient } = require('@supabase/supabase-js');

// ========================================
// SUPABASE CLIENT INITIALIZATION
// ========================================

/**
 * Initialize Supabase client with service role key
 * Service role key bypasses RLS for backend operations
 */
let supabase = null;

function getClient() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return null;
    }
    
    supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  
  return supabase;
}

// ========================================
// TOKEN VALIDATION
// ========================================

/**
 * Validate Supabase JWT and extract user info
 * @param {string} token - Bearer token from Authorization header
 * @returns {Promise<{ user: { email: string } | null, error?: string }>}
 * 
 * Error codes:
 * - 'NO_TOKEN': No token provided
 * - 'INVALID_TOKEN': Token format invalid or expired
 * - 'SERVICE_UNAVAILABLE': Supabase client not initialized
 */
async function validateToken(token) {
  try {
    // Check for missing token
    if (!token || typeof token !== 'string') {
      return { user: null, error: 'NO_TOKEN' };
    }
    
    // Trim whitespace
    const trimmedToken = token.trim();
    
    // Check for empty token after trim
    if (trimmedToken.length === 0) {
      return { user: null, error: 'NO_TOKEN' };
    }
    
    // Get Supabase client
    const client = getClient();
    
    if (!client) {
      return { user: null, error: 'SERVICE_UNAVAILABLE' };
    }
    
    // Validate token using Supabase getUser()
    const { data, error } = await client.auth.getUser(trimmedToken);
    
    if (error) {
      // Token is invalid or expired
      return { user: null, error: 'INVALID_TOKEN' };
    }
    
    if (!data || !data.user || !data.user.email) {
      return { user: null, error: 'INVALID_TOKEN' };
    }
    
    // Return user email from validated token
    return { user: { email: data.user.email } };
  } catch (err) {
    console.error('AdminService validateToken exception:', err);
    return { user: null, error: 'SERVICE_UNAVAILABLE' };
  }
}

// ========================================
// ADMIN STATUS CHECK
// ========================================

/**
 * Check if a user has admin privileges
 * @param {string} email - User's email (from validated token)
 * @returns {Promise<{ isAdmin: boolean, error?: string }>}
 * 
 * Error codes:
 * - 'DATABASE_ERROR': Database query failed
 * - 'SERVICE_UNAVAILABLE': Supabase client not initialized
 * 
 * Note: Returns { isAdmin: false } for non-existent users (graceful handling)
 */
async function isUserAdmin(email) {
  try {
    // Validate input
    if (!email || typeof email !== 'string') {
      return { isAdmin: false };
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    if (normalizedEmail.length === 0) {
      return { isAdmin: false };
    }
    
    // Get Supabase client
    const client = getClient();
    
    if (!client) {
      return { isAdmin: false, error: 'SERVICE_UNAVAILABLE' };
    }
    
    // Query users table for is_admin status
    const { data, error } = await client
      .from('users')
      .select('is_admin')
      .eq('email', normalizedEmail)
      .single();
    
    if (error) {
      // PGRST116 = no rows returned (user not found)
      // Return isAdmin: false for non-existent users (graceful)
      if (error.code === 'PGRST116') {
        return { isAdmin: false };
      }
      
      console.error('Supabase isUserAdmin error:', error);
      return { isAdmin: false, error: 'DATABASE_ERROR' };
    }
    
    // Return admin status from database
    // Handle null/undefined is_admin as false
    return { isAdmin: data.is_admin === true };
  } catch (err) {
    console.error('AdminService isUserAdmin exception:', err);
    return { isAdmin: false, error: 'SERVICE_UNAVAILABLE' };
  }
}

// ========================================
// UTILITY FUNCTIONS (for testing)
// ========================================

/**
 * Reset Supabase client (for testing purposes)
 * Allows re-initialization with different credentials
 */
function resetClient() {
  supabase = null;
}

/**
 * Set a custom Supabase client (for testing purposes)
 * @param {object} client - Custom Supabase client
 */
function setClient(client) {
  supabase = client;
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  validateToken,
  isUserAdmin,
  // Testing utilities
  resetClient,
  setClient
};
