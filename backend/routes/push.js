const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const { requireAdminSession } = require('../middleware/sessionAuth');

// Lazy load Supabase client (avoid circular deps & env race conditions)
let supabaseInstance = null;
function getSupabase() {
    if (!supabaseInstance) {
        const { createClient } = require('@supabase/supabase-js');
        supabaseInstance = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    }
    return supabaseInstance;
}

/**
 * Spoon - Web Push API Routes
 * 
 * Handles push subscription management for admin devices.
 */

// ========================================
// ENDPOINT: Subscribe to Push Notifications
// ========================================

/**
 * Subscribe a device to push notifications.
 * 
 * Method: POST
 * Path: /api/push/subscribe
 * Body: { subscription: PushSubscription }
 * Security: Admin Session Required
 */
router.post('/subscribe', requireAdminSession, async (req, res) => {
    try {
        const { subscription } = req.body;
        const userEmail = req.user.email;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription object' });
        }

        console.log(`📡 Registering push subscription for ${userEmail}`);

        // Upsert subscription (endpoint is unique key)
        const { error } = await getSupabase()
            .from('push_subscriptions')
            .upsert({
                user_email: userEmail,
                endpoint: subscription.endpoint,
                keys: subscription.keys,
                created_at: new Date().toISOString()
            }, { onConflict: 'endpoint' });

        if (error) throw error;

        // Send a test notification immediately so user confirms it works
        const payload = JSON.stringify({
            title: '🔔 Notifications Active',
            body: 'You will now receive alerts for new orders!',
            icon: '/images/spoon-logo-square.png'
        });

        await webpush.sendNotification(subscription, payload).catch(err =>
            console.warn('⚠️ Test push failed (likely browser throttled):', err.message)
        );

        res.status(201).json({ success: true, message: 'Subscribed to push notifications' });

    } catch (error) {
        console.error('❌ Push subscription failed:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// ========================================
// ENDPOINT: Unsubscribe
// ========================================

/**
 * Unsubscribe a device.
 * 
 * Method: POST
 * Path: /api/push/unsubscribe
 * Body: { endpoint: string }
 */
router.post('/unsubscribe', requireAdminSession, async (req, res) => {
    try {
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({ error: 'Endpoint required' });
        }

        const { error } = await getSupabase()
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpoint);

        if (error) throw error;

        console.log('Hz Unsubscribed push device');
        res.json({ success: true });

    } catch (error) {
        console.error('❌ Push unsubscribe failed:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

// ========================================
// ENDPOINT: Get Public Key
// ========================================

/**
 * Get VAPID Public Key (for frontend conversion).
 * 
 * Method: GET
 * Path: /api/push/key
 */
router.get('/key', (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) {
        return res.status(500).json({ error: 'Push service not configured' });
    }
    res.json({ key });
});

module.exports = router;
