/**
 * ========================================
 * SPOON - BACKEND SERVER
 * ========================================
 * 
 * PURPOSE:
 * This is the main server file that runs on Node.js.
 * It handles API requests from the frontend.
 * 
 * WHAT IT DOES:
 * 1. Sets up Express web server
 * 2. Enables CORS (allows frontend to call backend)
 * 3. Handles payment API routes
 * 4. Serves static frontend files
 * 
 * KEY CONCEPTS FOR INTERNS:
 * - Express: Web framework for Node.js (like Flask for Python)
 * - Middleware: Functions that process requests before they reach routes
 * - CORS: Cross-Origin Resource Sharing (security feature)
 * - Static files: HTML, CSS, JS files served directly
 * - Environment variables: Configuration stored in .env file
 * 
 * HOW TO RUN:
 * 1. Open terminal in project folder
 * 2. Run: node backend/server.js
 * 3. Server starts on http://localhost:7070
 */

// ========================================
// SECTION 1: IMPORT DEPENDENCIES
// ========================================

/**
 * IMPORT STATEMENTS
 * These load external libraries we need
 */

// Path: Helps work with file paths (imported first for dotenv)
const path = require("path");

// Load environment variables from .env file
// This keeps sensitive data (like API keys) out of code
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Express: Web server framework
const express = require("express");

// CORS: Allows frontend (different port) to call backend
const cors = require("cors");

// ========================================
// SECTION 2: CREATE EXPRESS APP
// ========================================

/**
 * Create Express application instance
 * This is our web server
 */
const app = express();

/**
 * Define port number
 * Server will listen on http://localhost:7070
 */
const PORT = 7070;

// ========================================
// SECTION 3: MIDDLEWARE SETUP
// ========================================

/**
 * MIDDLEWARE EXPLANATION:
 * Middleware functions run for every request before reaching routes.
 * Think of them as "checkpoints" that process requests.
 */

/**
 * CORS Middleware
 * Allows frontend (running on different port) to make requests
 * SECURITY FIX: Whitelist production domains
 */
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [
      'https://spoon.tcetswb.org',
      'https://admin.spoon.tcetswb.org',
      process.env.FRONTEND_URL
    ].filter(Boolean)
    : true,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

/**
 * JSON Parser Middleware
 * Automatically parses JSON data from request body
 * Makes req.body available in routes
 */
app.use(express.json());

// ========================================
// SECTION 4: RATE LIMITING (SECURITY FIX)
// ========================================

const rateLimit = require('express-rate-limit');

// Strict limiter for payments (prevent card testing/spam)
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per IP per window
  message: {
    success: false,
    error: 'Too many payment attempts, please try again after 15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// General limiter for other API endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per IP per window
  message: {
    success: false,
    error: 'Too many requests, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply limiters
app.use('/api/payment', paymentLimiter);
app.use('/api', apiLimiter);

// ========================================
// SECTION 5: API ROUTES
// ========================================

/**
 * CONFIG ROUTES
 * Serves public configuration to frontend
 * Example: GET /api/config
 */
const configRoutes = require("./routes/config");
app.use("/api/config", configRoutes);

/**
 * PAYMENT ROUTES
 * All routes starting with /api/payment go to payment router
 * Example: POST /api/payment/create-order
 */
const paymentRoutes = require("./routes/payment");
app.use("/api/payment", paymentRoutes);

/**
 * ORDERS ROUTES
 * All routes starting with /api/orders go to orders router
 * Example: PATCH /api/orders/:orderId/status
 * Handles order status updates with email notifications
 */
const ordersRoutes = require("./routes/orders");
app.use("/api/orders", ordersRoutes);

/**
 * AUTH ROUTES
 * All routes starting with /api/auth go to auth router
 * Example: POST /api/auth/send-otp, POST /api/auth/verify-otp
 * Handles OTP-based email authentication
 */
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

/**
 * HEALTH ROUTES
 * Health check endpoint for monitoring service availability
 * Example: GET /api/health
 * Checks Redis and Supabase connectivity
 */
const healthRoutes = require("./routes/health");
app.use("/api/health", healthRoutes);

/**
 * ADMIN ROUTES
 * Admin role verification endpoint
 * Example: GET /api/admin/verify
 * Validates JWT tokens and checks admin status in database
 */
const adminRoutes = require("./routes/admin");
app.use("/api/admin", adminRoutes);

// ========================================
// SECTION 5: SERVE FRONTEND FILES
// ========================================

/**
 * STATIC FILE SERVING
 * Serves HTML, CSS, JS files from parent directory
 * 
 * HOW IT WORKS:
 * - __dirname is current directory (backend/)
 * - "../" goes up one level to project root
 * - Express serves all files from there
 */
const publicDir = path.join(__dirname, "../");
app.use(express.static(publicDir));

/**
 * CATCH-ALL ROUTE
 * For any route not matched above, serve index.html
 * This enables client-side routing (SPA behavior)
 * 
 * LEARNING NOTE:
 * The "*" matches any route. This must be LAST
 * so it doesn't override other routes.
 */
app.get("*", (req, res) => {
  try {
    res.sendFile(path.join(publicDir, "index.html"));
  } catch (err) {
    console.error("💥 Error sending index.html:", err);
    res.status(500).send("Frontend not found");
  }
});

// ========================================
// SECTION 6: START SERVER
// ========================================

/**
 * START LISTENING FOR REQUESTS
 * 
 * HOW IT WORKS:
 * - Tells Express to listen on specified port
 * - Callback function runs once server is ready
 * - Server keeps running until you stop it (Ctrl+C)
 */
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📁 Serving files from: ${publicDir}`);
  console.log(`💳 Payment API available at: http://localhost:${PORT}/api/payment`);
  console.log(`\n✅ Ready to accept requests!`);
});
