---
description: SPOON — Backend Review 
---

SPOON_Backend_Review:

  SECTION_1_UNIVERSAL_CHECKS:
    Code_Quality:
      - Functions follow single responsibility
      - Descriptive variable and function names
      - No dead code (unused vars, commented blocks, unused functions)
      - No hardcoded values (use env/config)
      - Error handling on all async operations
      - No console.log in production (use logger)

    Security:
      - Validate and sanitize all user input
      - Parameterized DB queries only (no string concat)
      - No sensitive data exposed in responses
      - No hardcoded secrets or API keys

    Error_Handling:
      - No silent try/catch blocks
      - Proper HTTP status codes returned
      - External failures handled gracefully (email, payment)

  SECTION_2_SERVER_ENTRY:
    Middleware_Order:
      - JSON parser before routes
      - CORS restricted to frontend (no wildcard)
      - Global error handler at bottom
      - 404 handler present

    Security_Middleware:
      - helmet enabled
      - rate limiting applied
      - request body size limit enforced

    Environment:
      - PORT from env
      - all secrets from process.env
      - required env vars validated on startup

    Startup:
      - DB connection tested before start
      - fail fast if DB connection fails

  SECTION_3_ROUTES:
    Access_Control:
      - authentication applied where needed
      - authorization enforced per action

    Validation:
      - request body validated
      - URL params validated
      - correct HTTP methods used
      - correct HTTP status codes returned
      - rate limiting on write endpoints

    Business_Logic:
      - logic extracted to services/helpers
      - route handlers small and readable
      - handle null/empty DB responses

    Concurrency:
      - no unsafe read-then-write
      - use transactions/atomic operations
      - prevent duplicate requests

  SECTION_4_MIDDLEWARE:
    Auth:
      - JWT verified correctly
      - token expiry checked
      - invalid token returns 401
      - user attached to req.user
      - admin checks separated

    Validation:
      - validation before handler
      - return 400 with clear errors
      - all inputs validated

    Rate_Limiting:
      - key based on user ID
      - endpoint-specific limits
      - return 429 with Retry-After

  SECTION_5_DATABASE:
    Connection:
      - single Supabase client reused
      - uses transaction pooler (6543)
      - env-based configuration only

    Queries:
      - handle zero results
      - correct use of single/maybeSingle
      - avoid select *
      - no N+1 queries

    Concurrency_RPC:
      - use transactions/stored procedures
      - slot assignment uses FOR UPDATE SKIP LOCKED
      - validate status transitions

    Data_Integrity:
      - DB constraints present
      - soft delete where required
      - cleanup only for terminal states

  SECTION_6_REALTIME:
    Connection:
      - reconnect with exponential backoff (max 5s)
      - fetch missed state on reconnect

    Events:
      - INSERT adds item only
      - UPDATE patches item only
      - DELETE removes item only
      - connection status indicator visible

    Scope:
      - subscribe only to required events
      - cleanup on unmount

  SECTION_7_ORDER_FLOW:
    Placement:
      - capacity enforced server-side
      - prevent duplicate rapid orders
      - clear failure responses

    State_Machine:
      Valid:
        - pending_to_kitchen
        - kitchen_to_prepared
        - prepared_to_collected
        - any_to_cancelled
      Invalid:
        - backward transitions
        - collected_to_any
        - cancelled_to_any
      - transitions enforced and idempotent

    Slot_Assignment:
      - atomic DB operation
      - full capacity returns 409
      - slot freed immediately after collection
      - fresh config read every time

    Break_Mode:
      - stored in DB
      - handles in-flight orders
      - returns 503 with message

  Payment:
    - payment and order creation atomic or recoverable
    - no order on failed payment
    - recovery for success-before-crash
    - webhook signature verified
    - prevent replay attacks
    - validate amount server-side
    - explicit payment status column

  SECTION_8_EMAIL:
    Trigger:
      - DB-triggered if possible
      - retry on failure
      - async (non-blocking)

    Content:
      - includes order details
      - excludes slot number initially
      - includes time constraints

  SECTION_9_FRONTEND:
    API:
      - JWT sent on protected requests
      - token refresh handled
      - user-friendly error messages

    State:
      - single source of truth
      - realtime reconciles cleanly

    Admin_UX:
      - disable buttons on click
      - loading indicators present
      - slot number clearly visible
      - connection status always visible

  SECTION_10_PERFORMANCE:
    Cloud_Run:
      - min instances >= 1
      - concurrency configured
      - no static files served

    Caching:
      - menu cached (TTL ~30s)
      - immediate invalidation on updates

    Database:
      - indexes on key fields
      - no full table scans
      - connection pooling used

  SECTION_11_ENV_DEPLOYMENT:
    Required_Env:
      - SUPABASE_URL
      - SUPABASE_ANON_KEY
      - SUPABASE_SERVICE_ROLE_KEY
      - JWT_SECRET
      - RESEND_API_KEY
      - PORT
      - NODE_ENV
      - FRONTEND_URL

    Cloud_Run:
      - NODE_ENV=production
      - least privilege service account
      - secrets in Secret Manager

    Docker:
      - .dockerignore excludes sensitive/dev files
      - npm install --omit=dev
      - service worker versioned

  SECTION_12_TESTING:
    Monitoring:
      - Cloud Run logs active
      - Supabase logs open

    Chaos_Tests:
      - DB failure handled gracefully
      - realtime disconnect recovery
      - concurrent orders safe
      - cold start latency measured
      - load test stability

  SECTION_13_API_SECURITY:
    Auth:
      - no token returns 401
      - invalid token returns 401
      - wrong role returns 403

    Ownership:
      - users cannot act on others' data

    Injection:
      - SQL/XSS inputs rejected (400)

    Logic_Bypass:
      - invalid transitions blocked
      - duplicate actions prevented

    Rate_Limit:
      - excessive requests return 429

    Webhook:
      - replay safe
      - signature verification required