/**
 * ========================================
 * SPOON - ORDERS API ROUTES
 * ========================================
 * 
 * PURPOSE:
 * Handles order status updates with email notifications
 * 
 * ENDPOINTS:
 * - PATCH /api/orders/:orderId/status - Update order status and send email
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

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
 * HELPER FUNCTION: Send Order Email
 * 
 * PURPOSE: Send minimal HTML email notification to customer
 * 
 * PARAMETERS:
 * @param {string} toEmail - Customer email address
 * @param {string} subject - Email subject line
 * @param {string} htmlContent - Minimal HTML email body
 * 
 * RETURNS: Promise<{success: boolean, messageId?: string, error?: string}>
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
 * ENDPOINT: Update Order Status
 * 
 * METHOD: PATCH
 * PATH: /api/orders/:orderId/status
 * 
 * PURPOSE: Update order status and send email notification
 * 
 * REQUEST BODY:
 * {
 *   "status": "COMPLETE" | "PICKED_UP"
 * }
 * 
 * RESPONSE:
 * {
 *   "success": true,
 *   "order": { ... },
 *   "email": { "sent": true, "messageId": "..." }
 * }
 */
router.patch('/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    // ========================================
    // DIAGNOSTIC LOGGING - STEP 1: REQUEST
    // ========================================
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

    // ========================================
    // DIAGNOSTIC LOGGING - STEP 2: FETCH
    // ========================================
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

    // ========================================
    // DIAGNOSTIC LOGGING - STEP 3: UPDATE
    // ========================================
    console.log('\n🔍 DIAGNOSTIC: Updating order status...');
    console.log('  - Updating ID:', orderId);
    console.log('  - New status:', status);
    
    const { data: updatedOrders, error: updateError, count: updateCount } = await supabase
      .from('orders')
      .update({ status })
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

module.exports = router;
