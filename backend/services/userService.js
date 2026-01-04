/**
 * ========================================
 * USER SERVICE
 * ========================================
 * 
 * PURPOSE:
 * Manages user records in Supabase database.
 * Handles user creation, lookup, and existence checks.
 * 
 * REQUIREMENTS COVERED:
 * - 3.1: Create user record in Supabase users table on signup
 * - 3.2: Return user record from Supabase when verifying OTP for existing email
 * - 3.3: Use email as unique identifier for user records
 * - 3.4: Return appropriate error response on database operation failure
 * 
 * SCHEMA (from migration 001_create_users_table.sql):
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
 * Initialize Supabase client with service role key
 * Service role key bypasses RLS for backend operations
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
 * Normalize email for consistent storage and lookup
 * @param {string} email - User's email address
 * @returns {string} Normalized email (lowercase, trimmed)
 */
function normalizeEmail(email) {
  return email.toLowerCase().trim();
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ========================================
// USER OPERATIONS
// ========================================

/**
 * Create a new user in Supabase
 * @param {string} email - User's email address (unique identifier)
 * @param {string} name - User's display name
 * @returns {Promise<{ user: object|null, error?: string }>} Created user or error
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
        name: name.trim()
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
 * Get user by email from Supabase
 * @param {string} email - User's email address
 * @returns {Promise<{ user: object|null, error?: string }>} User record or null if not found
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
 * Check if a user exists by email
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
 * Delete a user by email (for testing purposes)
 * @param {string} email - User's email address
 * @returns {Promise<{ success: boolean, error?: string }>}
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
 * Reset Supabase client (for testing purposes)
 * Allows re-initialization with different credentials
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
