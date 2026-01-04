/**
 * ========================================
 * SPOON - FRONTEND CONFIGURATION
 * ========================================
 * 
 * PURPOSE:
 * Centralized configuration for all frontend JavaScript files.
 * This file fetches public configuration from the backend API.
 * 
 * SECURITY NOTE:
 * - Only PUBLIC keys are exposed here (Supabase anon key, Razorpay public key)
 * - These keys are safe to expose in frontend as they have limited permissions
 * - SECRET keys remain on the server only
 * 
 * USAGE:
 * 1. Include this script BEFORE other JS files in HTML
 * 2. Access config via window.SPOON_CONFIG
 * 3. Access Supabase client via window.spoonSupabase
 */

(function() {
  'use strict';

  // Default config (fallback if API fails)
  const DEFAULT_CONFIG = {
    API_BASE_URL: 'http://localhost:7070',
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    RAZORPAY_KEY_ID: ''
  };

  // Global config object
  window.SPOON_CONFIG = { ...DEFAULT_CONFIG };
  window.spoonSupabase = null;
  window.configLoaded = false;

  /**
   * FUNCTION: loadConfig
   * 
   * PURPOSE: Fetch public configuration from backend API
   * 
   * HOW IT WORKS:
   * 1. Calls /api/config endpoint on backend
   * 2. Stores config in window.SPOON_CONFIG
   * 3. Initializes Supabase client
   * 4. Returns promise that resolves when ready
   */
  async function loadConfig() {
    try {
      const response = await fetch(`${DEFAULT_CONFIG.API_BASE_URL}/api/config`);
      
      if (!response.ok) {
        throw new Error('Failed to load configuration');
      }

      const config = await response.json();
      
      // Merge with defaults
      window.SPOON_CONFIG = {
        ...DEFAULT_CONFIG,
        ...config
      };

      // Initialize Supabase client if credentials available
      if (window.SPOON_CONFIG.SUPABASE_URL && window.SPOON_CONFIG.SUPABASE_ANON_KEY) {
        if (window.supabase) {
          window.spoonSupabase = window.supabase.createClient(
            window.SPOON_CONFIG.SUPABASE_URL,
            window.SPOON_CONFIG.SUPABASE_ANON_KEY
          );
        }
      }

      window.configLoaded = true;
      console.log('✅ Configuration loaded successfully');
      
      // Dispatch event for scripts waiting on config
      window.dispatchEvent(new CustomEvent('spoon-config-loaded'));
      
      return window.SPOON_CONFIG;

    } catch (error) {
      console.error('❌ Failed to load configuration:', error.message);
      console.warn('⚠️ Using fallback configuration');
      
      // Dispatch event even on failure so scripts don't hang
      window.dispatchEvent(new CustomEvent('spoon-config-loaded', { detail: { error: true } }));
      
      throw error;
    }
  }

  /**
   * FUNCTION: waitForConfig
   * 
   * PURPOSE: Helper function for scripts to wait until config is loaded
   * 
   * USAGE:
   * await window.waitForConfig();
   * // Now safe to use window.SPOON_CONFIG and window.spoonSupabase
   */
  window.waitForConfig = function() {
    return new Promise((resolve) => {
      if (window.configLoaded) {
        resolve(window.SPOON_CONFIG);
      } else {
        window.addEventListener('spoon-config-loaded', () => {
          resolve(window.SPOON_CONFIG);
        }, { once: true });
      }
    });
  };

  /**
   * FUNCTION: getSupabaseClient
   * 
   * PURPOSE: Get the initialized Supabase client
   * 
   * RETURNS: Supabase client instance or null if not initialized
   */
  window.getSupabaseClient = function() {
    return window.spoonSupabase;
  };

  // Auto-load config when script loads
  loadConfig().catch(() => {
    // Error already logged, continue with fallback
  });

})();
