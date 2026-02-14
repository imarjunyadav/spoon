/**
 * Spoon - Orders API Routes
 * 
 * Handles order status updates with email notifications
 * and pre-order cancellation with eWallet coin refund.
 * 
 * Endpoints:
 * - PATCH /api/orders/:orderId/status  - Update order status and send email
 * - POST  /api/orders/:orderId/cancel  - Cancel pre-order and refund coins
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const adminService = require('../services/adminService');
const walletService = require('../services/walletService');
const { requireAdminSession } = require('../middleware/sessionAuth');

// Initialize Supabase client with SERVICE_ROLE_KEY
// This bypasses RLS policies and allows admin operations
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize SMTP transporter for email notifications
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASSWORD
  }
});

/**
 * Send minimal HTML email notification to customer.
 * 
 * @param {string} toEmail - Customer email address
 * @param {string} subject - Email subject line
 * @param {string} htmlContent - Minimal HTML email body
 * 
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendOrderEmail(toEmail, subject, htmlContent) {
  try {
    const info = await transporter.sendMail({
      from: `"SPOON Canteen" <${process.env.SMTP_EMAIL}>`,
      to: toEmail,
      subject: subject,
      html: htmlContent
    });

    console.log(`📧 Email sent to ${toEmail}:`, info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (err) {
    console.error(`❌ Email error for ${toEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Update order status and send email notification.
 * 
 * Method: PATCH
 * Path: /api/orders/:orderId/status
 * 
 * Security:
 * - Uses requireAdminSession middleware
 * - Enforces both JWT and x-admin-session-token
 */
router.patch('/:orderId/status', requireAdminSession, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    // User verified by middleware (includes admin check)
    console.log('✅ Admin authenticated:', req.user.email);

    // Diagnostic Logging - Request
    console.log('\n========================================');
    console.log('🔍 DIAGNOSTIC: Status Update Request');
    console.log('========================================');
    console.log('📥 Received orderId:', orderId);
    console.log('📥 orderId type:', typeof orderId);
    console.log('📥 orderId length:', orderId.length);
    console.log('📥 orderId (hex):', Buffer.from(orderId).toString('hex'));
    console.log('📥 New status:', status);
    console.log('📥 Supabase URL:', process.env.SUPABASE_URL);
    console.log('📥 Using ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'Yes' : 'No');

    // Validate status
    if (!['COMPLETE', 'PICKED_UP'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be COMPLETE or PICKED_UP'
      });
    }

    // Diagnostic Logging - Fetch
    console.log('\n🔍 DIAGNOSTIC: Fetching order...');

    const { data: order, error: fetchError, count } = await supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .eq('id', orderId)
      .single();

    console.log('📊 Fetch result:');
    console.log('  - Found order:', !!order);
    console.log('  - Order ID match:', order?.id === orderId);
    console.log('  - Fetch error:', fetchError);
    console.log('  - Count:', count);

    if (order) {
      console.log('  - Order details:');
      console.log('    * ID:', order.id);
      console.log('    * Status:', order.status);
      console.log('    * Phone:', order.phone_number);
      console.log('    * Email:', order.customer_email);
      console.log('    * Verification Code:', order.verification_code);
    }

    if (fetchError || !order) {
      console.error('❌ DIAGNOSTIC: Order fetch failed');
      console.error('   Error details:', JSON.stringify(fetchError, null, 2));
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        debug: {
          orderId,
          fetchError: fetchError?.message || 'No order found'
        }
      });
    }

    // Diagnostic Logging - Update
    console.log('\n🔍 DIAGNOSTIC: Updating order status...');
    console.log('  - Updating ID:', orderId);
    console.log('  - New status:', status);

    // Build update object with status and appropriate timestamp
    const updateData = { status };

    // Set timestamp based on status change
    if (status === 'COMPLETE') {
      updateData.ready_at = new Date().toISOString();
      console.log('  - Setting ready_at:', updateData.ready_at);
    } else if (status === 'PICKED_UP') {
      updateData.picked_up_at = new Date().toISOString();
      console.log('  - Setting picked_up_at:', updateData.picked_up_at);
    }

    console.log('  - Full updateData:', JSON.stringify(updateData, null, 2));

    const { data: updatedOrders, error: updateError, count: updateCount } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select('*', { count: 'exact' });

    console.log('📊 Update result:');
    console.log('  - Update error:', updateError);
    console.log('  - Rows returned:', updatedOrders?.length || 0);
    console.log('  - Update count:', updateCount);

    if (updateError) {
      console.error('❌ DIAGNOSTIC: Update failed');
      console.error('   Error details:', JSON.stringify(updateError, null, 2));
      console.error('   Error code:', updateError.code);
      console.error('   Error hint:', updateError.hint);
      console.error('   Error details:', updateError.details);
      return res.status(500).json({
        success: false,
        error: 'Failed to update order status',
        debug: {
          updateError: updateError.message,
          code: updateError.code,
          hint: updateError.hint
        }
      });
    }

    // Check if any rows were updated
    if (!updatedOrders || updatedOrders.length === 0) {
      console.error('❌ DIAGNOSTIC: No rows updated');
      console.error('   This suggests RLS policy blocking update');
      console.error('   Or ID mismatch issue');
      return res.status(404).json({
        success: false,
        error: 'Order not found or already updated',
        debug: {
          orderId,
          rowsUpdated: 0,
          possibleCause: 'RLS policy or ID mismatch'
        }
      });
    }

    const updatedOrder = updatedOrders[0];
    console.log('✅ DIAGNOSTIC: Order status updated successfully');
    console.log('   New status:', updatedOrder.status);
    console.log('   ready_at:', updatedOrder.ready_at);
    console.log('   picked_up_at:', updatedOrder.picked_up_at);
    console.log('========================================\n');

    // Send email notification based on status
    let emailResult = { sent: false };

    if (order.customer_email) {
      let subject = '';
      let htmlContent = '';

      if (status === 'COMPLETE') {
        // Order ready for pickup - send verification code
        subject = 'Your SPOON order is ready for pickup!';

        // Generate items list
        const itemsList = order.items.map(item =>
          `<li>${item.title} × ${item.quantity} - ₹${item.price * item.quantity}</li>`
        ).join('');

        htmlContent = `
          <div style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
            <p>Your SPOON order is ready for pickup.</p>
            <p>Pickup Code: <strong style="font-size: 24px;">${order.verification_code}</strong></p>
            <p>Show this code at the counter.</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p><strong>Order Details:</strong></p>
            <ul style="margin: 10px 0; padding-left: 20px;">
              ${itemsList}
            </ul>
            <p><strong>Total: ₹${order.total}</strong></p>
          </div>
        `;
      } else if (status === 'PICKED_UP') {
        // Order collected
        subject = 'Order picked up — Enjoy your meal!';
        htmlContent = `
          <div style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #333;">
            <p>Your order has been picked up!</p>
            <p>Thank you for choosing SPOON.</p>
          </div>
        `;
      }

      if (subject && htmlContent) {
        emailResult = await sendOrderEmail(order.customer_email, subject, htmlContent);
      }
    } else {
      console.log('⚠️ No customer email found for order');
    }

    // Return success response
    res.json({
      success: true,
      order: updatedOrder,
      email: emailResult
    });

  } catch (error) {
    console.error('💥 Server error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

const requireAuth = require('../middleware/userAuth');

// ========================================
// ENDPOINT: Get User Orders (List)
// ========================================

/**
 * Get all orders for the logged-in user.
 * 
 * Method: GET
 * Path: /api/orders
 * 
 * Security:
 * - Uses requireAuth middleware
 * - Returns orders ONLY for req.user.email
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const email = req.user.email;

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_email', email)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching user orders:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch orders' });
    }

    return res.json({ success: true, orders: orders || [] });

  } catch (error) {
    console.error('💥 List orders error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// ========================================
// ENDPOINT: Get Single Order
// ========================================

/**
 * Get details for a specific order.
 * 
 * Method: GET
 * Path: /api/orders/:orderId
 * 
 * Security:
 * - Uses requireAuth middleware
 * - Enforces ownership (customer_email must match)
 */
router.get('/:orderId', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const email = req.user.email;

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Security Check: Ownership
    if (order.customer_email.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    return res.json({ success: true, order });

  } catch (error) {
    console.error('💥 Get order error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// ========================================
// ENDPOINT: Cancel Pre-Order
// ========================================

/**
 * Cancel a pre-order and refund coins to wallet.
 *
 * Rules:
 * - Only PLACED orders can be cancelled
 * - Only pre-orders (with preorder_time) are eligible
 * - Must be >= 45 minutes before preorder_time
 * - Refund amount = order.total (what they paid)
 * - Max 3 cancellations per user per 24 hours
 *
 * Security:
 * - Uses requireAuth middleware
 * - Enforces order ownership (order.customer_email MUST match session email)
 *
 * Method: POST
 * Path: /api/orders/:orderId/cancel
 */
router.post('/:orderId/cancel', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const email = req.user.email; // Guaranteed by requireAuth

    // --- Input validation ---
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid orderId is required' });
    }

    // Sanitize optional reason (max 200 chars, no HTML)
    const safeReason = reason
      ? String(reason).replace(/<[^>]*>/g, '').substring(0, 200)
      : 'User cancelled';

    // STEP 1: Fetch the order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, status, total, preorder_time, customer_email, payment_method')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // STEP 2: Ownership check
    // Vital security check: Session email must match Order email
    if (order.customer_email.toLowerCase() !== email) {
      console.warn(`⚠️ Cancel ownership mismatch: ${email} tried to cancel ${orderId} owned by ${order.customer_email}`);
      return res.status(403).json({ success: false, error: 'Not your order' });
    }

    // STEP 3: Status check
    if (order.status !== 'PLACED') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel order with status: ${order.status}`
      });
    }

    // STEP 4: Pre-order check
    if (!order.preorder_time) {
      return res.status(400).json({
        success: false,
        error: 'Only pre-orders can be cancelled'
      });
    }

    // STEP 5: 45-minute window check (server-side time only)
    const now = new Date();
    const preorderTime = new Date(order.preorder_time);
    const minutesUntilPickup = (preorderTime - now) / (1000 * 60);

    if (minutesUntilPickup < 45) {
      return res.status(400).json({
        success: false,
        error: 'Too late to cancel. Must cancel at least 45 minutes before pickup time.',
        minutesRemaining: Math.max(0, Math.floor(minutesUntilPickup)),
        serverTime: now.toISOString()  // Let frontend sync to server clock
      });
    }

    // STEP 6: Rate limit check (max 3 cancellations per 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentCancels } = await supabase
      .from('orders')
      .select('id')
      .eq('customer_email', email)
      .eq('status', 'CANCELLED')
      .gte('cancelled_at', twentyFourHoursAgo);

    if (recentCancels && recentCancels.length >= 3) {
      return res.status(429).json({
        success: false,
        error: 'Maximum 3 cancellations per day. Please try again tomorrow.'
      });
    }

    // STEP 7: Atomic cancel — only cancel if still PLACED
    // order.total is numeric in DB, convert to integer coins
    const refundAmount = Math.round(Number(order.total));
    if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
      console.error(`❌ Invalid refund amount for order ${orderId}: total=${order.total}`);
      return res.status(500).json({ success: false, error: 'Invalid order total for refund' });
    }

    const { data: cancelled, error: cancelError } = await supabase
      .from('orders')
      .update({
        status: 'CANCELLED',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: safeReason,
        refund_amount: refundAmount
      })
      .eq('id', orderId)
      .eq('status', 'PLACED')  // Optimistic lock
      .select();

    if (cancelError) {
      console.error('❌ Cancel update failed:', cancelError);
      return res.status(500).json({ success: false, error: 'Failed to cancel order' });
    }

    if (!cancelled || cancelled.length === 0) {
      return res.status(409).json({
        success: false,
        error: 'Order status changed. Please refresh and try again.'
      });
    }

    // STEP 8: Credit coins to wallet
    const creditResult = await walletService.creditCoins(
      email,
      refundAmount,
      'REFUND',
      orderId,
      `Refund for cancelled order`
    );

    if (!creditResult.success) {
      // Rollback: revert order to PLACED
      await supabase
        .from('orders')
        .update({
          status: 'PLACED',
          cancelled_at: null,
          cancellation_reason: null,
          refund_amount: null
        })
        .eq('id', orderId);

      return res.status(500).json({
        success: false,
        error: 'Failed to credit wallet. Order not cancelled.'
      });
    }

    console.log(`✅ Order ${orderId} cancelled. ${refundAmount} coins credited to ${email}`);

    return res.json({
      success: true,
      refundAmount: refundAmount,
      walletBalance: creditResult.balance,
      message: `Order cancelled. ${refundAmount} coins credited to your wallet.`
    });

  } catch (error) {
    console.error('💥 Cancel order error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
