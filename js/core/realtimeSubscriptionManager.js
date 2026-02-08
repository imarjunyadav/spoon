/**
 * RealtimeSubscriptionManager
 * Manages Supabase Realtime subscriptions for the admin dashboard.
 * Handles subscription lifecycle, fallback polling, and cleanup.
 */
const RealtimeSubscriptionManager = {
  // Track active channels by name
  channels: {},

  // Track fallback polling intervals
  fallbackIntervals: {},

  // Connection state flag
  isConnected: true,

  // Reference to Supabase client
  _supabase: null,

  // State change callback
  _onStateChange: null,

  /**
   * Initialize the subscription manager with a Supabase client
   * @param {SupabaseClient} supabase - Initialized Supabase client
   */
  init(supabase) {
    this._supabase = supabase;
    this.channels = {};
    this.fallbackIntervals = {};
    this.isConnected = true;
    this._onStateChange = null;
  },

  /**
   * Set callback for connection state changes
   * @param {Function} callback - Function to call with state ('realtime' | 'polling' | 'disconnected')
   */
  onStateChange(callback) {
    this._onStateChange = callback;
  },

  /**
   * Notify state change to registered callback
   * @param {string} state - 'realtime' | 'polling' | 'disconnected'
   */
  _notifyStateChange(state) {
    if (typeof this._onStateChange === 'function') {
      this._onStateChange(state);
    }
  },

  /**
   * Get current connection state
   * @returns {string} - 'realtime' | 'polling' | 'disconnected'
   */
  getConnectionState() {
    if (this.isConnected) {
      return 'realtime';
    }
    // Check if any fallback polling is active
    if (Object.keys(this.fallbackIntervals).length > 0) {
      return 'polling';
    }
    return 'disconnected';
  },

  /**
   * Subscribe to a specific table's changes
   * 
   * @param {string} tableName - Table to subscribe to ('orders' | 'menu_items')
   * @param {Function} onChangeCallback - Function to call when data changes
   * @param {Function} [pollCallback] - Optional function to call for fallback polling (defaults to onChangeCallback)
   * @returns {RealtimeChannel|null} - The created channel or null if failed
   */
  subscribeToTable(tableName, onChangeCallback, pollCallback) {
    if (!this._supabase) {
      console.error('RealtimeSubscriptionManager: Supabase client not initialized');
      return null;
    }

    // Check for existing subscription to prevent duplicates
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
            // Stop fallback polling if it was running
            this.stopFallbackPolling(tableName);
            // Notify state change
            this._notifyStateChange('realtime');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Handle subscription errors
            console.error(`❌ Realtime subscription error for ${tableName}:`, err);
            this.isConnected = false;
            // Start fallback polling
            this.startFallbackPolling(tableName, pollCallback || onChangeCallback);
            // Notify state change
            this._notifyStateChange('polling');
          } else if (status === 'CLOSED') {
            console.log(`🔌 Channel ${tableName} closed`);
            // Check if all channels are closed
            const activeChannels = Object.keys(this.channels).filter(
              name => name !== tableName
            );
            if (activeChannels.length === 0) {
              this.isConnected = false;
              this._notifyStateChange('disconnected');
            }
          }
        });

      // Track the channel
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
   * unsubscribing from all channels and clearing intervals
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

    // Notify disconnected state
    this._notifyStateChange('disconnected');

    console.log('✅ All subscriptions cleaned up');
  },

  /**
   * Start fallback polling when realtime fails
   * 
   * @param {string} tableName - Table to poll
   * @param {Function} callback - Function to call on poll
   */
  startFallbackPolling(tableName, callback) {
    // Prevent duplicate polling intervals
    if (this.fallbackIntervals[tableName]) {
      return;
    }

    console.log(`🔄 Starting fallback polling for ${tableName} (30s interval)`);
    this.isConnected = false;
    this._notifyStateChange('polling');

    // Immediate fetch to ensure data freshness
    if (typeof callback === 'function') {
      callback();
    }

    // Start polling every 30 seconds
    this.fallbackIntervals[tableName] = setInterval(() => {
      console.log(`🔄 Fallback poll for ${tableName}`);
      if (typeof callback === 'function') {
        callback();
      }
    }, 30000); // 30 seconds
  },

  /**
   * Stop fallback polling for a table
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
