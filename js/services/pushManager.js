/**
 * Web Push Notification Manager
 * Handles Service Worker registration and backend subscription.
 * 
 * Auth: Uses Supabase JWT (same as all other admin API calls).
 */
class PushNotificationManager {
    constructor() {
        this.vapidPublicKey = null;
        this.swRegistration = null;
    }

    /**
     * Get the current Supabase access token (JWT).
     * This is the same auth method used by all admin API calls.
     */
    async getAuthToken() {
        try {
            // window.spoonSupabase is the initialized client instance (created by config.js)
            // window.supabase is the CDN library/factory — do NOT use it
            const sb = window.spoonSupabase || window.getSupabaseClient?.();
            if (!sb) {
                console.warn('⚠️ PushManager: Supabase client not initialized yet');
                return null;
            }

            const { data: { session } } = await sb.auth.getSession();
            return session?.access_token || null;
        } catch (e) {
            console.warn('⚠️ PushManager: Could not get auth token', e);
            return null;
        }
    }

    async init() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('⚠️ Push notifications not supported');
            return;
        }

        try {
            // 1. Register Service Worker (scope covers entire site)
            this.swRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            console.log('✅ Service Worker registered');

            // 2. Fetch VAPID Key
            const response = await fetch('/api/push/key');
            if (!response.ok) {
                console.warn('⚠️ Could not fetch VAPID key:', response.status);
                return;
            }
            const { key } = await response.json();
            this.vapidPublicKey = key;

            // 3. If permission already granted, ensure subscription is synced
            if (Notification.permission === 'granted') {
                await this.subscribeUser();
            }

        } catch (error) {
            console.error('❌ Push init failed:', error);
        }
    }

    async requestPermission() {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            await this.subscribeUser();
            return true;
        }
        return false;
    }

    async subscribeUser() {
        if (!this.swRegistration || !this.vapidPublicKey) {
            console.warn('⚠️ PushManager: SW or VAPID key not ready');
            return;
        }

        try {
            // Get auth token (Supabase JWT)
            const token = await this.getAuthToken();
            if (!token) {
                console.warn('⚠️ PushManager: No auth token, cannot subscribe');
                return;
            }

            // Check if already subscribed
            let subscription = await this.swRegistration.pushManager.getSubscription();

            if (!subscription) {
                // Create new subscription
                subscription = await this.swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
                });
                console.log('🔔 New push subscription created');
            }

            // Send to backend with correct auth header
            const resp = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ subscription })
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                console.error('❌ Backend rejected subscription:', resp.status, err);
                return;
            }

            console.log('📡 Push subscription synced with backend');

        } catch (error) {
            console.error('❌ Failed to subscribe:', error);
        }
    }

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
}

window.pushManager = new PushNotificationManager();
// Auto-init after a short delay to ensure supabase client is ready
setTimeout(() => window.pushManager.init(), 2000);
