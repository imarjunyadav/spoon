/**
 * Spoon - Payment API Routes
 * 
 * Handles payment-related API endpoints with production-level validation.
 * Creates Razorpay orders and processes webhooks with idempotency guarantees.
 * 
 * Key Concepts:
 * - Idempotency: Same payment ID always produces same result
 * - Webhook Verification: Cryptographic signature validation
 * - Atomic Transactions: Order + Payment created together
 * - Single Source of Truth: Payment record is authoritative
 */

// Import Dependencies
const express = require("express");
const Razorpay = require("razorpay");
const axios = require("axios");
const https = require("https");
const paymentFlowValidator = require("../services/paymentFlowValidator");
const requireAuth = require('../middleware/userAuth');

// Create router instance
const router = express.Router();
const isProd = process.env.NODE_ENV === 'production';

// Load environment variables (API keys)
require("dotenv").config();

// ========================================
// CONFIGURATION
// ========================================

/**
 * HTTPS Agent Configuration
 * rejectUnauthorized: false disables SSL certificate verification.
 * Needed for development; ensures requests don't fail on self-signed certs.
 */
// Only disable cert verification in development (local self-signed certs)
const agent = isProd ? undefined : new https.Agent({ rejectUnauthorized: false });

// ========================================
// ENDPOINT: Create Order
// ========================================

/**
 * Create a new Razorpay order.
 * 
 * Method: POST
 * Path: /api/payment/create-order
 * Request Body: { "amount": number }
 * 
 * @returns {object} Razorpay order details
 */
router.post("/create-order", requireAuth, async (req, res) => {
  try {
    // Step 1: Extract and Validate Request
    if (!isProd) console.log('🔍 Debug: /create-order request body:', JSON.stringify(req.body, null, 2));

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

    if (!isProd) console.log(`✅ Payment validation passed for ${userEmail}`);

    // Step 2: Prepare Order Data
    const orderPayload = {
      amount: amount * 100,  // Convert rupees to paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
      notes: {
        email: userEmail,
        cart_items: JSON.stringify(items),
        preorder_time: null,
        phone_number: req.body.phoneNumber || null
      }
    };

    if (!isProd) console.log("🔧 Creating Razorpay order:", { amount: orderPayload.amount, currency: orderPayload.currency });

    // Step 3: Authentication Credentials
    const auth = {
      username: process.env.RAZORPAY_KEY_ID,
      password: process.env.RAZORPAY_SECRET
    };

    // Step 4: Call Razorpay API
    const axiosConfig = { auth };
    if (agent) axiosConfig.httpsAgent = agent;

    const response = await axios.post(
      "https://api.razorpay.com/v1/orders",
      orderPayload,
      axiosConfig
    );

    console.log(`✅ Razorpay order created: ${response.data.id}`);

    return res.status(200).json(response.data);

  } catch (error) {
    console.error("❌ Order Creation Process Failed");

    // Extract detailed error from Axios response if available
    const errorDetails = error.response ? error.response.data : error.message;
    const statusCode = error.response ? error.response.status : 500;

    console.error("🧨 Error Details:", JSON.stringify(errorDetails, null, 2));

    return res.status(statusCode).json({
      error: "Order creation failed",
      details: errorDetails
    });
  }
});

// ========================================
// ENDPOINT: Verify Payment
// ========================================

/**
 * Allow client-side verification of payment to triggering order creation.
 * Essential for environments where webhooks are unreliable or delayed (e.g. localhost).
 * Auth is intentionally omitted here because the razorpay_signature provides
 * unforgeable cryptographic proof of validity. We don't want to fail if the JWT
 * expired while the user was typing their OTP.
 * 
 * Method: POST
 * Path: /api/payment/verify-payment
 * Request Body: { razorpay_payment_id, razorpay_order_id, razorpay_signature }
 */
router.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!isProd) console.log(`🔍 Verifying payment from client: ${razorpay_payment_id}`);

    // Verify signature using the secret key (same as webhook verification logic)
    const crypto = require("crypto");
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest("hex");

    if (generated_signature !== razorpay_signature) {
      console.error("❌ Client payment verification failed: Invalid signature");
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    if (!isProd) console.log("✅ Client payment signature verified");

    // Fetch payment details from Razorpay to get amount and notes
    // We cannot trust client-provided notes/amount for order creation
    const auth = {
      username: process.env.RAZORPAY_KEY_ID,
      password: process.env.RAZORPAY_SECRET
    };

    const verifyConfig = { auth };
    if (agent) verifyConfig.httpsAgent = agent;

    const paymentDetails = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      verifyConfig
    );

    const payment = paymentDetails.data;

    // Use shared logic with webhook handler
    // ALWAYS use notes.email (our trusted source) over payment.email
    const result = await paymentFlowValidator.handlePaymentSuccess({
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      razorpaySignature: razorpay_signature,
      amount: payment.amount,
      currency: payment.currency,
      userEmail: payment.notes?.email || payment.email, // Our app email takes priority
      cartItems: payment.notes?.cart_items ? JSON.parse(payment.notes.cart_items) : [],
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

// ========================================
// ENDPOINT: Webhook
// ========================================

/**
 * Handle Razorpay webhooks.
 * 
 * Method: POST
 * Path: /api/payment/webhook
 */
router.post("/webhook", async (req, res) => {
  try {
    console.log("📥 Webhook received from Razorpay");

    // Step 1: Extract signature from headers
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
      console.error("❌ Webhook signature missing");
      return res.status(400).json({ error: "Signature missing" });
    }

    // Step 2: Verify webhook signature
    const isValid = await paymentFlowValidator.validateWebhookSignature(
      req.body,
      signature
    );

    if (!isValid) {
      console.error("❌ Webhook signature verification failed");
      return res.status(401).json({ error: "Invalid signature" });
    }

    console.log("✅ Webhook signature verified");

    // Step 3: Extract webhook data
    const event = req.body.event;
    const payload = req.body.payload.payment.entity;

    console.log(`📋 Webhook event: ${event}`);
    console.log(`💳 Payment ID: ${payload.id}`);

    // Step 4: Handle different webhook events
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

    // Step 5: Return 200 if processing was successful
    return res.status(200).json({ status: "ok" });

  } catch (error) {
    console.error("❌ Webhook processing error:", error);

    // IMPORTANT: Return 500 to tell Razorpay to retry this webhook later
    // This provides resilience against temporary database outages
    return res.status(500).json({ status: "error", message: "Internal server error during webhook processing" });
  }
});

/**
 * Helper: Handle successful payment webhook
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
      userEmail: payment.notes?.email || payment.email, // Our app email takes priority
      cartItems: payment.notes?.cart_items ? JSON.parse(payment.notes.cart_items) : [],
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
      // CRITICAL: We must throw here so the /webhook route catch block
      // captures it and returns a 500 Internal Server Error.
      // This tells Razorpay "we failed to save this, please retry the webhook later."
      throw new Error(`Payment processing failed: ${result.error}`);
    }

  } catch (error) {
    console.error("❌ Error handling payment success:", error);
    // Re-throw so the webhook route returns 500
    throw error;
  }
}

/**
 * Helper: Handle failed payment webhook
 */
async function handlePaymentFailure(payment) {
  try {
    const paymentData = {
      razorpayPaymentId: payment.id,
      razorpayOrderId: payment.order_id,
      amount: payment.amount,
      currency: payment.currency,
      userEmail: payment.notes?.email || payment.email, // Our app email takes priority
      errorReason: payment.error_description || 'Payment failed'
    };

    await paymentFlowValidator.handlePaymentFailure(paymentData);
    console.log(`⚠️ Payment failure recorded: ${paymentData.razorpayPaymentId}`);

  } catch (error) {
    console.error("❌ Error handling payment failure:", error);
  }
}

// Export Router
module.exports = router;
