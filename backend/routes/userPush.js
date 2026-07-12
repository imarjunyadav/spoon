const express = require('express');
const router = express.Router();
const webpush = require('web-push');
const requireAuth = require('../middleware/userAuth');

/**
 * Spoon - USER Web Push API Routes
 *
 * Lets a logged-in student register their browser/PWA to receive order updates
 * (order ready, no-show cancellation). Completely separate from the admin push
 * routes (/api/push/*): these endpoints require a USER session (x-user-email /
 * x-session-token via requireAuth) and write ONLY to `user_push_subscriptions`,
 * so the admin and user push systems never interfere.
 */

// Ensure VAPID is configured (web-push is a singleton, but set defensively).
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_EMAIL) {
    try {
        webpush.setVapidDetails(
            process.env.VAPID_EMAIL,
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
    } catch (e) {
        // Already set — that's fine
    }
}

// Lazy-load Supabase (service role bypasses RLS for this backend-only table).
let supabaseInstance = null;
function getSupabase() {
    if (!supabaseInstance) {
        const { createClient } = require('@supabase/supabase-js');
        supabaseInstance = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false }
        });
    }
    return supabaseInstance;
}

// ========================================
// GET /api/user-push/key — public VAPID key
// ========================================
router.get('/key', (req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) {
        return res.status(500).json({ error: 'Push service not configured' });
    }
    res.json({ key });
});

// ========================================
// POST /api/user-push/subscribe — register the current user's device
// ========================================
router.post('/subscribe', requireAuth, async (req, res) => {
    try {
        const { subscription } = req.body;
        const userEmail = req.user.email;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription object' });
        }

        // Upsert on the unique endpoint (one row per device).
        const { error } = await getSupabase()
            .from('user_push_subscriptions')
            .upsert({
                user_email: userEmail,
                endpoint: subscription.endpoint,
                keys: subscription.keys,
                created_at: new Date().toISOString()
            }, { onConflict: 'endpoint' });

        if (error) throw error;

        // NOTE: intentionally NO confirmation/"Notifications On" push here. The
        // client calls this endpoint on every app open to keep the subscription
        // synced, so sending a push here would notify the user every time they open
        // Spoon. Push notifications are sent ONLY when an order is ready.
        console.log(`📡 User push subscribed: ${userEmail}`);
        res.status(201).json({ success: true });

    } catch (error) {
        console.error('❌ User push subscribe failed:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// ========================================
// POST /api/user-push/unsubscribe — remove a device
// ========================================
router.post('/unsubscribe', requireAuth, async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) {
            return res.status(400).json({ error: 'Endpoint required' });
        }

        // Scope deletion to the current user so nobody can remove another user's device.
        const { error } = await getSupabase()
            .from('user_push_subscriptions')
            .delete()
            .eq('endpoint', endpoint)
            .eq('user_email', req.user.email);

        if (error) throw error;
        res.json({ success: true });

    } catch (error) {
        console.error('❌ User push unsubscribe failed:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

module.exports = router;
