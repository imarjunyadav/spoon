# Implementation Plan: OTP Scaling for Production

## Overview

This plan upgrades the OTP system from in-memory MVP to production-ready infrastructure with Redis for OTP/rate-limiting storage and Supabase for user persistence.

## Tasks

- [ ] 1. Set up Redis infrastructure
  - [ ] 1.1 Install ioredis package
    - Run `npm install ioredis`
    - _Requirements: 1.1, 5.1_

  - [ ] 1.2 Create Redis client service (`backend/services/redisClient.js`)
    - Configure connection from REDIS_URL environment variable
    - Implement connection error handling and reconnection
    - Export singleton client instance
    - Implement `isConnected()` and `disconnect()` methods
    - _Requirements: 5.1, 5.4_

  - [ ] 1.3 Update .env.example with Redis configuration
    - Add REDIS_URL variable
    - Add REDIS_PASSWORD (optional)
    - _Requirements: 5.1_

- [ ] 2. Create Redis-based OTP Store
  - [ ] 2.1 Create Redis OTP Store (`backend/services/redisOtpStore.js`)
    - Implement `generateOTP(email)` - same logic as before
    - Implement `storeOTP(email, otp)` - use SETEX with 5-min TTL
    - Implement `verifyOTP(email, otp)` - GET, validate, DEL on success
    - Implement `checkRateLimit(email)` - INCR with EXPIRE for sliding window
    - Implement `incrementAttempts(email)` - track verification attempts
    - Use key patterns: `otp:{email}`, `rate:{email}`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.4_

  - [ ] 2.2 Write property tests for Redis OTP Store
    - **Property 1: Redis OTP Storage Round-Trip**
    - **Property 2: Rate Limit Enforcement with Retry-After**
    - **Validates: Requirements 1.1, 2.2, 2.4**

- [ ] 3. Create Supabase User Service
  - [ ] 3.1 Create Supabase migration for users table
    - Create `backend/database/migrations/001_create_users_table.sql`
    - Define schema: email (PK), name, created_at, updated_at
    - _Requirements: 3.5_

  - [ ] 3.2 Create User Service (`backend/services/userService.js`)
    - Initialize Supabase client with service role key
    - Implement `createUser(email, name)` - INSERT into users table
    - Implement `getUserByEmail(email)` - SELECT by email
    - Implement `userExists(email)` - check if email exists
    - Handle errors gracefully (duplicate email, connection issues)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 3.3 Write property tests for User Service
    - **Property 3: User Creation with Required Fields**
    - **Property 4: User Lookup Round-Trip**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.5**

- [ ] 4. Update Auth Routes for Production
  - [ ] 4.1 Update auth.js to use Redis OTP Store
    - Import redisOtpStore instead of otpStore
    - Add service availability check before operations
    - Update error handling for Redis failures
    - _Requirements: 1.5, 4.1_

  - [ ] 4.2 Add signup endpoint to auth.js
    - Implement `POST /api/auth/signup` endpoint
    - Accept { email, name } in request body
    - Call userService.createUser()
    - Return created user or error
    - _Requirements: 3.1, 6.1_

  - [ ] 4.3 Update verify-otp endpoint
    - After successful verification, check if user exists in Supabase
    - Return isNewUser: true/false based on Supabase lookup
    - Return user data if exists
    - _Requirements: 3.2, 6.2_

  - [ ] 4.4 Write property test for email failure handling
    - **Property 5: Email Failure Prevents OTP Storage**
    - **Validates: Requirements 4.3**

- [ ] 5. Create Health Check Endpoint
  - [ ] 5.1 Create health routes (`backend/routes/health.js`)
    - Implement `GET /api/health` endpoint
    - Check Redis connectivity
    - Check Supabase connectivity
    - Return status: healthy/degraded/unhealthy
    - _Requirements: 5.2_

  - [ ] 5.2 Register health routes in server.js
    - Add `app.use("/api/health", healthRoutes)`
    - _Requirements: 5.2_

- [ ] 6. Update Frontend for Supabase Users
  - [ ] 6.1 Update signup.js to call backend
    - Replace localStorage-only signup with API call
    - Call `POST /api/auth/signup` with email and name
    - Handle success/error responses
    - Store user data from response
    - _Requirements: 6.1_

  - [ ] 6.2 Update otp.js to handle user data
    - Use isNewUser from verify-otp response
    - Store user data if returned (existing user)
    - _Requirements: 6.2, 6.3_

- [ ] 7. Checkpoint - Integration verification
  - Ensure Redis is running locally or configure cloud Redis
  - Run Supabase migration to create users table
  - Test complete flow: Login → OTP → Verify → Signup/Home
  - Verify health endpoint returns correct status
  - Ensure all tests pass

## Notes

- Redis must be running before starting the server
- Run the Supabase migration manually: copy SQL to Supabase SQL editor
- For local development, use `redis://localhost:6379`
- For production, use a managed Redis service (Upstash, Redis Cloud, etc.)
- The in-memory otpStore.js is kept as reference but not used

