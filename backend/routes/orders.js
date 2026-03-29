/**
 * Spoon v2 - Orders API Routes
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { requireAdminSession } = require('../middleware/sessionAuth');
const requireAuth = require('../middleware/userAuth');
const walletService = require('../services/walletService');
const notificationService = require('../services/notificationService');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to get system settings
async function getNumericSetting(key, defaultValue) {
  try {
    const { data } = await supabase.from('system_settings').select('value').eq('key', key).single();
    if (data && data.value) {
      const parsed = parseInt(data.value, 10);
      if (!isNaN(parsed)) return parsed;
    }
  } catch (err) {
    console.error(`Error fetching setting ${key}:`, err);
  }
  return defaultValue;
}

// ---------------------------------------------------------
// GET /api/orders/admin (Admin Dashboard)
// ---------------------------------------------------------
router.get('/admin', requireAdminSession, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, status, items, total, customer_email, created_at, kitchen_at, prepared_at, arrived_at, slot_number')
      .in('status', ['pending', 'kitchen', 'prepared'])
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ success: true, orders: orders || [] });
  } catch (error) {
    console.error('Error fetching admin orders:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch admin orders', code: 'DB_ERROR' });
  }
});

// ---------------------------------------------------------
// GET /api/orders/admin/cancelled (Admin Dashboard - Cancelled Modal)
// ---------------------------------------------------------
router.get('/admin/cancelled', requireAdminSession, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, status, items, total, customer_email, created_at, cancelled_at, cancel_reason, refund_amount')
      .eq('status', 'cancelled')
      .order('cancelled_at', { ascending: false })
      .limit(50); // Get latest 50 for performance

    if (error) throw error;
    res.json({ success: true, orders: orders || [] });
  } catch (error) {
    console.error('Error fetching cancelled orders:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cancelled orders', code: 'DB_ERROR' });
  }
});

// ---------------------------------------------------------
// POST /api/orders/:orderId/send-to-kitchen (Admin)
// ---------------------------------------------------------
router.post('/:orderId/send-to-kitchen', requireAdminSession, async (req, res) => {
  try {
    const { orderId } = req.params;
    const adminEmail = req.user.email;

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'kitchen',
        kitchen_at: new Date().toISOString(),
        kitchen_by: adminEmail
      })
      .eq('id', orderId)
      .eq('status', 'pending')
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(409).json({ success: false, error: 'Order not found or not in pending state', code: 'STATE_CONFLICT' });
    }

    res.json({ success: true, order: data[0] });
  } catch (error) {
    console.error('send-to-kitchen error:', error);
    res.status(500).json({ success: false, error: 'Failed to move order to kitchen', code: 'DB_ERROR' });
  }
});

// ---------------------------------------------------------
// POST /api/orders/:orderId/mark-prepared (Admin)
// ---------------------------------------------------------
router.post('/:orderId/mark-prepared', requireAdminSession, async (req, res) => {
  try {
    const { orderId } = req.params;
    const adminEmail = req.user.email;

    const maxCapacity = await getNumericSetting('max_prepared_slots', 10);
    
    // ---------------------------------------------------------
    // ATOMIC SLOT ASSIGNMENT (Single RPC Call)
    // Guaranteed to yield lowest available slot without JS looping
    // ---------------------------------------------------------
    const { data: rpcData, error } = await supabase.rpc('assign_prepared_slot_atomic', {
      p_order_id: orderId,
      p_max_slots: maxCapacity,
      p_admin_email: adminEmail
    });

    if (error) throw error;

    if (!rpcData.success) {
      return res.status(409).json({ success: false, error: rpcData.error, code: rpcData.code });
    }

    const preparedOrder = rpcData.order;
    const assignedSlot = rpcData.slot;

    // Fire-and-forget notification
    if (notificationService.notifyOrderPrepared) {
      notificationService.notifyOrderPrepared(preparedOrder).catch(err => console.error('notifyOrderPrepared err:', err));
    }

    res.json({ success: true, order: preparedOrder, slot: assignedSlot });
  } catch (error) {
    console.error('mark-prepared error:', error);
    res.status(500).json({ success: false, error: 'Failed to mark order prepared', code: 'DB_ERROR' });
  }
});

// ---------------------------------------------------------
// POST /api/orders/:orderId/complete (Admin)
// ---------------------------------------------------------
router.post('/:orderId/complete', requireAdminSession, async (req, res) => {
  try {
    const { orderId } = req.params;
    const adminEmail = req.user.email;

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: adminEmail
      })
      .eq('id', orderId)
      .eq('status', 'prepared')
      // Note: we do NOT clear slot_number to keep audit trail
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(409).json({ success: false, error: 'Order not in prepared state', code: 'STATE_CONFLICT' });
    }

    res.json({ success: true, order: data[0] });
  } catch (error) {
    console.error('complete order error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete order', code: 'DB_ERROR' });
  }
});

// ---------------------------------------------------------
// POST /api/orders/:orderId/cancel-no-show (Admin)
// ---------------------------------------------------------
router.post('/:orderId/cancel-no-show', requireAdminSession, async (req, res) => {
  try {
    const { orderId } = req.params;
    const adminEmail = req.user.email;

    // Fetch order first to get total and prepared_at
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, total, customer_email, prepared_at, arrived_at')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) return res.status(404).json({ success: false, error: 'Order not found', code: 'NOT_FOUND' });

    if (order.status !== 'prepared') {
      return res.status(400).json({ success: false, error: 'Only prepared orders can be marked no-show', code: 'STATE_CONFLICT' });
    }
    if (order.arrived_at) {
      return res.status(400).json({ success: false, error: 'Student has arrived, cannot cancel no-show', code: 'STUDENT_ARRIVED' });
    }

    const timeoutMinutes = await getNumericSetting('no_show_timeout_minutes', 10);
    const preparedTime = new Date(order.prepared_at).getTime();
    const nowTs = new Date().getTime();
    const elapsedMinutes = (nowTs - preparedTime) / (1000 * 60);

    if (elapsedMinutes < timeoutMinutes) {
      return res.status(400).json({ 
        success: false, 
        error: `Must wait at least ${timeoutMinutes} minutes before cancelling.`, 
        code: 'TIMEOUT_NOT_ELAPSED' 
      });
    }

    const refundAmount = Math.round(Number(order.total));
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return res.status(500).json({ success: false, error: 'Invalid refund amount', code: 'INVALID_AMOUNT' });
    }

    // Atomic update to cancel
    const { data: cancelledData, error: cancelErr } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: adminEmail,
        cancel_reason: 'no_show',
        refund_amount: refundAmount
      })
      .eq('id', orderId)
      .eq('status', 'prepared')
      .is('arrived_at', null)
      .select();

    if (cancelErr) throw cancelErr;
    if (!cancelledData || cancelledData.length === 0) {
      return res.status(409).json({ success: false, error: 'Order state changed', code: 'STATE_CONFLICT' });
    }

    // Credit Wallet
    const creditResult = await walletService.creditCoins(
      order.customer_email,
      refundAmount,
      'REFUND',
      orderId,
      'Refund for no-show order'
    );

    if (!creditResult.success) {
      // Rollback
      await supabase
        .from('orders')
        .update({
          status: 'prepared',
          cancelled_at: null,
          cancelled_by: null,
          cancel_reason: null,
          refund_amount: null
        })
        .eq('id', orderId)
        .eq('status', 'cancelled');
        
      return res.status(500).json({ success: false, error: 'Wallet credit failed, cancelled rolled back.', code: 'WALLET_CREDIT_FAILED' });
    }

    // Fire-and-forget notification
    if (notificationService.notifyOrderCancelledNoShow) {
      notificationService.notifyOrderCancelledNoShow(order, refundAmount).catch(err => console.error(err));
    }

    res.json({ success: true, refundAmount });
  } catch (error) {
    console.error('cancel-no-show error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel order, rolled back if needed', code: 'DB_ERROR' });
  }
});

// ---------------------------------------------------------
// POST /api/orders/:orderId/force-cancel (Admin — cancel any active order)
// ---------------------------------------------------------
router.post('/:orderId/force-cancel', requireAdminSession, async (req, res) => {
  try {
    const { orderId } = req.params;
    const adminEmail = req.user.email;

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, total, customer_email')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      return res.status(404).json({ success: false, error: 'Order not found', code: 'NOT_FOUND' });
    }

    const activeStatuses = ['pending', 'kitchen', 'prepared'];
    if (!activeStatuses.includes(order.status)) {
      return res.status(400).json({ success: false, error: `Cannot cancel order with status "${order.status}"`, code: 'STATE_CONFLICT' });
    }

    const previousStatus = order.status;
    const refundAmount = Math.round(Number(order.total));
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return res.status(500).json({ success: false, error: 'Invalid refund amount', code: 'INVALID_AMOUNT' });
    }

    // Atomic cancel — only if status hasn't changed
    const { data: cancelledData, error: cancelErr } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: adminEmail,
        cancel_reason: 'admin_force',
        refund_amount: refundAmount
      })
      .eq('id', orderId)
      .eq('status', previousStatus)
      .select();

    if (cancelErr) throw cancelErr;
    if (!cancelledData || cancelledData.length === 0) {
      return res.status(409).json({ success: false, error: 'Order state changed during cancel', code: 'STATE_CONFLICT' });
    }

    // Credit wallet
    const creditResult = await walletService.creditCoins(
      order.customer_email,
      refundAmount,
      'REFUND',
      orderId,
      'Refund: order cancelled by staff'
    );

    if (!creditResult.success) {
      // Rollback
      await supabase
        .from('orders')
        .update({
          status: previousStatus,
          cancelled_at: null,
          cancelled_by: null,
          cancel_reason: null,
          refund_amount: null
        })
        .eq('id', orderId)
        .eq('status', 'cancelled');

      return res.status(500).json({ success: false, error: 'Wallet refund failed, cancel rolled back.', code: 'WALLET_CREDIT_FAILED' });
    }

    console.log(`🚫 Force cancel: order ${orderId} (was ${previousStatus}) by ${adminEmail}, refund ₹${refundAmount}`);

    if (notificationService.notifyOrderCancelledNoShow) {
      notificationService.notifyOrderCancelledNoShow(order, refundAmount).catch(err => console.error(err));
    }

    res.json({ success: true, refundAmount });
  } catch (error) {
    console.error('force-cancel error:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel order', code: 'DB_ERROR' });
  }
});

// ---------------------------------------------------------
// POST /api/orders/:orderId/arrive (User view)
// ---------------------------------------------------------
router.post('/:orderId/arrive', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userEmail = req.user.email;

    // Check if order exists and belongs to user
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, arrived_at, slot_number, customer_email')
      .eq('id', orderId)
      .eq('customer_email', userEmail)
      .single();

    if (fetchErr || !order) {
      return res.status(404).json({ success: false, error: 'Order not found or unauthorized' });
    }

    if (order.status !== 'prepared') {
       return res.status(400).json({ success: false, error: 'Order is not ready yet', code: 'STATE_CONFLICT' });
    }

    // Idempotent: already arrived
    if (order.arrived_at) {
      return res.json({ success: true, slot_number: order.slot_number });
    }

    // Atomic update to mark arrived
    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update({ arrived_at: new Date().toISOString() })
      .eq('id', orderId)
      .eq('status', 'prepared')
      .eq('customer_email', userEmail)
      // double check in case of race
      .is('arrived_at', null)
      .select();

    if (updateErr) throw updateErr;
    if (!updated || updated.length === 0) {
      // it might have just been updated
      const { data: rechecked } = await supabase.from('orders').select('slot_number').eq('id', orderId).single();
      return res.json({ success: true, slot_number: rechecked?.slot_number });
    }

    res.json({ success: true, slot_number: updated[0].slot_number });
  } catch (error) {
    console.error('arrive error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'DB_ERROR' });
  }
});

// ---------------------------------------------------------
// GET /api/orders (User view - list)
// ---------------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
  try {
    const email = req.user.email;

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, status, total, items, created_at, kitchen_at, prepared_at, completed_at, cancelled_at, arrived_at, slot_number, cancel_reason')
      .eq('customer_email', email)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Mask slot_number for prepared orders if not arrived
    const safeOrders = (orders || []).map(o => {
      if (!o.arrived_at && o.status === 'prepared') {
         o.slot_number = null;
      }
      return o;
    });

    res.json({ success: true, orders: safeOrders });
  } catch (error) {
    console.error('list user orders error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'DB_ERROR' });
  }
});

// ---------------------------------------------------------
// GET /api/orders/:orderId (User view)
// ---------------------------------------------------------
router.get('/:orderId', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const email = req.user.email;

    const { data: order, error } = await supabase
      .from('orders')
      .select('id, status, total, items, created_at, kitchen_at, prepared_at, completed_at, cancelled_at, arrived_at, slot_number, cancel_reason, customer_email')
      .eq('id', orderId)
      .single();

    if (error || !order) return res.status(404).json({ success: false, error: 'Order not found' });

    if (order.customer_email.toLowerCase() !== email.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    if (!order.arrived_at && order.status === 'prepared') {
      order.slot_number = null;
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error('get order error:', error);
    res.status(500).json({ success: false, error: 'Internal server error', code: 'DB_ERROR' });
  }
});

// ---------------------------------------------------------
// DELETE /api/orders/batch (User view - bulk delete history)
// ---------------------------------------------------------
router.delete('/batch', requireAuth, async (req, res) => {
  try {
    const email = req.user.email;
    const { orderIds } = req.body;

    // --- Input Validation ---
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, error: 'orderIds must be a non-empty array' });
    }

    if (orderIds.length > 50) {
      return res.status(400).json({ success: false, error: 'Cannot delete more than 50 orders at once' });
    }

    // Validate ID format (supports UUIDs and wallet_* / order_* formats)
    const idFormatRegex = /^[a-zA-Z0-9_-]{10,60}$/;
    const invalidIds = orderIds.filter(id => typeof id !== 'string' || !idFormatRegex.test(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ success: false, error: 'Invalid order ID format detected' });
    }

    // --- Fetch orders to determine which are deletable ---
    const { data: orders, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status')
      .in('id', orderIds)
      .eq('customer_email', email);

    if (fetchErr) throw fetchErr;

    const deletableStatuses = ['completed', 'cancelled'];
    const deletableIds = [];
    const skippedIds = [];

    (orders || []).forEach(order => {
      if (deletableStatuses.includes(order.status)) {
        deletableIds.push(order.id);
      } else {
        skippedIds.push(order.id);
      }
    });

    // Log skipped orders for debugging
    if (skippedIds.length > 0) {
      console.warn(`⚠️ Batch delete skipped ${skippedIds.length} active orders for ${email}:`, skippedIds);
    }

    // --- Delete only safe orders ---
    let deletedCount = 0;
    if (deletableIds.length > 0) {
      const { data: deleted, error: deleteErr } = await supabase
        .from('orders')
        .delete()
        .in('id', deletableIds)
        .eq('customer_email', email)
        .select('id');

      if (deleteErr) throw deleteErr;
      deletedCount = deleted ? deleted.length : 0;
    }

    console.log(`🗑️ Batch delete: ${deletedCount} deleted, ${skippedIds.length} skipped for ${email}`);

    res.json({
      success: true,
      deletedCount,
      skippedIds
    });
  } catch (error) {
    console.error('batch delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete orders', code: 'DB_ERROR' });
  }
});

module.exports = router;
