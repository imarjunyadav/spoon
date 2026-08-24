/**
 * SPOON - SENDER POOL
 *
 * Manages multiple SMTP sender accounts loaded from environment variables.
 *
 * Configuration (add as many as needed — no code changes required):
 *   SMTP_EMAIL_1=account1@gmail.com   SMTP_PASSWORD_1=app_password_1
 *   SMTP_EMAIL_2=account2@gmail.com   SMTP_PASSWORD_2=app_password_2
 *   ...
 *
 * Falls back to the legacy SMTP_EMAIL / SMTP_PASSWORD pair if no numbered
 * accounts are configured, so existing deployments keep working unchanged.
 *
 * Behaviour:
 *   - Round-robin across available senders.
 *   - On SMTP failure: cool the sender for 5 minutes, immediately retry with
 *     the next available sender (up to pool.length attempts total).
 *   - If all senders are cooling, uses the one whose cooldown expires soonest.
 *   - Counters and cooldowns are in-process only (reset on restart).
 */

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 587;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes after a send error

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

function discoverSenders() {
    const raw = [];

    // Numbered pairs: SMTP_EMAIL_1 / SMTP_PASSWORD_1, SMTP_EMAIL_2 / ..., etc.
    let i = 1;
    while (true) {
        const email = process.env[`SMTP_EMAIL_${i}`];
        const password = process.env[`SMTP_PASSWORD_${i}`];
        if (!email || !password) break;
        raw.push({ email, password });
        i++;
    }

    // Legacy fallback: SMTP_EMAIL / SMTP_PASSWORD (or SMTP_USER)
    if (raw.length === 0) {
        const email = process.env.SMTP_EMAIL || process.env.SMTP_USER;
        const password = process.env.SMTP_PASSWORD;
        if (email && password) {
            raw.push({ email, password });
        }
    }

    if (raw.length === 0) {
        console.warn('[SenderPool] ⚠️  No SMTP senders configured — emails will fail');
    } else {
        console.log(`[SenderPool] ✅ Loaded ${raw.length} sender(s): ${raw.map(s => s.email).join(', ')}`);
    }

    return raw.map(({ email, password }) => ({
        email,
        transporter: nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_PORT === 465,
            auth: { user: email, pass: password },
            connectionTimeout: 15000,
            socketTimeout: 15000,
        }),
        sentCount: 0,
        coolUntil: 0, // epoch ms; 0 = available immediately
    }));
}

const pool = discoverSenders();
let rrIndex = 0; // round-robin pointer into pool

// ---------------------------------------------------------------------------
// Sender selection
// ---------------------------------------------------------------------------

function pickSender() {
    if (pool.length === 0) return null;

    const now = Date.now();

    // Try each slot starting from the round-robin position
    for (let offset = 0; offset < pool.length; offset++) {
        const idx = (rrIndex + offset) % pool.length;
        if (pool[idx].coolUntil <= now) {
            rrIndex = (idx + 1) % pool.length; // advance for next call
            return pool[idx];
        }
    }

    // All senders are cooling — return the one whose cooldown expires soonest
    return pool.reduce((best, s) => (s.coolUntil < best.coolUntil ? s : best));
}

// ---------------------------------------------------------------------------
// Send with automatic fallback
// ---------------------------------------------------------------------------

/**
 * Send an email, falling back through all configured senders on failure.
 *
 * @param {object} mailOptions - Nodemailer mail options (from, to, subject, html).
 *   The `from` field is overridden by the active sender's address so Gmail
 *   accepts the message.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendWithFallback(mailOptions) {
    if (pool.length === 0) {
        return { success: false, error: 'No SMTP senders configured' };
    }

    const tried = new Set();

    for (let attempt = 0; attempt < pool.length; attempt++) {
        const sender = pickSender();

        // Guard against wrapping back to an already-tried sender
        if (tried.has(sender.email)) break;
        tried.add(sender.email);

        try {
            const info = await sender.transporter.sendMail({
                ...mailOptions,
                // Gmail requires from == auth.user; override whatever the caller passed
                from: `"SPOON Canteen" <${sender.email}>`,
            });

            sender.sentCount++;
            console.log(
                `[SenderPool] 📧 Sent via ${sender.email}` +
                ` (lifetime sent: ${sender.sentCount}) → ${info.messageId}`
            );
            return { success: true };

        } catch (err) {
            const remaining = pool.length - attempt - 1;
            console.error(
                `[SenderPool] ❌ ${sender.email} failed: ${err.message}` +
                (remaining > 0 ? ` — trying next sender (${remaining} left)` : ' — no more senders')
            );
            sender.coolUntil = Date.now() + COOLDOWN_MS;
        }
    }

    return { success: false, error: 'All SMTP senders failed' };
}

module.exports = { sendWithFallback };
