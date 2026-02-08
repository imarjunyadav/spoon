/**
 * Spoon - Public Configuration API
 * 
 * Serves public configuration to the frontend at GET /api/config.
 * Only exposes keys that are safe for client-side use.
 */

const express = require('express');
const router = express.Router();

/**
 * Return public configuration for frontend.
 * 
 * Method: GET
 * Path: /api/config
 * 
 * Security:
 * - Only PUBLIC keys are returned
 * - Secret keys are never exposed
 */
router.get('/', (req, res) => {
  // Only expose public/safe configuration
  const publicConfig = {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || '',
    API_BASE_URL: '' // Use relative path for production
  };

  // Validate that required config exists
  if (!publicConfig.SUPABASE_URL || !publicConfig.SUPABASE_ANON_KEY) {
    console.warn('⚠️ Missing Supabase configuration in environment variables');
  }

  if (!publicConfig.RAZORPAY_KEY_ID) {
    console.warn('⚠️ Missing Razorpay KEY_ID in environment variables');
  }

  res.json(publicConfig);
});

module.exports = router;
