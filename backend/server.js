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

// Helmet: Secure HTTP response headers
const helmet = require("helmet");

// ========================================
// SECTION 2: CREATE EXPRESS APP
// ========================================

/**
 * Create Express application instance
 * This is our web server
 */
const app = express();

// SECURITY FIX: Trust Cloud Run proxy (required for rate limiting)
app.set('trust proxy', 1);

/**
 * SECURITY: Helmet sets safe HTTP response headers (HSTS, X-Content-Type-Options,
 * X-Frame-Options, Referrer-Policy, etc.).
 *
 * The three policies below are intentionally DISABLED because this single server
 * also serves the static frontend + admin dashboard, which rely on:
 *  - inline <script> tags and external CDNs (Razorpay checkout, Supabase) -> CSP off
 *  - the Razorpay checkout popup/callback flow                            -> COOP off
 *  - assets shared across the spoon.* and admin.spoon.* subdomains        -> CORP off
 * Enabling any of them without first tailoring an allowlist would break the app.
 */
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false
}));

/**
 * Define port number
 * Server will listen on http://localhost:7070
 */
const PORT = process.env.PORT || 7070;

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
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

/**
 * JSON Parser Middleware
 * Automatically parses JSON data from request body.
 * SECURITY FIX: We save the raw buffer exactly as received into `req.rawBody`
 * solely for the /api/payment/webhook route. Razorpay's HMAC signature validation
 * structurally requires the pure byte-string. If we use Node's `JSON.stringify()`, 
 * the object-key reordering will break the cryptographic hash.
 */
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.originalUrl.includes('/api/payment/webhook')) {
      req.rawBody = buf.toString();
    }
  }
}));

// ========================================
// SECTION 4: RATE LIMITING (SECURITY FIX)
// ========================================

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit; // v8 helper: IPv6-safe key normalization

// Real client IP even when fronted by Firebase Hosting. Firebase's CDN (Fastly) sets
// Fastly-Client-IP to the true client and overwrites any client-supplied value, so it
// can't be spoofed through Firebase. Without it, X-Forwarded-For/req.ip would show a
// Fastly/Google edge IP and collapse all students onto a few IPs. Falls back to req.ip
// (trust proxy=1 => real client) for direct run.app access.
const clientIpKey = (req) => ipKeyGenerator(req.headers['fastly-client-ip'] || req.ip);

// Strict limiter for payments (prevent card testing/spam)
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // Raised for institution-scale usage: thousands of students share a handful of
  // campus NAT IPs, so a low per-IP cap would wrongly throttle legitimate checkouts.
  // Still bounds a single abusive IP (card testing). Tune down if abuse is observed.
  max: 1000, // per IP per 15 min
  message: {
    success: false,
    error: 'Too many payment attempts, please try again after 15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: clientIpKey, // real client IP even behind Firebase (not the Fastly/CDN edge IP)
  // Never rate-limit Razorpay's server-to-server webhook: it arrives from Razorpay's
  // own IPs and must always be processed so orders confirm/reconcile.
  skip: (req) => req.originalUrl.startsWith('/api/payment/webhook'),
});

// General limiter for other API endpoints
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  // Raised for institution-scale usage behind shared campus NAT (thousands of
  // students + the session heartbeat all egress from a few public IPs). Still stops
  // a single runaway/abusive IP. Tune after observing real traffic.
  max: 6000, // per IP per minute
  message: {
    success: false,
    error: 'Too many requests, please slow down'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey, // real client IP even behind Firebase (not the Fastly/CDN edge IP)
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
 * PUSH NOTIFICATION ROUTES
 * Subscription management for Web Push
 */
const pushRoutes = require("./routes/push");
app.use("/api/push", pushRoutes);

/**
 * USER PUSH ROUTES
 * Web Push subscription management for logged-in students (separate from the
 * admin push routes above). Example: POST /api/user-push/subscribe
 */
const userPushRoutes = require("./routes/userPush");
app.use("/api/user-push", userPushRoutes);

/**
 * ADMIN ROUTES
 * Admin role verification endpoint
 * Example: GET /api/admin/verify
 * Validates JWT tokens and checks admin status in database
 */
const adminRoutes = require("./routes/admin");
app.use("/api/admin", adminRoutes);

/**
 * WALLET ROUTES
 * eWallet coin management for pre-order cancellation refunds
 * Example: GET /api/wallet/balance, POST /api/wallet/pay
 */
const walletRoutes = require("./routes/wallet");
app.use("/api/wallet", walletRoutes);

/**
 * SETTINGS ROUTES
 * Admin-only endpoints to configure system settings (e.g., slot capacity)
 */
const settingsRoutes = require("./routes/settings");
app.use("/api/settings", settingsRoutes);

/**
 * STATIC FILE SERVING
 * Serves files from project root directory
 * 
 * HTML files use relative paths like "../css/menu.css"
 * We serve everything from root so these paths resolve correctly.
 */
const rootDir = path.join(__dirname, "../");

// SECURITY: serve ONLY the frontend asset directories, not the repo root. Serving
// the whole root (the previous behavior) also exposed backend source, deploy.ps1,
// the Dockerfile, and package files as downloadable static files. These explicit
// mounts keep every real frontend asset working while blocking everything else.
app.use("/public", express.static(path.join(rootDir, "public")));
app.use("/css", express.static(path.join(rootDir, "css")));
app.use("/js", express.static(path.join(rootDir, "js")));
app.use("/admin", express.static(path.join(rootDir, "admin")));

// Individual root-level files that must be reachable at the site root.
app.get("/favicon.svg", (req, res) => res.sendFile(path.join(rootDir, "favicon.svg")));
app.get("/sw.js", (req, res) => res.sendFile(path.join(rootDir, "sw.js")));
app.get("/manifest.json", (req, res) => res.sendFile(path.join(rootDir, "manifest.json")));

/**
 * ROOT ROUTE
 * Redirect root URL to the public folder's index.html
 */
app.get("/", (req, res) => {
  res.redirect("/public/index.html");
});

// ========================================
// GLOBAL ERROR HANDLER (must be after all routes)
// ========================================

/**
 * Catches synchronous throws and explicit `next(err)` calls from routes.
 * Existing route handlers all use their own try/catch and return their own
 * responses, so this does NOT change any existing success/error behavior — it
 * is purely a safety net for unexpected/unhandled errors that would otherwise
 * fall through to Express's default HTML error page.
 */
app.use((err, req, res, next) => {
  console.error("🧨 Unhandled error:", err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    success: false,
    error: "Internal server error"
  });
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
  console.log(`📁 Serving files from: ${rootDir}`);
  console.log(`💳 Payment API available at: http://localhost:${PORT}/api/payment`);
  console.log(`\n✅ Ready to accept requests!`);
});
