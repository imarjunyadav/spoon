/**
 * ========================================
 * SPOON - PUBLIC CONFIGURATION API
 * ========================================
 * 
 * PURPOSE:
 * Serves public configuration to the frontend.
 * Only exposes keys that are safe for client-side use.
 * 
 * SECURITY NOTE:
 * - Supabase ANON_KEY is designed to be public (has RLS restrictions)
 * - Razorpay KEY_ID is the public key (not the secret)
 * - NEVER expose: SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_SECRET, SMTP_PASSWORD
 */

const express = require('express');
const router = express.Router();

/**
 * ENDPOINT: GET /api/config
 * 
 * PURPOSE: Return public configuration for frontend
 * 
 * RESPONSE:
 * {
 *   "SUPABASE_URL": "https://xxx.supabase.co",
 *   "SUPABASE_ANON_KEY": "eyJ...",
 *   "RAZORPAY_KEY_ID": "rzp_test_xxx",
 *   "API_BASE_URL": "http://localhost:7070"
 * }
 * 
 * SECURITY:
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
