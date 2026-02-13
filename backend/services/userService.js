/**
 * User Service
 * 
 * Manages user records in the Supabase database.
 * Handles user creation, lookup, and existence checks.
 * 
 * Schema:
 * - email: TEXT PRIMARY KEY
 * - name: TEXT NOT NULL
 * - created_at: TIMESTAMPTZ DEFAULT NOW()
 * - updated_at: TIMESTAMPTZ DEFAULT NOW()
 */

const { createClient } = require('@supabase/supabase-js');

// ========================================
// SUPABASE CLIENT INITIALIZATION
// ========================================

/**
 * Initialize Supabase client with service role key.
 * Service role key is required to bypass RLS for backend operations.
 * 
 * @returns {Object} Supabase client instance
 * @throws {Error} If configuration is missing
 */
let supabase = null;

function getClient() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase configuration: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
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
// HELPER FUNCTIONS
// ========================================

/**
 * Normalize email for consistent storage and lookup.
 * 
 * @param {string} email - User's email address
 * @returns {string} Normalized email (lowercase, trimmed)
 */
function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

/**
 * Validate email format.
 * 
 * @param {string} email - Email to validate
 * @returns {boolean} True if email format is valid
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ========================================
// USER OPERATIONS
// ========================================

/**
 * Create a new user in Supabase.
 * 
 * @param {string} email - User's email address (unique identifier)
 * @param {string} name - User's display name
 * @returns {Promise<{ user: object|null, error?: string }>} Created user object or error code
 */
async function createUser(email, name) {
  try {
    // Validate inputs
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

    const client = getClient();

    const { data, error } = await client
      .from('users')
      .insert({
        email: normalizedEmail,
        name: name.trim(),
        active_session_token: arguments[2] || null, // Optional 3rd arg: sessionToken
        session_created_at: arguments[2] ? new Date().toISOString() : null
      })
      .select()
      .single();

    if (error) {
      // Handle duplicate email (unique constraint violation)
      if (error.code === '23505') {
        return { user: null, error: 'USER_EXISTS' };
      }

      // Log error for debugging
      console.error('Supabase createUser error:', error);
      return { user: null, error: 'DATABASE_ERROR' };
    }

    return { user: data };
  } catch (err) {
    console.error('UserService createUser exception:', err);
    return { user: null, error: 'SERVICE_UNAVAILABLE' };
  }
}

/**
 * Get user by email from Supabase.
 * 
 * @param {string} email - User's email address
 * @returns {Promise<{ user: object|null, error?: string }>} User object or null if not found
 */
async function getUserByEmail(email) {
  try {
    // Validate input
    if (!email || typeof email !== 'string') {
      return { user: null, error: 'INVALID_EMAIL' };
    }

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return { user: null, error: 'INVALID_EMAIL' };
    }

    const client = getClient();

    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .single();

    if (error) {
      // PGRST116 = no rows returned (not found)
      if (error.code === 'PGRST116') {
        return { user: null };
      }

      console.error('Supabase getUserByEmail error:', error);
      return { user: null, error: 'DATABASE_ERROR' };
    }

    return { user: data };
  } catch (err) {
    console.error('UserService getUserByEmail exception:', err);
    return { user: null, error: 'SERVICE_UNAVAILABLE' };
  }
}

/**
 * Check if a user exists by email.
 * 
 * @param {string} email - User's email address
 * @returns {Promise<boolean>} True if user exists, false otherwise
 */
async function userExists(email) {
  try {
    if (!email || typeof email !== 'string') {
      return false;
    }

    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return false;
    }

    const client = getClient();

    const { count, error } = await client
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('email', normalizedEmail);

    if (error) {
      console.error('Supabase userExists error:', error);
      return false;
    }

    return count > 0;
  } catch (err) {
    console.error('UserService userExists exception:', err);
    return false;
  }
}

// ========================================
// UTILITY FUNCTIONS (for testing)
// ========================================

/**
 * Delete a user by email (for testing purposes).
 * 
 * @param {string} email - User's email address
 * @returns {Promise<{ success: boolean, error?: string }>} Success status or error
 */
async function deleteUser(email) {
  try {
    if (!email || typeof email !== 'string') {
      return { success: false, error: 'INVALID_EMAIL' };
    }

    const normalizedEmail = normalizeEmail(email);
    const client = getClient();

    const { error } = await client
      .from('users')
      .delete()
      .eq('email', normalizedEmail);

    if (error) {
      console.error('Supabase deleteUser error:', error);
      return { success: false, error: 'DATABASE_ERROR' };
    }

    return { success: true };
  } catch (err) {
    console.error('UserService deleteUser exception:', err);
    return { success: false, error: 'SERVICE_UNAVAILABLE' };
  }
}

/**
 * Reset Supabase client (for testing purposes).
 */
function resetClient() {
  supabase = null;
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  createUser,
  getUserByEmail,
  userExists,
  // Testing utilities
  deleteUser,
  resetClient,
  // Helper functions (exported for testing)
  normalizeEmail,
  isValidEmail
};

// ========================================
// SESSION MANAGEMENT
// ========================================

/**
 * Update active session token for a user.
 * Now supports role-based tokens (Admin vs App).
 * 
 * @param {string} email - User email
 * @param {string} sessionToken - New session token
 * @param {string} type - Session type: 'app' (default) or 'admin'
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function updateSession(email, sessionToken, type = 'app') {
  try {
    if (!email || !sessionToken) {
      return { success: false, error: 'INVALID_INPUT' };
    }

    const normalizedEmail = normalizeEmail(email);
    const client = getClient();

    // Determine column based on type
    const tokenColumn = type === 'admin' ? 'admin_session_token' : 'active_session_token';

    // Construct update object
    const updates = {
      session_created_at: new Date().toISOString()
    };
    updates[tokenColumn] = sessionToken;

    const { data, error } = await client
      .from('users')
      .update(updates)
      .eq('email', normalizedEmail)
      .select();

    if (error) {
      console.error('Supabase updateSession error:', error);
      return { success: false, error: 'DATABASE_ERROR' };
    }

    if (!data || data.length === 0) {
      console.warn(`updateSession: User not found for ${normalizedEmail}`);
      return { success: false, error: 'USER_NOT_FOUND' };
    }

    return { success: true };

  } catch (err) {
    console.error('UserService updateSession exception:', err);
    return { success: false, error: 'SERVICE_UNAVAILABLE' };
  }
}

/**
 * Validate a session token against the database.
 * 
 * @param {string} email - User's email
 * @param {string} sessionToken - Token to validate
 * @param {string} type - Session type: 'app' (default) or 'admin'
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
async function validateSession(email, sessionToken, type = 'app') {
  try {
    if (!email || !sessionToken) {
      return { valid: false };
    }

    const normalizedEmail = normalizeEmail(email);
    const client = getClient();

    // Determine column based on type
    const tokenColumn = type === 'admin' ? 'admin_session_token' : 'active_session_token';

    const { data, error } = await client
      .from('users')
      .select(tokenColumn)
      .eq('email', normalizedEmail)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return { valid: false }; // User not found
      console.error('Supabase validateSession error:', error);
      return { valid: false, error: 'DATABASE_ERROR' };
    }

    // Check if tokens match
    const storedToken = data[tokenColumn];
    const isValid = storedToken === sessionToken;
    return { valid: isValid };

  } catch (err) {
    console.error('UserService validateSession exception:', err);
    return { valid: false, error: 'SERVICE_UNAVAILABLE' };
  }
}

module.exports = {
  createUser,
  getUserByEmail,
  userExists,
  updateSession,
  validateSession,
  // Testing utilities
  deleteUser,
  resetClient,
  // Helper functions (exported for testing)
  normalizeEmail,
  isValidEmail
};
