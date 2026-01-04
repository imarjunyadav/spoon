/**
 * ========================================
 * HEALTH CHECK ROUTES
 * ========================================
 * 
 * PURPOSE:
 * Provides health check endpoint to verify service availability.
 * Checks Redis and Supabase connectivity.
 * 
 * REQUIREMENTS COVERED:
 * - 5.2: Expose health check endpoint that verifies Redis and Supabase connectivity
 * 
 * RESPONSE STATUS:
 * - healthy: All services are operational
 * - degraded: Some services are unavailable but system can partially function
 * - unhealthy: Critical services are down
 */

const express = require('express');
const router = express.Router();
const redisClient = require('../services/redisClient');
const { createClient } = require('@supabase/supabase-js');

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Check Redis connectivity
 * @returns {Promise<{ status: string, latency?: number, error?: string }>}
 */
async function checkRedis() {
  const start = Date.now();
  try {
    // Get client (creates it if not exists)
    const client = redisClient.getClient();
    
    // Wait a moment for connection if just created
    if (!redisClient.isConnected()) {
      // Give it up to 3 seconds to connect
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    if (!redisClient.isConnected()) {
      return { status: 'unhealthy', error: 'Not connected' };
    }
    
    const pingResult = await redisClient.ping();
    const latency = Date.now() - start;
    
    if (pingResult) {
      return { status: 'healthy', latency };
    }
    return { status: 'unhealthy', error: 'Ping failed' };
  } catch (err) {
    return { status: 'unhealthy', error: err.message };
  }
}

/**
 * Check Supabase connectivity
 * @returns {Promise<{ status: string, latency?: number, error?: string }>}
 */
async function checkSupabase() {
  const start = Date.now();
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return { status: 'unhealthy', error: 'Missing configuration' };
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // Simple query to check connectivity - just check if we can reach the database
    const { error } = await supabase.from('users').select('email', { count: 'exact', head: true }).limit(1);
    const latency = Date.now() - start;
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 is "no rows returned" which is fine for health check
      return { status: 'unhealthy', error: error.message };
    }
    
    return { status: 'healthy', latency };
  } catch (err) {
    return { status: 'unhealthy', error: err.message };
  }
}

/**
 * Determine overall system status based on service statuses
 * @param {object} redis - Redis health status
 * @param {object} supabase - Supabase health status
 * @returns {string} Overall status: healthy, degraded, or unhealthy
 */
function determineOverallStatus(redis, supabase) {
  const redisHealthy = redis.status === 'healthy';
  const supabaseHealthy = supabase.status === 'healthy';
  
  if (redisHealthy && supabaseHealthy) {
    return 'healthy';
  }
  
  // Redis is critical for OTP operations
  if (!redisHealthy) {
    return 'unhealthy';
  }
  
  // Supabase down but Redis up = degraded (can still do OTP, but not user persistence)
  if (!supabaseHealthy) {
    return 'degraded';
  }
  
  return 'unhealthy';
}

// ========================================
// ROUTES
// ========================================

/**
 * GET /api/health
 * 
 * Health check endpoint that verifies Redis and Supabase connectivity.
 * 
 * Response:
 * {
 *   "status": "healthy" | "degraded" | "unhealthy",
 *   "timestamp": "2024-01-01T00:00:00.000Z",
 *   "services": {
 *     "redis": { "status": "healthy", "latency": 5 },
 *     "supabase": { "status": "healthy", "latency": 50 }
 *   }
 * }
 */
router.get('/', async (req, res) => {
  try {
    // Check all services in parallel
    const [redisStatus, supabaseStatus] = await Promise.all([
      checkRedis(),
      checkSupabase()
    ]);
    
    const overallStatus = determineOverallStatus(redisStatus, supabaseStatus);
    
    const response = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        redis: redisStatus,
        supabase: supabaseStatus
      }
    };
    
    // Set appropriate HTTP status code
    let httpStatus = 200;
    if (overallStatus === 'degraded') {
      httpStatus = 200; // Still return 200 for degraded (system partially works)
    } else if (overallStatus === 'unhealthy') {
      httpStatus = 503;
    }
    
    res.status(httpStatus).json(response);
  } catch (err) {
    console.error('[Health] Error checking health:', err);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      services: {
        redis: { status: 'unknown' },
        supabase: { status: 'unknown' }
      }
    });
  }
});

module.exports = router;
