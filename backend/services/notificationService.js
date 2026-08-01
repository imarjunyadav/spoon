/**
 * Spoon - Notification Service
 *
 * Sends admin alerts when new orders are placed, and user alerts on
 * order-prepared / no-show-cancellation.
 *
 * Channels:
 * - Web Push (admins + users)
 * - Email (order-ready)
 * - WhatsApp (order-ready, via OpenWA — see whatsappService.js)
 *
 * Design:
 * - Fire-and-forget: NEVER blocks order creation.
 * - Graceful degradation: Missing config = silent skip.
 *
 * NOTE: Telegram admin alerts were removed (2026-06) — they were an
 * experimental/testing channel and are no longer used. Admin alerting is
 * handled by Web Push (backend) + the dashboard's realtime + audio alarm.
 */

const webPushService = require('./webPushService');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');

// ========================================
// PUBLIC API
// ========================================

/**
 * Notify admin(s) about a new order.
 * Fire-and-forget — call without await for non-blocking behavior.
 *
 * @param {Object} order - Order object (must have id, customer_email, items, total)
 * @returns {Promise<void>}
 */
async function notifyNewOrder(order) {
    // Web Push Notification to admins
    try {
        await webPushService.sendPushToAdmins(order);
    } catch (error) {
        console.error('⚠️ Web Push notification failed (non-blocking):', error.message);
    }
}

/**
 * Notify user that their order is prepared.
 *
 * @param {Object} order - Order object
 */
async function notifyOrderPrepared(order) {
    try {
        if (!order.customer_email) return;

        // 1. Send Web Push — simple, user-friendly, no internal identifiers.
        const payload = {
            title: `🍴 Your food is ready!`,
            body: `Your food is ready! Tap "I'm available to collect" to reveal your pickup slot.`,
            url: `/public/orders.html` // open Spoon on the Orders tab
        };
        await webPushService.sendPushToUser(order.customer_email, payload).catch(err => console.error('Push error:', err));

        // 2. Send Order Tracking Email
        // Prefer the official domain (set FRONTEND_URL after its DNS/HTTPS are live);
        // falls back to the Cloud Run URL so links always work if FRONTEND_URL is unset.
        const trackingUrl = `${process.env.FRONTEND_URL || 'https://spoon-backend-122591058801.asia-south1.run.app'}/public/orders.html`;
        await emailService.sendOrderReadyEmail(order.customer_email, trackingUrl).catch(err => console.error('Email error:', err));

        // 3. Send WhatsApp
        whatsappService.notifyOrderReadyWhatsApp(order).catch(err => console.error('WhatsApp error:', err));

    } catch (error) {
        console.error('⚠️ notifyOrderPrepared failed:', error.message);
    }
}

/**
 * Notify user that their order was cancelled due to no-show.
 *
 * @param {Object} order - Order object
 * @param {number} refundAmount - Coins refunded
 */
async function notifyOrderCancelledNoShow(order, refundAmount) {
    // Product decision: user push is sent ONLY when an order is ready. No-show
    // cancellations no longer trigger a push notification. Kept as a safe no-op so
    // existing callers (orders.js) continue to work unchanged and this can be
    // re-enabled later if desired.
    return;
}

module.exports = {
    notifyNewOrder,
    notifyOrderPrepared,
    notifyOrderCancelledNoShow
};
