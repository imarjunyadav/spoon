/**
 * ========================================
 * SPOON - PAYMENT API ROUTES
 * ========================================
 * 
 * PURPOSE:
 * This file handles payment-related API endpoints with production-level validation.
 * It creates Razorpay orders and processes webhooks with idempotency guarantees.
 * 
 * WHAT IT DOES:
 * 1. Receives payment amount from frontend
 * 2. Creates order in Razorpay system with validation
 * 3. Processes Razorpay webhooks with signature verification
 * 4. Ensures idempotent payment processing (no duplicates)
 * 5. Creates orders atomically with payment records
 * 
 * KEY CONCEPTS:
 * - Idempotency: Same payment ID always produces same result
 * - Webhook Verification: Cryptographic signature validation
 * - Atomic Transactions: Order + Payment created together
 * - Single Source of Truth: Payment record is authoritative
 * 
 * REQUIREMENTS:
 * - 3.5, 3.6, 3.7: Cart checkout and payment flow
 * - 9.1, 9.2, 9.3, 9.5, 9.9: Payment validation and idempotency
 * 
 * TASK: 2. Implement payment flow validation and idempotency (P0)
 */

// ========================================
// SECTION 1: IMPORT DEPENDENCIES
// ========================================

// Express Router: For creating modular route handlers
const express = require("express");

// Razorpay: Payment gateway SDK
const Razorpay = require("razorpay");

// Axios: HTTP client for making API requests
const axios = require("axios");

// HTTPS: Node.js module for HTTPS requests
const https = require("https");

// Payment Flow Validator: Production-level payment validation
const paymentFlowValidator = require("../services/paymentFlowValidator");

// Create router instance
const router = express.Router();

// Load environment variables (API keys)
require("dotenv").config();

// ========================================
// SECTION 2: CONFIGURATION
// ========================================

/**
 * HTTPS AGENT CONFIGURATION
 * 
 * LEARNING NOTE:
 * rejectUnauthorized: false disables SSL certificate verification
 * This is needed for development but should be true in production
 */
const agent = new https.Agent({ rejectUnauthorized: false });

// ========================================
// SECTION 3: CREATE ORDER ENDPOINT
// ========================================

/**
 * ROUTE: POST /api/payment/create-order
 * 
 * PURPOSE: Create a new Razorpay order
 * 
 * REQUEST BODY:
 * {
 *   "amount": 100  // Amount in rupees
 * }
 * 
 * RESPONSE:
 * {
 *   "id": "order_xyz123",
 *   "amount": 10000,  // Amount in paise (100 rupees = 10000 paise)
 *   "currency": "INR",
 *   ...other Razorpay fields
 * }
 * 
 * HOW IT WORKS:
 * 1. Validates amount from request
 * 2. Converts rupees to paise (Razorpay uses paise)
 * 3. Calls Razorpay API to create order
 * 4. Returns order details to frontend
 */
router.post("/create-order", async (req, res) => {

  // ========================================
  // STEP 1: EXTRACT AND VALIDATE REQUEST
  // ========================================

  console.log('🔍 Debug: /create-order request body:', JSON.stringify(req.body, null, 2));

  const { amount, userEmail, items } = req.body;

  // Validate using PaymentFlowValidator
  const validation = await paymentFlowValidator.validatePaymentInitiation({
    amount,
    userEmail,
    items
  });

  if (!validation.valid) {
    console.error(`❌ Payment validation failed: ${validation.error}`);
    return res.status(400).json({ error: validation.error });
  }

  console.log(`✅ Payment validation passed for ${userEmail}`);

  // ========================================
  // STEP 2: PREPARE ORDER DATA
  // ========================================

  const orderPayload = {
    amount: amount * 100,  // Convert rupees to paise
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
    notes: {
      email: userEmail,
      cart_items: JSON.stringify(items),
      preorder_time: req.body.preorderTime || null,
      phone_number: req.body.phoneNumber || null
    }
  };

  console.log("🔧 Creating Razorpay order:", {
    amount: orderPayload.amount,
    currency: orderPayload.currency,
    userEmail: userEmail
  });

  // ========================================
  // STEP 3: AUTHENTICATION CREDENTIALS
  // ========================================

  const auth = {
    username: process.env.RAZORPAY_KEY_ID,
    password: process.env.RAZORPAY_SECRET
  };

  // ========================================
  // STEP 4: CALL RAZORPAY API
  // ========================================

  try {
    const response = await axios.post(
      "https://api.razorpay.com/v1/orders",
      orderPayload,
      {
        auth,
        httpsAgent: agent
      }
    );

    console.log(`✅ Razorpay order created: ${response.data.id}`);

    // Log payment initiation event
    console.log(`📝 Payment initiated: Order ${response.data.id}, Amount ${amount}, User ${userEmail}`);

    return res.status(200).json(response.data);

  } catch (error) {
    console.error("❌ Razorpay Order Creation Failed");
    console.error("🧨 Error:", error.message || error);

    return res.status(500).json({
      error: "Order creation failed",
      details: error.message
    });
  }
});

// ========================================
// SECTION 4: WEBHOOK ENDPOINT
// ========================================

// ========================================
// SECTION 4: WEBHOOK & VERIFICATION ENDPOINTS
// ========================================

/**
 * ROUTE: POST /api/payment/verify-payment
 * 
 * PURPOSE: Allow client-side verification of payment to triggering order creation.
 * Essential for environments where webhooks are unreliable or delayed (e.g. localhost).
 * 
 * REQUEST BODY:
 * {
 *   razorpay_payment_id: "pay_...",
 *   razorpay_order_id: "order_...",
 *   razorpay_signature: "..."
 * }
 */
router.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    console.log(`🔍 Verifying payment from client: ${razorpay_payment_id}`);

    // Verify signature using the secret key (same as webhook verification logic)
    const crypto = require("crypto");
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest("hex");

    if (generated_signature !== razorpay_signature) {
      console.error("❌ Client payment verification failed: Invalid signature");
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    console.log("✅ Client payment signature verified");

    // Fetch payment details from Razorpay to get amount and notes
    // We cannot trust client-provided notes/amount for order creation
    const auth = {
      username: process.env.RAZORPAY_KEY_ID,
      password: process.env.RAZORPAY_SECRET
    };

    const paymentDetails = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      { auth, httpsAgent: agent }
    );

    const payment = paymentDetails.data;

    // Use shared logic with webhook handler
    const result = await paymentFlowValidator.handlePaymentSuccess({
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      razorpaySignature: razorpay_signature,
      amount: payment.amount,
      currency: payment.currency,
      userEmail: payment.email || payment.notes?.email,
      cartItems: payment.notes?.cart_items ? JSON.parse(payment.notes.cart_items) : [],
      preorderTime: payment.notes?.preorder_time,
      phoneNumber: payment.notes?.phone_number
    });

    if (result.success) {
      // Return order ID whether created new or found duplicate
      return res.status(200).json({
        success: true,
        orderId: result.orderId,
        message: result.duplicate ? "Order already exists" : "Order created successfully"
      });
    } else {
      return res.status(500).json({ error: result.error || "Order creation failed" });
    }

  } catch (error) {
    console.error("❌ Verification endpoint error:", error);
    return res.status(500).json({ error: "Verification failed", details: error.message });
  }
});

/**
 * ROUTE: POST /api/payment/webhook
 * ...
 */
router.post("/webhook", async (req, res) => {
  try {
    console.log("📥 Webhook received from Razorpay");

    // STEP 1: Extract signature from headers
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      console.error("❌ Webhook signature missing");
      return res.status(400).json({ error: "Signature missing" });
    }

    // STEP 2: Verify webhook signature
    const isValid = await paymentFlowValidator.validateWebhookSignature(
      req.body,
      signature
    );

    if (!isValid) {
      console.error("❌ Webhook signature verification failed");
      return res.status(401).json({ error: "Invalid signature" });
    }

    console.log("✅ Webhook signature verified");

    // STEP 3: Extract webhook data
    const event = req.body.event;
    const payload = req.body.payload.payment.entity;

    console.log(`📋 Webhook event: ${event}`);
    console.log(`💳 Payment ID: ${payload.id}`);

    // STEP 4: Handle different webhook events
    switch (event) {
      case 'payment.captured':
      case 'payment.authorized':
        // Payment successful - create order
        await handlePaymentSuccess(payload, req.body);
        break;

      case 'payment.failed':
        // Payment failed - record failure
        await handlePaymentFailure(payload);
        break;

      default:
        console.log(`⚠️ Unhandled webhook event: ${event}`);
    }

    // STEP 5: Always return 200 to acknowledge webhook receipt
    // Razorpay will retry if we don't return 200
    return res.status(200).json({ status: "ok" });

  } catch (error) {
    console.error("❌ Webhook processing error:", error);

    // Still return 200 to prevent Razorpay retries for our internal errors
    return res.status(200).json({ status: "error", message: error.message });
  }
});

/**
 * HELPER: Handle successful payment webhook
 */
async function handlePaymentSuccess(payment, webhookBody) {
  try {
    // Extract payment details
    const paymentData = {
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      razorpaySignature: webhookBody.payload.payment.entity.signature || '',
      amount: payment.amount,
      currency: payment.currency,
      userEmail: payment.email || payment.notes?.email,
      cartItems: payment.notes?.cart_items ? JSON.parse(payment.notes.cart_items) : [],
      preorderTime: payment.notes?.preorder_time,
      phoneNumber: payment.notes?.phone_number
    };

    // Process payment with idempotency
    const result = await paymentFlowValidator.handlePaymentSuccess(paymentData);

    if (result.success) {
      if (result.duplicate) {
        console.log(`✅ Duplicate webhook handled: ${paymentData.razorpayPaymentId}`);
      } else {
        console.log(`✅ Order created: ${result.orderId}`);
      }
    } else {
      console.error(`❌ Payment processing failed: ${result.error}`);
    }

  } catch (error) {
    console.error("❌ Error handling payment success:", error);
  }
}

/**
 * HELPER: Handle failed payment webhook
 */
async function handlePaymentFailure(payment) {
  try {
    const paymentData = {
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      amount: payment.amount,
      currency: payment.currency,
      userEmail: payment.email || payment.notes?.email,
      errorReason: payment.error_description || 'Payment failed'
    };

    await paymentFlowValidator.handlePaymentFailure(paymentData);
    console.log(`⚠️ Payment failure recorded: ${paymentData.razorpayPaymentId}`);

  } catch (error) {
    console.error("❌ Error handling payment failure:", error);
  }
}

// ========================================
// SECTION 5: EXPORT ROUTER
// ========================================

/**
 * EXPORT ROUTER
 * Makes this router available to server.js
 * 
 * LEARNING NOTE:
 * module.exports is how Node.js shares code between files
 */
module.exports = router;
