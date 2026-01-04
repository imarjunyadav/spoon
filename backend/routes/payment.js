/**
 * ========================================
 * SPOON - PAYMENT API ROUTES
 * ========================================
 * 
 * PURPOSE:
 * This file handles payment-related API endpoints.
 * It creates Razorpay orders for processing payments.
 * 
 * WHAT IT DOES:
 * 1. Receives payment amount from frontend
 * 2. Creates order in Razorpay system
 * 3. Returns order details to frontend
 * 4. Frontend uses these details to open payment gateway
 * 
 * KEY CONCEPTS FOR INTERNS:
 * - Express Router: Modular route handlers
 * - Razorpay: Payment gateway service (like Stripe, PayPal)
 * - API endpoints: URLs that accept requests and return data
 * - Environment variables: Secure way to store API keys
 * - Async/await: Modern way to handle asynchronous operations
 * 
 * PAYMENT FLOW:
 * 1. User clicks "Pay" on frontend
 * 2. Frontend calls this API with amount
 * 3. This API creates Razorpay order
 * 4. Returns order ID to frontend
 * 5. Frontend opens Razorpay payment page
 * 6. User completes payment
 * 7. Razorpay notifies our app of success/failure
 */

// ========================================
// SECTION 1: IMPORT DEPENDENCIES
// ========================================

/**
 * IMPORT STATEMENTS
 */

// Express Router: For creating modular route handlers
const express = require("express");

// Razorpay: Payment gateway SDK
const Razorpay = require("razorpay");

// Axios: HTTP client for making API requests
const axios = require("axios");

// HTTPS: Node.js module for HTTPS requests
const https = require("https");

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
  // STEP 1: EXTRACT AND VALIDATE AMOUNT
  // ========================================
  
  /**
   * Get amount from request body
   * Frontend sends: { amount: 100 }
   */
  const { amount } = req.body;

  /**
   * VALIDATION: Check if amount exists
   * Return error if missing
   */
  if (!amount) {
    return res.status(400).json({ error: "Amount is required" });
  }

  // ========================================
  // STEP 2: PREPARE ORDER DATA
  // ========================================
  
  /**
   * CREATE ORDER PAYLOAD
   * 
   * LEARNING NOTE - PAISE CONVERSION:
   * Razorpay uses paise (smallest currency unit)
   * ₹1 = 100 paise
   * So we multiply amount by 100
   * Example: ₹50 becomes 5000 paise
   */
  const orderPayload = {
    amount: amount * 100,  // Convert rupees to paise
    currency: "INR",       // Indian Rupees
    receipt: `receipt_${Date.now()}`  // Unique receipt ID using timestamp
  };

  console.log("🔧 Creating order with:", orderPayload);

  // ========================================
  // STEP 3: AUTHENTICATION CREDENTIALS
  // ========================================
  
  /**
   * RAZORPAY AUTHENTICATION
   * 
   * LEARNING NOTE:
   * Razorpay uses Basic Authentication
   * - username: Your Key ID
   * - password: Your Key Secret
   * These come from .env file for security
   */
  const auth = {
    username: process.env.RAZORPAY_KEY_ID,
    password: process.env.RAZORPAY_SECRET
  };

  // ========================================
  // STEP 4: CALL RAZORPAY API
  // ========================================
  
  /**
   * TRY-CATCH BLOCK
   * Handles errors gracefully if API call fails
   */
  try {
    /**
     * MAKE API REQUEST TO RAZORPAY
     * 
     * LEARNING NOTE - ASYNC/AWAIT:
     * - 'await' pauses execution until API responds
     * - This is cleaner than using .then() callbacks
     * - Must be inside 'async' function
     */
    const response = await axios.post(
      "https://api.razorpay.com/v1/orders",  // Razorpay API endpoint
      orderPayload,                           // Data to send
      { 
        auth,                                 // Authentication credentials
        httpsAgent: agent                     // HTTPS configuration
      }
    );

    /**
     * SUCCESS: Return order data to frontend
     * 
     * response.data contains:
     * - id: Order ID (needed for payment)
     * - amount: Amount in paise
     * - currency: INR
     * - status: created
     */
    return res.status(200).json(response.data);
    
  } catch (error) {
    /**
     * ERROR HANDLING
     * If Razorpay API fails, log error and return error response
     */
    console.error("❌ Razorpay Order Creation Failed");
    console.error("🧨 Error:", error.message || error);
    
    return res.status(500).json({ 
      error: "Order creation failed", 
      details: error.message 
    });
  }
});

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
