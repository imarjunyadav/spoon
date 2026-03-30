/**
 * Wallet Service
 *
 * Manages coin wallets for the eWallet / Pre-Order Cancellation feature.
 * 1 Coin = 1 INR. No fractional coins. All amounts are integers.
 *
 * SECURITY:
 * - Optimistic locking on BOTH credit and debit to prevent balance corruption
 * - Idempotent refunds (checks reference_order_id before crediting)
 * - Integer enforcement — rejects floats and NaN
 * - Email normalization — trims + lowercases consistently
 *
 * Functions:
 * - getOrCreateWallet(email)   → Get or create a wallet
 * - getBalance(email)          → Current coin balance
 * - creditCoins(email, amount, reason, orderId, description) → Add coins
 * - debitCoins(email, amount, reason, orderId, description)  → Remove coins
 * - getTransactionHistory(email, limit) → Recent transactions
 */

const { createClient } = require('@supabase/supabase-js');

// Singleton Supabase client (service role — bypasses RLS)
let supabase = null;

function getClient() {
    if (!supabase) {
        supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return supabase;
}

// ========================================
// VALIDATION HELPERS
// ========================================

/**
 * Validate and normalize email.
 * @param {string} email
 * @returns {string|null} Normalized email or null if invalid
 */
function validateEmail(email) {
    if (!email || typeof email !== 'string') return null;
    const normalized = email.trim().toLowerCase();
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
    if (normalized.length > 254) return null; // RFC 5321 max
    return normalized;
}

/**
 * Validate coin amount is a positive integer.
 * @param {*} amount
 * @returns {boolean}
 */
function isValidCoinAmount(amount) {
    return typeof amount === 'number' && Number.isInteger(amount) && amount > 0 && amount <= 100000;
}

// ========================================
// GET OR CREATE WALLET
// ========================================

async function getOrCreateWallet(email) {
    const client = getClient();
    const normalizedEmail = validateEmail(email);
    if (!normalizedEmail) {
        return { success: false, error: 'Invalid email format' };
    }

    // Try to fetch existing wallet
    const { data: existing, error: fetchError } = await client
        .from('wallets')
        .select('*')
        .eq('user_email', normalizedEmail)
        .single();

    if (existing) return { success: true, wallet: existing };

    // Not found — create new wallet (PGRST116 = "no rows returned")
    if (fetchError && fetchError.code === 'PGRST116') {
        const { data: newWallet, error: createError } = await client
            .from('wallets')
            .insert([{ user_email: normalizedEmail, balance: 0 }])
            .select()
            .single();

        if (createError) {
            // Race condition: another request created it between our SELECT and INSERT
            if (createError.code === '23505') {
                const { data: retryWallet } = await client
                    .from('wallets')
                    .select('*')
                    .eq('user_email', normalizedEmail)
                    .single();
                return { success: true, wallet: retryWallet };
            }
            console.error('❌ Wallet creation failed:', createError);
            return { success: false, error: createError.message };
        }

        return { success: true, wallet: newWallet };
    }

    if (fetchError) {
        console.error('❌ Wallet fetch failed:', fetchError);
        return { success: false, error: fetchError.message };
    }

    // Should not reach here, but guard against it
    return { success: false, error: 'Unexpected wallet state' };
}

// ========================================
// GET BALANCE
// ========================================

async function getBalance(email) {
    const result = await getOrCreateWallet(email);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, balance: result.wallet.balance };
}

// ========================================
// ========================================
// CREDIT COINS (Refund / Admin Credit)
// ========================================

async function creditCoins(email, amount, reason, orderId = null, description = '') {
    const client = getClient();
    const normalizedEmail = validateEmail(email);

    if (!normalizedEmail) return { success: false, error: 'Invalid email' };
    if (!isValidCoinAmount(amount)) return { success: false, error: 'Amount must be a positive integer (max 100000)' };

    try {
        const { data: result, error: rpcError } = await client.rpc('wallet_credit_coins', {
            p_email: normalizedEmail,
            p_amount: amount,
            p_reason: reason,
            p_order_id: orderId,
            p_description: description
        });

        if (rpcError) {
            console.error('❌ Wallet RPC credit failed:', rpcError);
            return { success: false, error: rpcError.message };
        }

        if (result && result.duplicate) {
            console.log(`⚡ Refund already processed for order ${orderId}`);
        } else {
            console.log(`✅ Credited ${amount} coins to ${normalizedEmail}. New balance: ${result.balance}`);
        }

        return result;

    } catch (err) {
        console.error('❌ creditCoins exception:', err);
        return { success: false, error: err.message };
    }
}

// ========================================
// DEBIT COINS (Purchase / Admin Debit)
// ========================================

async function debitCoins(email, amount, reason, orderId = null, description = '') {
    const client = getClient();
    const normalizedEmail = validateEmail(email);

    if (!normalizedEmail) return { success: false, error: 'Invalid email' };
    if (!isValidCoinAmount(amount)) return { success: false, error: 'Amount must be a positive integer (max 100000)' };

    try {
        // Get wallet
        const walletResult = await getOrCreateWallet(normalizedEmail);
        if (!walletResult.success) return walletResult;

        const wallet = walletResult.wallet;

        // Insufficient balance check
        if (wallet.balance < amount) {
            return {
                success: false,
                error: 'INSUFFICIENT_BALANCE',
                balance: wallet.balance,
                required: amount
            };
        }

        const newBalance = wallet.balance - amount;

        // OPTIMISTIC LOCK: Only debit if balance matches what we read
        // Prevents double-spend from concurrent requests
        const { data: updated, error: updateError } = await client
            .from('wallets')
            .update({ balance: newBalance, updated_at: new Date().toISOString() })
            .eq('id', wallet.id)
            .eq('balance', wallet.balance)  // Optimistic lock
            .select();

        if (updateError) {
            console.error('❌ Wallet debit update failed:', updateError);
            return { success: false, error: updateError.message };
        }

        if (!updated || updated.length === 0) {
            // Balance changed — don't retry debits (could cause unwanted deduction)
            return { success: false, error: 'CONCURRENT_MODIFICATION' };
        }

        // Record transaction in ledger
        const { error: txnError } = await client
            .from('wallet_transactions')
            .insert([{
                wallet_id: wallet.id,
                type: 'DEBIT',
                amount: amount,
                reason: reason,
                reference_order_id: orderId,
                description: description || `${reason}: -${amount} coins`,
                balance_after: newBalance
            }]);

        if (txnError) {
            console.error('❌ Wallet debit transaction record failed:', txnError);
            // Rollback balance to original
            await client.from('wallets')
                .update({ balance: wallet.balance, updated_at: new Date().toISOString() })
                .eq('id', wallet.id);
            return { success: false, error: txnError.message };
        }

        console.log(`✅ Debited ${amount} coins from ${normalizedEmail}. New balance: ${newBalance}`);
        return { success: true, balance: newBalance };

    } catch (err) {
        console.error('❌ debitCoins exception:', err);
        return { success: false, error: err.message };
    }
}

// ========================================
// TRANSACTION HISTORY
// ========================================

async function getTransactionHistory(email, limit = 20) {
    const normalizedEmail = validateEmail(email);
    if (!normalizedEmail) return { success: false, error: 'Invalid email' };

    // Clamp limit to prevent abuse
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 50);

    const client = getClient();

    // First get wallet
    const walletResult = await getOrCreateWallet(normalizedEmail);
    if (!walletResult.success) return walletResult;

    const { data, error } = await client
        .from('wallet_transactions')
        .select('id, type, amount, reason, reference_order_id, description, balance_after, created_at')
        .eq('wallet_id', walletResult.wallet.id)
        .order('created_at', { ascending: false })
        .limit(safeLimit);

    if (error) {
        console.error('❌ Transaction history fetch failed:', error);
        return { success: false, error: error.message };
    }

    return { success: true, transactions: data || [] };
}

module.exports = {
    getOrCreateWallet,
    getBalance,
    creditCoins,
    debitCoins,
    getTransactionHistory,
    validateEmail  // Exported for use in routes
};
