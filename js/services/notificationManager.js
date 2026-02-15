/**
 * NotificationManager
 * Handles Smart Batching, Audio Alerts, and Multi-Tab Sync.
 * 
 * Audio Strategy: Pre-generates a "Ding-Dong" WAV blob and plays via <audio> element.
 * Unlike AudioContext oscillators, <audio> elements use the browser's media player
 * pathway which is NOT throttled in background tabs (same as Spotify/YouTube).
 */
class NotificationManager {
    constructor() {
        this.batchQueue = new Set(); // Stores unacknowledged Order IDs
        this.isRinging = false;
        this.alarmInterval = null;
        this.broadcastChannel = new BroadcastChannel('spoon_admin_alerts');
        this._soundBlobUrl = null;
        this._audioUnlocked = false;

        // Pre-generate the notification sound as a WAV blob
        this._generateSound();

        // Unlock audio on first user interaction (browser autoplay policy)
        const unlock = () => {
            this._audioUnlocked = true;
            // If orders arrived before user interacted, start alarm now
            if (this.batchQueue.size > 0 && !this.isRinging) {
                this.startAlarm();
            }
        };
        ['click', 'touchstart'].forEach(evt =>
            document.addEventListener(evt, unlock, { once: true, passive: true })
        );

        // Bind sync listener (same-browser cross-tab)
        this.broadcastChannel.onmessage = (event) => {
            if (event.data.type === 'ACKNOWLEDGE') {
                console.log('📡 Received remote acknowledgment');
                this.stopAlarm(false);
                this.batchQueue.clear();
                this.updateUI();
            }
        };

        // Resume alarm when tab becomes visible (background throttling recovery)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.batchQueue.size > 0 && !this.isRinging) {
                console.log('👁️ Tab visible: Resuming alarm loop');
                this.startAlarm();
            }
        });
    }

    /**
     * Pre-generate a "Ding-Dong" notification sound as a WAV blob URL.
     * Pure math synthesis — no external audio files needed.
     */
    _generateSound() {
        try {
            const sampleRate = 44100;
            const duration = 1.5;
            const numSamples = Math.floor(sampleRate * duration);
            const samples = new Int16Array(numSamples);

            let phase = 0;
            for (let i = 0; i < numSamples; i++) {
                const t = i / sampleRate;

                // Frequency: 880Hz "Ding" → 659Hz "Dong" over 0.15s, then hold
                const freq = t < 0.15
                    ? 880 * Math.pow(659 / 880, t / 0.15)
                    : 659;

                // Exponential fade out
                const amp = 0.4 * Math.exp(-t * 3.0);

                phase += (2 * Math.PI * freq) / sampleRate;
                samples[i] = Math.round(amp * Math.sin(phase) * 0x7FFF);
            }

            // Encode as WAV
            const dataSize = numSamples * 2;
            const buffer = new ArrayBuffer(44 + dataSize);
            const v = new DataView(buffer);
            let p = 0;

            const writeStr = (s) => { for (let i = 0; i < s.length; i++) v.setUint8(p++, s.charCodeAt(i)); };
            const write32 = (val) => { v.setUint32(p, val, true); p += 4; };
            const write16 = (val) => { v.setUint16(p, val, true); p += 2; };

            writeStr('RIFF');
            write32(36 + dataSize);
            writeStr('WAVE');
            writeStr('fmt ');
            write32(16);             // PCM chunk size
            write16(1);              // PCM format
            write16(1);              // Mono
            write32(sampleRate);
            write32(sampleRate * 2); // Byte rate
            write16(2);              // Block align
            write16(16);             // Bits per sample
            writeStr('data');
            write32(dataSize);

            for (let i = 0; i < numSamples; i++) {
                v.setInt16(p, samples[i], true);
                p += 2;
            }

            this._soundBlobUrl = URL.createObjectURL(
                new Blob([buffer], { type: 'audio/wav' })
            );

            console.log('🔊 Notification sound generated');
        } catch (e) {
            console.warn('Sound generation failed:', e);
        }
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
                this.stopAlarm(false);
            }
        }
    }

    /**
     * Start the looping alarm.
     */
    startAlarm() {
        if (this.isRinging) return;
        if (this.batchQueue.size === 0) return;
        if (!this._audioUnlocked) return; // Wait for user gesture

        this.isRinging = true;
        console.log('🔔 Starting Alarm Loop');

        // Play immediately
        this.playTone();
        this.triggerVibration();

        // Clear any existing interval
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
     * Stop the alarm.
     * @param {boolean} broadcast - Whether to notify other tabs
     */
    stopAlarm(broadcast = true) {
        this.isRinging = false;

        if (this.alarmInterval) {
            clearInterval(this.alarmInterval);
            this.alarmInterval = null;
        }

        if (navigator.vibrate) {
            try { navigator.vibrate(0); } catch (e) { }
        }

        if (broadcast) {
            this.broadcastChannel.postMessage({ type: 'ACKNOWLEDGE' });
        }
    }

    /**
     * Play the pre-generated "Ding-Dong" via HTML <audio> element.
     * This survives background tabs because browsers treat media elements
     * like music players (not throttled like AudioContext).
     */
    playTone() {
        if (!this._soundBlobUrl) return;
        try {
            const audio = new Audio(this._soundBlobUrl);
            audio.volume = 1.0;
            audio.play().catch(() => { }); // Silently fail if blocked
        } catch (e) { }
    }

    triggerVibration() {
        if (navigator.vibrate) {
            try { navigator.vibrate([200, 100, 200]); } catch (e) { }
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

        // 3. Sync Backend (triggers Realtime UPDATE → stops other admin devices)
        try {
            const { error } = await supabase
                .from('orders')
                .update({ is_acknowledged: true })
                .in('id', acknowledgedIds);

            if (error) throw error;
            console.log('✅ Acknowledged orders:', acknowledgedIds.length);

        } catch (err) {
            console.error('❌ Failed to acknowledge orders:', err);
        }
    }

    /**
     * Update the UI Modal.
     */
    updateUI() {
        const event = new CustomEvent('batch-update', {
            detail: {
                count: this.batchQueue.size,
                ids: Array.from(this.batchQueue)
            }
        });
        window.dispatchEvent(event);
    }
}

// Export singleton
window.notificationManager = new NotificationManager();
