/**
 * Spoon - Notification Service
 * 
 * Sends admin alerts when new orders are placed.
 * Currently supports: Telegram Bot API.
 * 
 * Design:
 * - Fire-and-forget: NEVER blocks order creation.
 * - Graceful degradation: Missing config = silent skip.
 * - Zero dependencies: Uses native fetch() (Node 18+).
 * 
 * Environment Variables:
 *   TELEGRAM_BOT_TOKEN  - Bot token from @BotFather
 *   TELEGRAM_CHAT_ID    - Target chat/group ID
 */

// ========================================
// CONFIGURATION
// ========================================

function getTelegramConfig() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        return null;
    }

    return { token, chatId };
}

// ========================================
// TELEGRAM ALERT
// ========================================

/**
 * Format order data into a clean Telegram message.
 * Uses Telegram MarkdownV2 formatting.
 * 
 * @param {Object} order - Order object from database
 * @returns {string} Formatted message string
 */
function formatOrderMessage(order) {
    const orderId = (order.id || 'N/A').substring(0, 12);
    const email = order.customer_email || 'Unknown';
    const phone = order.phone_number || 'N/A';
    const total = order.total || 0;

    // Format items list
    let itemsText = '';
    if (order.items && Array.isArray(order.items)) {
        itemsText = order.items
            .map(item => `  • ${item.title || item.name} × ${item.quantity} — ₹${item.price * item.quantity}`)
            .join('\n');
    }

    // Determine order type
    let orderType = '⚡ Instant Order';
    if (order.preorder_time) {
        try {
            const preTime = new Date(order.preorder_time);
            const timeStr = preTime.toLocaleTimeString('en-IN', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
                timeZone: 'Asia/Kolkata'
            });
            orderType = `🕐 Pre-Order (${timeStr})`;
        } catch {
            orderType = '🕐 Pre-Order';
        }
    }

    // Build message (plain text — more reliable than Markdown for special chars)
    const message = [
        '🍽️ NEW ORDER PLACED!',
        '',
        `📋 Order: #${orderId}`,
        `👤 ${email}`,
        `📱 ${phone}`,
        '',
        '🛒 Items:',
        itemsText || '  (no items data)',
        '',
        `💰 Total: ₹${total}`,
        `${orderType}`
    ].join('\n');

    return message;
}

/**
 * Send a Telegram message via Bot API.
 * 
 * @param {string} message - Message text to send
 * @returns {Promise<boolean>} True if sent successfully
 */
async function sendTelegramMessage(message) {
    const config = getTelegramConfig();
    if (!config) {
        return false; // Silently skip — not configured
    }

    const url = `https://api.telegram.org/bot${config.token}/sendMessage`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: config.chatId,
            text: message,
            disable_web_page_preview: true
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Telegram API error ${response.status}: ${errorBody}`);
    }

    return true;
}

const webPushService = require('./webPushService');

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
    // 1. Telegram Notification
    try {
        const config = getTelegramConfig();
        if (config) {
            const message = formatOrderMessage(order);
            await sendTelegramMessage(message);
            console.log(`📨 Telegram alert sent for order #${(order.id || '').substring(0, 8)}`);
        }
    } catch (error) {
        console.error('⚠️ Telegram notification failed (non-blocking):', error.message);
    }

    // 2. Web Push Notification
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
        
        const payload = {
            title: `🍽️ Order Ready! Slot #${order.slot_number}`,
            body: `Your order #${(order.id || '').substring(0, 8)} is ready for pickup at Slot #${order.slot_number}. Please collect it now.`,
            url: `/pages/user/orders.html`
        };
        
        await webPushService.sendPushToUser(order.customer_email, payload);
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
            url: `/pages/user/wallet.html`
        };
        
        await webPushService.sendPushToUser(order.customer_email, payload);
    } catch (error) {
        console.error('⚠️ notifyOrderCancelledNoShow failed:', error.message);
    }
}

module.exports = {
    notifyNewOrder,
    notifyOrderPrepared,
    notifyOrderCancelledNoShow,
    // Exported for testing
    formatOrderMessage,
    sendTelegramMessage
};
