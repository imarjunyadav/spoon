/**
 * NotificationManager
 * Handles Smart Batching, Audio Alerts, and Multi-Tab Sync.
 */
class NotificationManager {
    constructor() {
        this.batchQueue = new Set(); // Stores unacknowledged Order IDs
        this.isRinging = false;
        this.alarmInterval = null;
        this.broadcastChannel = new BroadcastChannel('spoon_admin_alerts');

        // Audio Context for synthetic "Ding-Dong" (Zero assets/latency)
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // Bind sync listener
        this.broadcastChannel.onmessage = (event) => {
            if (event.data.type === 'ACKNOWLEDGE') {
                console.log('📡 Received remote acknowledgment');
                this.stopAlarm(false); // Stop globally, but don't re-broadcast
                this.batchQueue.clear();
                this.updateUI();
            }
        };

        // Handle Background Throttling (Resume alarm when tab becomes visible)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.batchQueue.size > 0 && !this.isRinging) {
                console.log('👁️ Tab visible: Resuming alarm loop');
                this.startAlarm();
            }
        });
    }

    /**
     * Add new orders to the batch.
     * @param {Array|Object} orders - Single order object or array of orders
     */
    enqueue(orders) {
        const ordersArray = Array.isArray(orders) ? orders : [orders];
        let hasNew = false;

        ordersArray.forEach(order => {
            if (!this.batchQueue.has(order.id)) {
                this.batchQueue.add(order.id);
                hasNew = true;
            }
        });

        if (hasNew) {
            this.updateUI();
            if (!this.isRinging) {
                this.startAlarm();
            }
        }
    }

    /**
     * Remove specific orders from the batch (e.g., remote ack or status change).
     * @param {Array|string} orderIds - Array of IDs or single ID
     */
    remove(orderIds) {
        const idsToRemove = Array.isArray(orderIds) ? orderIds : [orderIds];
        let changed = false;

        idsToRemove.forEach(id => {
            if (this.batchQueue.has(id)) {
                this.batchQueue.delete(id);
                changed = true;
            }
        });

        if (changed) {
            this.updateUI();
            if (this.batchQueue.size === 0) {
                this.stopAlarm(false); // Stop locally, no need to broadcast if it came from remote
            }
        }
    }

    /**
     * Start the looping alarm and vibration.
     */
    async startAlarm() {
        if (this.isRinging) return;

        // Double check queue is not empty before starting
        if (this.batchQueue.size === 0) return;

        this.isRinging = true;

        console.log('🔔 Starting Alarm Loop');

        // Ensure AudioContext is resumed (browser autoplay policy)
        if (this.audioCtx.state === 'suspended') {
            try {
                await this.audioCtx.resume();
            } catch (e) {
                console.warn('AudioContext resume failed (waiting for interaction):', e);
            }
        }

        // Play immediately
        this.playTone();
        this.triggerVibration();

        // Clear any existing interval just in case
        if (this.alarmInterval) clearInterval(this.alarmInterval);

        // Loop every 3 seconds
        this.alarmInterval = setInterval(() => {
            if (this.batchQueue.size === 0) {
                this.stopAlarm(false);
                return;
            }
            this.playTone();
            this.triggerVibration();
        }, 3000);
    }

    /**
     * Stop the alarm and clear batch.
     * @param {boolean} broadcast - Whether to notify other tabs
     */
    stopAlarm(broadcast = true) {
        this.isRinging = false;

        if (this.alarmInterval) {
            clearInterval(this.alarmInterval);
            this.alarmInterval = null;
        }

        // Stop vibration explicitly
        if (navigator.vibrate) {
            try { navigator.vibrate(0); } catch (e) { }
        }

        if (broadcast) {
            this.broadcastChannel.postMessage({ type: 'ACKNOWLEDGE' });
        }
    }

    /**
     * Synthesize a pleasant "Ding-Dong" notification sound.
     * 880Hz (A5) -> 659Hz (E5)
     */
    playTone() {
        if (this.audioCtx.state === 'suspended') return; // Can't play yet

        const now = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        // "Ding" (Higher pitch)
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.1, now);

        // "Dong" (Lower pitch) after 0.1s
        osc.frequency.exponentialRampToValueAtTime(659, now + 0.1);

        // Fade out
        gain.gain.exponentialRampToValueAtTime(0.00001, now + 1.5);

        osc.start(now);
        osc.stop(now + 1.5);
    }

    triggerVibration() {
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]); // SOS-like pattern
        }
    }

    /**
     * User clicked "Got It".
     */
    async acknowledge() {
        if (this.batchQueue.size === 0) return;

        const acknowledgedIds = Array.from(this.batchQueue);

        // 1. Stop Loop (Optimistic UI)
        this.stopAlarm(true);

        // 2. Clear Queue
        this.batchQueue.clear();
        this.updateUI();

        // 3. Sync Backend
        try {
            const { error } = await supabase
                .from('orders')
                .update({ is_acknowledged: true })
                .in('id', acknowledgedIds);

            if (error) throw error;
            console.log('✅ Acknowledged orders:', acknowledgedIds.length);

        } catch (err) {
            console.error('❌ Failed to acknowledge orders:', err);
            // Optional: Add retry logic or re-enqueue? 
            // Current Decision: Keep silent to avoid "Ghost Alarm". 
            // They will re-appear on next reload if write failed.
        }
    }

    /**
     * Update the UI Modal content.
     * This function should be overridden or listened to by the main app.
     */
    updateUI() {
        // Dispatch custom event for admin-mobile.js to handle DOM updates
        const event = new CustomEvent('batch-update', {
            detail: { count: this.batchQueue.size, ids: Array.from(this.batchQueue) }
        });
        window.dispatchEvent(event);
    }
}

// Export singleton
window.notificationManager = new NotificationManager();
