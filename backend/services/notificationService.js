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

        // 1. Send Web Push
        const payload = {
            title: `🍽️ Order Ready!`,
            body: `Your order #${(order.id || '').substring(0, 8)} is hot and ready. Tap "I am available to collect" at the counter to reveal your slot.`,
            url: `/public/orders.html`
        };
        await webPushService.sendPushToUser(order.customer_email, payload).catch(err => console.error('Push error:', err));

        // 2. Send Order Tracking Email
        const trackingUrl = `https://spoon-backend-122591058801.asia-south1.run.app/public/orders.html`;
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
    try {
        if (!order.customer_email) return;

        const payload = {
            title: `❌ Order Cancelled (No-Show)`,
            body: `Order #${(order.id || '').substring(0, 8)} was cancelled as it wasn't collected. ${refundAmount} coins have been refunded to your wallet.`,
            url: `/public/wallet.html`
        };

        await webPushService.sendPushToUser(order.customer_email, payload);
    } catch (error) {
        console.error('⚠️ notifyOrderCancelledNoShow failed:', error.message);
    }
}

module.exports = {
    notifyNewOrder,
    notifyOrderPrepared,
    notifyOrderCancelledNoShow
};
