/**
 * RealtimeSubscriptionManager
 * Manages Supabase Realtime subscriptions for the admin dashboard.
 * Handles subscription lifecycle, fallback polling, and cleanup.
 * 
 * Requirements: 5.2 - Track all active subscriptions in a manageable data structure
 */
const RealtimeSubscriptionManager = {
  // Track active channels by name (Requirements: 5.2)
  channels: {},
  
  // Track fallback polling intervals
  fallbackIntervals: {},
  
  // Connection state flag
  isConnected: true,
  
  // Reference to Supabase client
  _supabase: null,

  /**
   * Initialize the subscription manager with a Supabase client
   * @param {SupabaseClient} supabase - Initialized Supabase client
   */
  init(supabase) {
    this._supabase = supabase;
    this.channels = {};
    this.fallbackIntervals = {};
    this.isConnected = true;
  },

  /**
   * Subscribe to a specific table's changes
   * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2
   * 
   * @param {string} tableName - Table to subscribe to ('orders' | 'menu_items')
   * @param {Function} onChangeCallback - Function to call when data changes
   * @returns {RealtimeChannel|null} - The created channel or null if failed
   */
  subscribeToTable(tableName, onChangeCallback) {
    if (!this._supabase) {
      console.error('RealtimeSubscriptionManager: Supabase client not initialized');
      return null;
    }

    // Check for existing subscription to prevent duplicates (Requirements: 5.4)
    if (this.channels[tableName]) {
      console.warn(`RealtimeSubscriptionManager: Already subscribed to ${tableName}`);
      return this.channels[tableName];
    }

    const channelName = `realtime-${tableName}-${Date.now()}`;
    
    try {
      const channel = this._supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: tableName
          },
          (payload) => {
            console.log(`📥 INSERT on ${tableName}:`, payload);
            if (typeof onChangeCallback === 'function') {
              onChangeCallback(payload);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: tableName
          },
          (payload) => {
            console.log(`📝 UPDATE on ${tableName}:`, payload);
            if (typeof onChangeCallback === 'function') {
              onChangeCallback(payload);
            }
          }
        )
        .subscribe((status, err) => {
          console.log(`📡 Channel ${tableName} status:`, status);
          
          if (status === 'SUBSCRIBED') {
            this.isConnected = true;
            // Stop fallback polling if it was running (Requirements: 4.2)
            this.stopFallbackPolling(tableName);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Handle subscription errors (Requirements: 4.1, 4.3)
            console.error(`❌ Realtime subscription error for ${tableName}:`, err);
            this.isConnected = false;
            // Start fallback polling (Requirements: 4.1)
            this.startFallbackPolling(tableName, onChangeCallback);
          } else if (status === 'CLOSED') {
            console.log(`🔌 Channel ${tableName} closed`);
          }
        });

      // Track the channel (Requirements: 5.2)
      this.channels[tableName] = channel;
      
      return channel;
    } catch (error) {
      console.error(`❌ Error creating subscription for ${tableName}:`, error);
      return null;
    }
  },

  /**
   * Unsubscribe from a specific channel
   * @param {string} tableName - Name of table/channel to unsubscribe
   */
  unsubscribe(tableName) {
    const channel = this.channels[tableName];
    if (channel) {
      try {
        this._supabase.removeChannel(channel);
        delete this.channels[tableName];
        console.log(`🔌 Unsubscribed from ${tableName}`);
      } catch (error) {
        console.error(`❌ Error unsubscribing from ${tableName}:`, error);
      }
    }
    
    // Also stop any fallback polling
    this.stopFallbackPolling(tableName);
  },

  /**
   * Cleanup all subscriptions (called on page unload)
   * Requirements: 1.4, 2.3, 5.1
   */
  cleanup() {
    console.log('🧹 Cleaning up all Realtime subscriptions...');
    
    // Unsubscribe from all channels
    Object.keys(this.channels).forEach(tableName => {
      const channel = this.channels[tableName];
      if (channel && this._supabase) {
        try {
          this._supabase.removeChannel(channel);
        } catch (error) {
          console.error(`❌ Error removing channel ${tableName}:`, error);
        }
      }
    });
    
    // Clear all fallback polling intervals
    Object.keys(this.fallbackIntervals).forEach(tableName => {
      this.stopFallbackPolling(tableName);
    });
    
    // Reset state
    this.channels = {};
    this.fallbackIntervals = {};
    this.isConnected = false;
    
    console.log('✅ All subscriptions cleaned up');
  },

  /**
   * Start fallback polling for a table
   * Requirements: 4.1
   * 
   * @param {string} tableName - Table to poll
   * @param {Function} fetchFunction - Function to fetch data
   * @param {number} intervalMs - Polling interval (default: 30000)
   */
  startFallbackPolling(tableName, fetchFunction, intervalMs = 30000) {
    // Don't start if already polling
    if (this.fallbackIntervals[tableName]) {
      return;
    }
    
    console.log(`⏰ Starting fallback polling for ${tableName} (${intervalMs}ms interval)`);
    
    this.fallbackIntervals[tableName] = setInterval(() => {
      console.log(`🔄 Fallback poll for ${tableName}`);
      if (typeof fetchFunction === 'function') {
        fetchFunction();
      }
    }, intervalMs);
  },

  /**
   * Stop fallback polling for a table
   * Requirements: 4.2
   * 
   * @param {string} tableName - Table to stop polling
   */
  stopFallbackPolling(tableName) {
    if (this.fallbackIntervals[tableName]) {
      clearInterval(this.fallbackIntervals[tableName]);
      delete this.fallbackIntervals[tableName];
      console.log(`⏹️ Stopped fallback polling for ${tableName}`);
    }
  },

  /**
   * Get the count of active subscriptions
   * @returns {number} - Number of active subscriptions
   */
  getActiveSubscriptionCount() {
    return Object.keys(this.channels).length;
  },

  /**
   * Check if subscribed to a specific table
   * @param {string} tableName - Table name to check
   * @returns {boolean} - True if subscribed
   */
  isSubscribedTo(tableName) {
    return !!this.channels[tableName];
  }
};

// Export for Node.js/testing environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { RealtimeSubscriptionManager };
}
