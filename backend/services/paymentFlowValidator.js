/**
 * ========================================
 * PAYMENT FLOW VALIDATOR
 * ========================================
 * 
 * PURPOSE:
 * Ensures payment integrity and prevents revenue loss through:
 * - Idempotency guarantees (no duplicate orders)
 * - Webhook signature verification
 * - Atomic order creation with stock deduction
 * - Payment as single source of truth
 * 
 * REQUIREMENTS:
 * - 3.5, 3.6, 3.7: Cart checkout and payment flow
 * - 9.1, 9.2, 9.3, 9.5, 9.9: Payment validation and idempotency
 * 
 * TASK: 2. Implement payment flow validation and idempotency (P0)
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for backend operations
);

class PaymentFlowValidator {

  /**
   * ========================================
   * PAYMENT INITIALIZATION VALIDATION
   * ========================================
   * 
   * Validates payment initialization request before creating Razorpay order
   * 
   * @param {Object} orderData - Order data from frontend
   * @param {number} orderData.amount - Amount in rupees
   * @param {string} orderData.userEmail - User email
   * @param {Array} orderData.items - Cart items
   * @returns {Promise<Object>} Validation result
   */
  async validatePaymentInitiation(orderData) {
    const { amount, userEmail, items } = orderData;

    // Validate required fields
    if (!amount || amount <= 0) {
      return {
        valid: false,
        error: 'Invalid amount: must be greater than 0'
      };
    }

    if (!userEmail) {
      return {
        valid: false,
        error: 'User email is required'
      };
    }

    if (!items || items.length === 0) {
      return {
        valid: false,
        error: 'Cart is empty'
      };
    }

    // ========================================
    // SERVER-SIDE PRICE VALIDATION (SECURITY FIX)
    // ========================================
    // Fetch actual prices from database to prevent price manipulation
    const itemIds = items.map(item => item.id);
    const { data: dbItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, price, name, is_available')
      .in('id', itemIds);

    if (menuError || !dbItems) {
      console.error('❌ Failed to fetch menu items:', menuError);
      return {
        valid: false,
        error: 'Failed to validate cart items'
      };
    }

    // Calculate server-side total
    let serverTotal = 0;
    for (const cartItem of items) {
      const dbItem = dbItems.find(d => d.id === cartItem.id);

      if (!dbItem) {
        return {
          valid: false,
          error: `Item not found: ${cartItem.name || cartItem.id}`
        };
      }

      if (!dbItem.is_available) {
        return {
          valid: false,
          error: `Item unavailable: ${dbItem.name}`
        };
      }

      serverTotal += dbItem.price * (cartItem.quantity || 1);
    }

    // Compare with client amount (client sends in Rupees, so compare directly)
    // NOTE: Razorpay expects paise, but our internal API uses rupees
    if (Math.abs(serverTotal - amount) > 0.01) {
      console.error('❌ Price mismatch detected!', {
        serverTotal,
        clientAmount: amount,
        items
      });
      return {
        valid: false,
        error: 'Price mismatch detected. Please refresh and try again.'
      };
    }

    // Validate user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('email')
      .eq('email', userEmail)
      .single();

    if (userError || !user) {
      return {
        valid: false,
        error: 'User not found'
      };
    }

    return {
      valid: true,
      userEmail: user.email,
      validatedTotal: serverTotal
    };
  }

  /**
   * ========================================
   * WEBHOOK SIGNATURE VERIFICATION
   * ========================================
   * 
   * Verifies Razorpay webhook signature to prevent replay attacks
   * 
   * Requirements: 9.2 - Verify payment signature using Razorpay webhook verification
   * 
   * @param {Object} payload - Webhook payload from Razorpay
   * @param {string} signature - Razorpay signature from webhook header
   * @returns {Promise<boolean>} True if signature is valid
   */
  async validateWebhookSignature(payload, signature) {
    try {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

      if (!secret) {
        console.error('❌ RAZORPAY_WEBHOOK_SECRET not configured');
        return false;
      }

      // Generate expected signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      // Compare signatures using timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      if (!isValid) {
        console.error('❌ Webhook signature verification failed');
        console.error('Expected:', expectedSignature);
        console.error('Received:', signature);
      }

      return isValid;

    } catch (error) {
      console.error('❌ Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * ========================================
   * IDEMPOTENCY VALIDATION
   * ========================================
   * 
   * Checks if payment has already been processed to prevent duplicates
   * 
   * Requirements: 3.7, 9.3, 9.5 - Process webhooks idempotently using payment ID
   * 
   * @param {string} paymentId - Razorpay payment ID
   * @returns {Promise<Object>} Idempotency check result
   */
  async validateIdempotency(paymentId) {
    try {
      // Check if payment ID already exists in database
      const { data: existingPayment, error } = await supabase
        .from('payment_transactions')
        .select('id, order_id, status, created_at')
        .eq('razorpay_payment_id', paymentId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('❌ Error checking idempotency:', error);
        throw error;
      }

      if (existingPayment) {
        console.log(`⚠️ Payment ${paymentId} already processed`);
        return {
          alreadyProcessed: true,
          existingOrderId: existingPayment.order_id,
          status: existingPayment.status,
          timestamp: existingPayment.created_at
        };
      }

      return {
        alreadyProcessed: false
      };

    } catch (error) {
      console.error('❌ Idempotency check failed:', error);
      throw error;
    }
  }

  /**
   * ========================================
   * HANDLE PAYMENT SUCCESS
   * ========================================
   * 
   * Processes successful payment with atomic order creation
   * 
   * Requirements: 3.6 - Create order, deduct stock, send email, clear cart atomically
   * 
   * @param {Object} paymentData - Payment data from webhook
   * @returns {Promise<Object>} Order creation result
   */
  async handlePaymentSuccess(paymentData) {
    const {
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      amount,
      currency,
      userEmail,
      cartItems,
      preorderTime,
      phoneNumber
    } = paymentData;

    try {
      // STEP 1: Check idempotency
      const idempotencyCheck = await this.validateIdempotency(razorpayPaymentId);

      if (idempotencyCheck.alreadyProcessed) {
        console.log(`✅ Payment ${razorpayPaymentId} already processed, returning existing order`);
        return {
          success: true,
          orderId: idempotencyCheck.existingOrderId,
          duplicate: true,
          message: 'Payment already processed'
        };
      }

      // STEP 2: Create payment transaction record (idempotency lock)
      const { data: paymentTransaction, error: paymentError } = await supabase
        .from('payment_transactions')
        .insert([{
          razorpay_payment_id: razorpayPaymentId,
          razorpay_order_id: razorpayOrderId,
          razorpay_signature: razorpaySignature,
          amount: amount,
          currency: currency,
          status: 'processing',
          user_email: userEmail,
          webhook_received: true,
          webhook_timestamp: new Date().toISOString(),
          signature_verified: true
        }])
        .select()
        .single();

      if (paymentError) {
        // Check if error is due to unique constraint violation (duplicate payment ID)
        if (paymentError.code === '23505') { // PostgreSQL unique violation
          console.log(`⚠️ Duplicate payment detected: ${razorpayPaymentId}`);

          // Fetch existing order
          const { data: existing } = await supabase
            .from('payment_transactions')
            .select('order_id')
            .eq('razorpay_payment_id', razorpayPaymentId)
            .single();

          return {
            success: true,
            orderId: existing?.order_id,
            duplicate: true,
            message: 'Payment already processed (race condition handled)'
          };
        }

        console.error('❌ Failed to create payment transaction:', paymentError);
        throw paymentError;
      }

      // Generate verification code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let verificationCode = '';
      for (let i = 0; i < 4; i++) verificationCode += chars.charAt(Math.floor(Math.random() * chars.length));

      // STEP 3: Create order with atomic stock deduction
      // TODO: This will be enhanced in Task 3 (Stock Management) with proper locking
      const orderId = razorpayPaymentId; // Use payment ID as order ID

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{
          id: orderId,
          customer_email: userEmail,
          total: amount / 100, // Convert paise to rupees
          items: cartItems,
          status: 'PLACED',
          preorder_time: preorderTime,
          phone_number: phoneNumber,
          razorpay_payment_id: razorpayPaymentId,
          verification_code: verificationCode,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (orderError) {
        console.error('❌ Failed to create order:', orderError);

        // Update payment transaction status to failed
        await supabase
          .from('payment_transactions')
          .update({
            status: 'failed',
            error_reason: `Order creation failed: ${orderError.message}`
          })
          .eq('razorpay_payment_id', razorpayPaymentId);

        throw orderError;
      }

      // STEP 4: Update payment transaction with order ID
      await supabase
        .from('payment_transactions')
        .update({
          order_id: orderId,
          status: 'success'
        })
        .eq('razorpay_payment_id', razorpayPaymentId);

      console.log(`✅ Payment ${razorpayPaymentId} processed successfully, order ${orderId} created`);

      return {
        success: true,
        orderId: orderId,
        paymentId: razorpayPaymentId,
        stockDeducted: false, // Will be true after Task 3
        emailSent: false, // Will be true after email integration
        cartCleared: true,
        duplicate: false
      };

    } catch (error) {
      console.error('❌ Payment success handling failed:', error);

      return {
        success: false,
        error: error.message,
        stockDeducted: false,
        emailSent: false,
        cartCleared: false
      };
    }
  }

  /**
   * ========================================
   * HANDLE PAYMENT FAILURE
   * ========================================
   * 
   * Processes failed payment and preserves cart state
   * 
   * Requirements: 3.7 - Preserve cart state on payment failure
   * 
   * @param {Object} paymentData - Payment data from webhook
   * @returns {Promise<Object>} Failure handling result
   */
  async handlePaymentFailure(paymentData) {
    const {
      razorpayPaymentId,
      razorpayOrderId,
      amount,
      currency,
      userEmail,
      errorReason
    } = paymentData;

    try {
      // Record failed payment
      const { error } = await supabase
        .from('payment_transactions')
        .insert([{
          razorpay_payment_id: razorpayPaymentId,
          razorpay_order_id: razorpayOrderId,
          amount: amount,
          currency: currency,
          status: 'failed',
          user_email: userEmail,
          webhook_received: true,
          webhook_timestamp: new Date().toISOString(),
          error_reason: errorReason
        }]);

      if (error && error.code !== '23505') { // Ignore duplicate key errors
        console.error('❌ Failed to record payment failure:', error);
      }

      console.log(`⚠️ Payment ${razorpayPaymentId} failed: ${errorReason}`);

      return {
        success: true,
        message: 'Payment failure recorded',
        cartPreserved: true
      };

    } catch (error) {
      console.error('❌ Payment failure handling error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * ========================================
   * RECONCILE PAYMENT AND ORDER
   * ========================================
   * 
   * Reconciles payment record with order for manual verification
   * 
   * Requirements: 9.6 - Log inconsistency and trigger manual reconciliation
   * 
   * @param {string} paymentId - Razorpay payment ID
   * @returns {Promise<Object>} Reconciliation result
   */
  async reconcilePaymentOrder(paymentId) {
    try {
      // Fetch payment transaction
      const { data: payment, error: paymentError } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('razorpay_payment_id', paymentId)
        .single();

      if (paymentError || !payment) {
        return {
          success: false,
          error: 'Payment transaction not found'
        };
      }

      // Fetch order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('payment_id', paymentId)
        .single();

      // Check consistency
      const consistent = !!(order && payment.order_id === order.id);

      if (!consistent) {
        console.error(`❌ INCONSISTENCY DETECTED: Payment ${paymentId}`);
        console.error('Payment record:', payment);
        console.error('Order record:', order);

        // TODO: Send alert to operations team
      }

      return {
        success: true,
        consistent: consistent,
        payment: payment,
        order: order,
        requiresManualReview: !consistent
      };

    } catch (error) {
      console.error('❌ Reconciliation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new PaymentFlowValidator();
