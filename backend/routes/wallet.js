/**
 * Spoon - Wallet API Routes
 *
 * Handles eWallet coin operations for the Pre-Order Cancellation feature.
 *
 * SECURITY:
 * - Uses requireAuth middleware to enforce session validity.
 * - Extracts user identity from validated session (req.user.email).
 * - Server-side price validation against menu_items DB.
 *
 * Endpoints:
 * - GET  /api/wallet/balance       — Get current coin balance
 * - GET  /api/wallet/transactions  — Get transaction history
 * - POST /api/wallet/pay           — Pay for order using coins
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const walletService = require('../services/walletService');
const notificationService = require('../services/notificationService');
const requireAuth = require('../middleware/userAuth');

// Singleton Supabase client (same pattern as orders.js)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Apply authentication middleware to all wallet routes
router.use(requireAuth);

// ========================================
// GET /api/wallet/balance
// ========================================

router.get('/balance', async (req, res) => {
    try {
        // Email is guaranteed by requireAuth
        const email = req.user.email;

        const result = await walletService.getBalance(email);
        if (!result.success) {
            return res.status(500).json({ success: false, error: result.error });
        }

        return res.json({ success: true, balance: result.balance, email });

    } catch (error) {
        console.error('❌ Wallet balance error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ========================================
// GET /api/wallet/transactions
// ========================================

router.get('/transactions', async (req, res) => {
    try {
        const email = req.user.email;
        const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 20), 50);

        const result = await walletService.getTransactionHistory(email, limit);

        if (!result.success) {
            return res.status(500).json({ success: false, error: result.error });
        }

        return res.json({
            success: true,
            transactions: result.transactions,
            email
        });

    } catch (error) {
        console.error('❌ Wallet transactions error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ========================================
// POST /api/wallet/pay
// ========================================

router.post('/pay', async (req, res) => {
    try {
        const email = req.user.email;
        const { items, phoneNumber } = req.body;

        // --- Input Validation ---
        if (!items || !Array.isArray(items) || items.length === 0 || items.length > 20) {
            return res.status(400).json({
                success: false,
                error: 'Items must be a non-empty array (max 20 items)'
            });
        }

        // ========================================
        // BREAK TIME VALIDATION (SERVER ENFORCED)
        // ========================================
        const { data: breakSetting, error: breakErr } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'is_break_time')
            .single();

        if (!breakErr && breakSetting && breakSetting.value === 'true') {
            console.warn(`🛑 Wallet Payment blocked: Canteen is on break. User: ${email}`);
            return res.status(400).json({
                success: false,
                error: 'Canteen staff is on a break, try later.'
            });
        }

        // --- SERVER-SIDE PRICE VALIDATION ---
        // Never trust client-sent prices. Fetch real prices from menu_items table.
        let serverTotal = 0;

        for (const cartItem of items) {
            if (!cartItem.id || !cartItem.quantity || cartItem.quantity < 1 || cartItem.quantity > 50) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid item: id and quantity (1-50) required`
                });
            }

            const { data: dbItem, error: itemError } = await supabase
                .from('menu_items')
                .select('id, name, price, is_available')
                .eq('id', cartItem.id)
                .single();

            if (itemError || !dbItem) {
                return res.status(400).json({
                    success: false,
                    error: `Item not found: ${cartItem.id}`
                });
            }

            if (!dbItem.is_available) {
                return res.status(400).json({
                    success: false,
                    error: `Item unavailable: ${dbItem.name}`
                });
            }

            serverTotal += dbItem.price * cartItem.quantity;
        }

        if (serverTotal <= 0 || !Number.isInteger(serverTotal)) {
            return res.status(400).json({ success: false, error: 'Invalid cart total' });
        }

        // --- Verify user exists ---
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .single();

        if (userError || !user) {
            return res.status(400).json({ success: false, error: 'User not found' });
        }

        // --- Balance pre-check ---
        const balanceResult = await walletService.getBalance(email);
        if (!balanceResult.success) {
            return res.status(500).json({ success: false, error: 'Failed to check balance' });
        }

        if (balanceResult.balance < serverTotal) {
            return res.status(400).json({
                success: false,
                error: 'INSUFFICIENT_BALANCE',
                balance: balanceResult.balance,
                required: serverTotal
            });
        }

        // --- Generate order ID and verification code ---
        const orderId = `wallet_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let verificationCode = '';
        for (let i = 0; i < 4; i++) {
            verificationCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // --- Debit coins ---
        const debitResult = await walletService.debitCoins(
            email,
            serverTotal,
            'PURCHASE',
            orderId,
            `Order payment: -${serverTotal} coins`
        );

        if (!debitResult.success) {
            if (debitResult.error === 'INSUFFICIENT_BALANCE') {
                return res.status(400).json({
                    success: false,
                    error: 'INSUFFICIENT_BALANCE',
                    balance: debitResult.balance
                });
            }
            if (debitResult.error === 'CONCURRENT_MODIFICATION') {
                return res.status(409).json({
                    success: false,
                    error: 'Please try again (concurrent request detected)'
                });
            }
            return res.status(500).json({ success: false, error: debitResult.error });
        }

        // --- Create order ---
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert([{
                id: orderId,
                customer_email: email,
                total: serverTotal,
                items: items,
                status: 'pending',
                preorder_time: null,
                phone_number: phoneNumber || null,
                payment_method: 'WALLET',
                verification_code: verificationCode,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (orderError) {
            console.error('❌ Wallet order creation failed:', orderError);
            // Rollback: re-credit the coins
            await walletService.creditCoins(
                email,
                serverTotal,
                'REFUND',
                `${orderId}_rollback`,
                'Rollback: Order creation failed'
            );
            return res.status(500).json({
                success: false,
                error: 'Order creation failed. Coins have been refunded.'
            });
        }

        console.log(`✅ Wallet order ${orderId}: ${serverTotal} coins from ${email}`);

        // Fire-and-forget: Notify admins (Telegram + Web Push)
        notificationService.notifyNewOrder(order).catch(err =>
            console.error('⚠️ Wallet order notification failed (non-blocking):', err.message)
        );

        return res.json({
            success: true,
            orderId: orderId,
            coinsUsed: serverTotal,
            remainingBalance: debitResult.balance,
            verificationCode: verificationCode
        });

    } catch (error) {
        console.error('❌ Wallet pay error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
