/**
 * Global Configuration
 * Centralizes application settings, environment variables, and constants.
 */

const Config = {
  // Supabase Configuration
  supabase: {
    url: 'https://mnvxojjbbiqmymlatigh.supabase.co',
    // Anon key is safe to expose on frontend
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1udnhvampiYmlxbXltbGF0aWdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzcwMjgsImV4cCI6MjA4MDc1MzAyOH0.pejckebDO7ieQlsbrlpqg3K6Xds5uBJCqkSJRaWubZE'
  },

  // Razorpay Configuration
  razorpay: {
    keyId: 'rzp_test_RzVKDlWgrurqra'
  },

  // API Endpoints
  api: {
    baseUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:7070'
      : 'https://spoon-backend-122591058801.asia-south1.run.app'
  }
};

(function () {
  'use strict';

  // Default config (fallback if API fails)
  const DEFAULT_CONFIG = {
    API_BASE_URL: '',
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    RAZORPAY_KEY_ID: '',
    features: {
      preorder: false,
      cancellation: false
    }
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
  window.waitForConfig = function () {
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
  window.getSupabaseClient = function () {
    return window.spoonSupabase;
  };

  // Auto-load config when script loads
  loadConfig().catch(() => {
    // Error already logged, continue with fallback
  });

})();
