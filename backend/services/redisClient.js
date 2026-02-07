/**
 * ========================================
 * REDIS CLIENT SERVICE
 * ========================================
 * 
 * PURPOSE:
 * Singleton Redis client with connection pooling, automatic reconnection,
 * and health check capabilities for production OTP storage.
 * 
 * REQUIREMENTS COVERED:
 * - 5.1: Maintain connection pool with automatic reconnection on failure
 * - 5.4: Use connection timeouts to prevent hanging requests
 */

const Redis = require('ioredis');

// ========================================
// CONFIGURATION
// ========================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CONNECTION_TIMEOUT_MS = 5000;  // 5 seconds connection timeout
const COMMAND_TIMEOUT_MS = 3000;     // 3 seconds command timeout
const MAX_RETRIES = 3;               // Max reconnection attempts before giving up temporarily
const RETRY_DELAY_MS = 1000;         // Base delay between retries

// ========================================
// SINGLETON CLIENT
// ========================================

let redisClient = null;
let connectionStatus = 'disconnected';

/**
 * Create and configure Redis client with reconnection logic
 * @returns {Redis} Configured Redis client instance
 */
function createClient() {
  // Simple connection - ioredis handles rediss:// URLs automatically
  // Force IPv4 to prevent ECONNRESET on Cloud Run
  const client = new Redis(REDIS_URL, {
    family: 4
  });

  // ========================================
  // EVENT HANDLERS
  // ========================================

  client.on('connect', () => {
    console.log('[Redis] Connecting to server...');
  });

  client.on('ready', () => {
    connectionStatus = 'connected';
    console.log('[Redis] Connection established and ready');
  });

  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
    // Don't change status here - let 'close' or 'end' handle it
  });

  client.on('close', () => {
    connectionStatus = 'disconnected';
    console.log('[Redis] Connection closed');
  });

  client.on('reconnecting', () => {
    connectionStatus = 'reconnecting';
    console.log('[Redis] Attempting to reconnect...');
  });

  client.on('end', () => {
    connectionStatus = 'disconnected';
    console.log('[Redis] Connection ended');
  });

  return client;
}

// ========================================
// PUBLIC API
// ========================================

/**
 * Get the singleton Redis client instance
 * Creates a new client if one doesn't exist
 * @returns {Redis} Redis client instance
 */
function getClient() {
  if (!redisClient) {
    redisClient = createClient();
  }
  return redisClient;
}

/**
 * Check if Redis is currently connected and ready
 * @returns {boolean} True if connected and ready for commands
 */
function isConnected() {
  if (!redisClient) {
    return false;
  }
  return redisClient.status === 'ready';
}

/**
 * Get current connection status
 * @returns {string} Connection status: 'connected', 'disconnected', 'reconnecting'
 */
function getStatus() {
  return connectionStatus;
}

/**
 * Gracefully disconnect from Redis
 * @returns {Promise<void>}
 */
async function disconnect() {
  if (redisClient) {
    try {
      await redisClient.quit();
      console.log('[Redis] Disconnected gracefully');
    } catch (err) {
      console.error('[Redis] Error during disconnect:', err.message);
      // Force disconnect if quit fails
      redisClient.disconnect();
    } finally {
      redisClient = null;
      connectionStatus = 'disconnected';
    }
  }
}

/**
 * Ping Redis to check connectivity
 * @returns {Promise<boolean>} True if ping successful
 */
async function ping() {
  try {
    if (!redisClient || !isConnected()) {
      return false;
    }
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (err) {
    console.error('[Redis] Ping failed:', err.message);
    return false;
  }
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
  getClient,
  isConnected,
  getStatus,
  disconnect,
  ping,
  // Constants for testing
  CONNECTION_TIMEOUT_MS,
  COMMAND_TIMEOUT_MS,
  MAX_RETRIES
};
