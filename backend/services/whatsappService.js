/**
 * WhatsApp Notification Service
 * Sends messages via OpenWA API
 */

// Configuration - reads from .env
function getWhatsAppConfig() {
    const enabled = process.env.WHATSAPP_ENABLED === 'true';
    const apiUrl = process.env.OPENWA_API_URL;
    const apiKey = process.env.OPENWA_API_KEY;
    const sessionName = process.env.OPENWA_SESSION_NAME;

    if (enabled && (!apiUrl || !apiKey || !sessionName)) {
        console.warn('⚠️ WhatsApp is enabled but configuration is missing. Notifications will be skipped.');
        return null;
    }

    if (!enabled) {
        return null;
    }

    return { apiUrl, apiKey, sessionName };
}

// Utility to mask phone numbers for logs (e.g. +9198XXXX3210)
function maskPhoneNumber(phone) {
    if (!phone) return 'Unknown';
    if (phone.length <= 4) return 'XXXX';
    return `XXXXXX${phone.slice(-4)}`;
}

// Phone number formatting
function formatPhoneToWhatsAppId(phone) {
    if (!phone) return null;
    
    // Convert to string and trim
    let parsedPhone = String(phone).trim();
    
    // Remove all non-digit and non-plus characters
    parsedPhone = parsedPhone.replace(/[^\d+]/g, '');
    
    // If it starts with 0, remove the leading 0 (common for local numbers)
    if (parsedPhone.startsWith('0')) {
        parsedPhone = parsedPhone.substring(1);
    }
    
    // Default to India (+91) if no country code provided
    if (!parsedPhone.startsWith('+')) {
        if (parsedPhone.length === 10) {
            parsedPhone = `+91${parsedPhone}`;
        }
    }
    
    // Remove the + for WhatsApp format
    let digits = parsedPhone.replace('+', '');
    
    // Validate length (min 10 digits generally)
    if (digits.length < 10) return null;
    
    // WhatsApp format: "919876543210@c.us"
    return `${digits}@c.us`;
}

// Message formatting
function formatOrderReadyMessage(order) {
    const orderId = (order.id || 'N/A').substring(0, 12);
    
    let itemsText = '';
    if (order.items && Array.isArray(order.items)) {
        itemsText = order.items
            .map(item => `  • ${item.title || item.name || 'Item'} × ${item.quantity || 1}`)
            .join('\n');
    }

    const trackingUrl = 'https://spoon-backend-122591058801.asia-south1.run.app/public/orders.html';

    return [
        '*Your order is ready* ✅',
        '',
        `Order ID: #${orderId}`,
        '',
        'Items:',
        itemsText || '  • Custom Order',
        '',
        `Reveal your slot on the orders tab: ${trackingUrl}`,
        '',
        '_*🏃‍♂️ Reach the counter within 4 mins*_'
    ].join('\n');
}

// Fetch with timeout and retry
async function fetchWithTimeoutAndRetry(url, options = {}, retries = 2, timeoutMs = 5000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                const err = new Error(`HTTP ${response.status}: ${errorText}`);
                err.status = response.status;
                throw err;
            }
            
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            
            // If it's a 4xx client error, don't retry as it will never succeed
            if (error.status && error.status >= 400 && error.status < 500) {
                throw error;
            }
            
            if (attempt === retries) {
                throw error;
            }
            // Small delay before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Send message via OpenWA API
async function sendWhatsAppMessage(phoneNumber, message) {
    const config = getWhatsAppConfig();
    if (!config) return false;

    const chatId = formatPhoneToWhatsAppId(phoneNumber);
    if (!chatId) {
        console.warn(`⚠️ Invalid phone format: ${maskPhoneNumber(phoneNumber)}`);
        return false;
    }

    const url = `${config.apiUrl}/sessions/${config.sessionName}/messages/send-text`;

    try {
        await fetchWithTimeoutAndRetry(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': config.apiKey
            },
            body: JSON.stringify({
                chatId: chatId,
                text: message
            })
        }, 2, 5000); // 2 attempts, 5s timeout

        return true;
    } catch (error) {
        console.error(`WhatsApp error for ${maskPhoneNumber(phoneNumber)} (non-blocking):`, error.message);
        return false;
    }
}

// Main public function
async function notifyOrderReadyWhatsApp(order) {
    try {
        const config = getWhatsAppConfig();
        if (!config) return;

        if (!order.phone_number) {
            return; // Silent skip if no phone number
        }

        const message = formatOrderReadyMessage(order);
        const success = await sendWhatsAppMessage(order.phone_number, message);

        if (success) {
            console.log(`📱 WhatsApp sent to ${maskPhoneNumber(order.phone_number)}`);
        }
    } catch (error) {
        console.error('⚠️ WhatsApp unexpected error (non-blocking):', error.message);
    }
}

module.exports = {
    notifyOrderReadyWhatsApp,
    formatPhoneToWhatsAppId,
    formatOrderReadyMessage,
    maskPhoneNumber
};
