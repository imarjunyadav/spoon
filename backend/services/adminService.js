/**
 * Admin Service
 * 
 * Handles admin role verification and stock management.
 * Validates Supabase JWT tokens and checks admin status in the database.
 */

const { createClient } = require('@supabase/supabase-js');

// ========================================
// SUPABASE CLIENT INITIALIZATION
// ========================================

/**
 * Initialize Supabase client with service role key.
 * Service role key is required to bypass RLS for backend operations.
 * 
 * @returns {Object|null} Supabase client instance or null if config missing
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
 * Validate Supabase JWT and extract user info.
 * 
 * @param {string} token - Bearer token from Authorization header
 * @returns {Promise<{ user: { email: string } | null, error?: string }>} User object or error code
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
 * Check if a user has admin privileges.
 * 
 * @param {string} email - User's email (from validated token)
 * @returns {Promise<{ isAdmin: boolean, error?: string }>} Admin status or error
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
// STOCK MANAGEMENT
// ========================================

/**
 * Update menu item availability.
 * 
 * @param {string} itemId - UUID of the menu item
 * @param {boolean} isAvailable - New availability status
 * @returns {Promise<{ success: boolean, error?: string }>} Success status or error
 */
async function updateMenuItemStock(itemId, isAvailable) {
  try {
    // Get Supabase client
    const client = getClient();

    if (!client) {
      return { success: false, error: 'SERVICE_UNAVAILABLE' };
    }

    // Update the menu item's is_available field
    const { data, error } = await client
      .from('menu_items')
      .update({ is_available: isAvailable })
      .eq('id', itemId)
      .select();

    if (error) {
      console.error('Supabase updateMenuItemStock error:', error);
      return { success: false, error: 'DATABASE_ERROR' };
    }

    // Check if any row was updated (item exists)
    if (!data || data.length === 0) {
      return { success: false, error: 'NOT_FOUND' };
    }

    return { success: true };
  } catch (err) {
    console.error('AdminService updateMenuItemStock exception:', err);
    return { success: false, error: 'DATABASE_ERROR' };
  }
}

// ========================================
// UTILITY FUNCTIONS (for testing)
// ========================================

/**
 * Reset Supabase client (for testing purposes).
 */
function resetClient() {
  supabase = null;
}

/**
 * Set a custom Supabase client (for testing purposes).
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
  updateMenuItemStock,
  // Testing utilities
  resetClient,
  setClient
};
