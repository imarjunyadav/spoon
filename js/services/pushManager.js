/**
 * Web Push Notification Manager
 * Handles Service Worker registration and backend subscription.
 */
class PushNotificationManager {
    constructor() {
        this.vapidPublicKey = null;
        this.swRegistration = null;
    }

    async init() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.warn('⚠️ Push notifications not supported');
            return;
        }

        try {
            // 1. Register Service Worker
            this.swRegistration = await navigator.serviceWorker.register('/sw.js');
            console.log('✅ Service Worker registered');

            // 2. Fetch VAPID Key
            const response = await fetch('/api/push/key');
            if (!response.ok) return;
            const { key } = await response.json();
            this.vapidPublicKey = key;

            // 3. Check current permission
            if (Notification.permission === 'granted') {
                this.subscribeUser();
            } else if (Notification.permission !== 'denied') {
                // Determine if we should prompt (e.g. on first admin load)
                // For now, we expose a method to trigger it via UI
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
        if (!this.swRegistration || !this.vapidPublicKey) return;

        try {
            // Check if already subscribed
            let subscription = await this.swRegistration.pushManager.getSubscription();

            if (!subscription) {
                // Subscribe
                subscription = await this.swRegistration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
                });
            }

            // Send to backend
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-session-token': localStorage.getItem('adminSessionToken')
                },
                body: JSON.stringify({ subscription })
            });

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
// Auto-init
window.pushManager.init();
