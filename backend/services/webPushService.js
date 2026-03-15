const webpush = require('web-push');

/**
 * Spoon - Web Push Service
 * 
 * Handles sending native OS push notifications to subscribed admins.
 * 
 * ENVIRONMENT:
 * - VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - VAPID_EMAIL
 */

// Configure VAPID
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL;

if (publicVapidKey && privateVapidKey && vapidEmail) {
    webpush.setVapidDetails(
        vapidEmail,
        publicVapidKey,
        privateVapidKey
    );
} else {
    console.warn('⚠️ Web Push Config Missing: Push notifications will be disabled.');
}

// Lazy load Supabase client (avoid circular deps & env race conditions)
let supabaseInstance = null;
function getSupabase() {
    if (!supabaseInstance) {
        const { createClient } = require('@supabase/supabase-js');
        // Use Service Role Key to bypass RLS
        supabaseInstance = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false }
        });
    }
    return supabaseInstance;
}

/**
 * Send push notification to all subscribed admins.
 * 
 * @param {Object} order - The order object
 */
async function sendPushToAdmins(order) {
    if (!publicVapidKey) return;

    try {
        // 1. Fetch all subscriptions
        const { data: subscriptions, error } = await getSupabase()
            .from('push_subscriptions')
            .select('endpoint, keys');

        if (error || !subscriptions || subscriptions.length === 0) {
            return; // No subscribers
        }

        // 2. Prepare Payload
        const payload = JSON.stringify({
            title: '🍽️ New Order Received!',
            body: `Order #${(order.id || '').substring(0, 8)}\nItems: ${order.items ? order.items.length : 0} | Total: ₹${order.total}`,
            icon: '/images/spoon-logo-square.png', // Ensure this exists public facing
            data: {
                url: '/admin/admin-mobile.html' // Open dashboard on click
            }
        });

        // 3. Send in parallel
        const promises = subscriptions.map(sub =>
            webpush.sendNotification(sub, payload).catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    // Subscription is gone/expired - remove from DB
                    console.log('🗑️ Removing stale subscription:', sub.endpoint);
                    return getSupabase()
                        .from('push_subscriptions')
                        .delete()
                        .eq('endpoint', sub.endpoint);
                }
                console.error('⚠️ Push send failed:', err.message);
            })
        );

        await Promise.all(promises);
        console.log(`🚀 Sent push notifications to ${subscriptions.length} devices`);

    } catch (err) {
        console.error('❌ Web Push Service Error:', err);
    }
}

/**
 * Send push notification to a specific user.
 * 
 * @param {string} userEmail - The user's email
 * @param {Object} payloadOptions - Title, body, url
 */
async function sendPushToUser(userEmail, payloadOptions) {
    if (!publicVapidKey) return;

    try {
        const { data: subscriptions, error } = await getSupabase()
            .from('push_subscriptions')
            .select('endpoint, keys')
            .eq('user_email', userEmail);

        if (error || !subscriptions || subscriptions.length === 0) {
            return; // No subscribers for this user
        }

        const payload = JSON.stringify({
            title: payloadOptions.title,
            body: payloadOptions.body,
            icon: '/images/spoon-logo-square.png',
            data: { url: payloadOptions.url || '/pages/user/orders.html' }
        });

        const promises = subscriptions.map(sub =>
            webpush.sendNotification(sub, payload).catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    console.log('🗑️ Removing stale user subscription:', sub.endpoint);
                    return getSupabase()
                        .from('push_subscriptions')
                        .delete()
                        .eq('endpoint', sub.endpoint);
                }
                console.error('⚠️ User push send failed:', err.message);
            })
        );

        await Promise.all(promises);
        console.log(`🚀 Sent push notification to ${userEmail} (${subscriptions.length} devices)`);

    } catch (err) {
        console.error('❌ User Web Push Error:', err);
    }
}

module.exports = {
    sendPushToAdmins,
    sendPushToUser
};
