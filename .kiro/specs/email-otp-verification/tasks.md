# Implementation Plan: Email OTP Verification

## Overview

This plan implements real email-based OTP verification for the Spoon canteen application, replacing the current simulated client-side OTP with secure server-side generation and verification using Nodemailer.

## Tasks

- [ ] 1. Set up backend OTP infrastructure
  - [x] 1.1 Create OTP Store service (`backend/services/otpStore.js`)
    - Implement in-memory Map for OTP sessions
    - Implement `generateOTP(email)` - generates 4-digit random code
    - Implement `storeOTP(email, otp)` - stores with 5-min expiry
    - Implement `verifyOTP(email, otp)` - validates and invalidates on success
    - Implement `checkRateLimit(email)` - enforces 5 requests per 15 min
    - Implement `incrementAttempts(email)` - tracks verification attempts
    - Implement automatic cleanup of expired entries
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.5, 4.1, 4.3_

  - [x] 1.2 Write property tests for OTP Store
    - **Property 1: OTP Format Invariant**
    - **Property 3: OTP Storage Round-Trip**
    - **Property 4: OTP Replacement Invalidation**
    - **Property 6: Wrong OTP Rejection**
    - **Property 7: Single-Use Enforcement**
    - **Property 8: Rate Limit Enforcement**
    - **Property 9: Verification Attempt Limit**
    - **Validates: Requirements 1.1, 1.3, 1.4, 3.1, 3.3, 3.5, 4.1, 4.3**

- [ ] 2. Create Email Service for OTP delivery
  - [x] 2.1 Create Email Service (`backend/services/emailService.js`)
    - Extract Nodemailer transporter setup from orders.js
    - Implement `sendOTPEmail(email, otp)` function
    - Create HTML email template with OTP and expiry info
    - Handle email delivery errors gracefully
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 2.2 Write property test for email content
    - **Property 5: Email Content Contains OTP**
    - **Validates: Requirements 2.2**

- [x] 3. Create Auth API routes
  - [x] 3.1 Create Auth routes (`backend/routes/auth.js`)
    - Implement `POST /api/auth/send-otp` endpoint
    - Implement `POST /api/auth/verify-otp` endpoint
    - Add email format validation
    - Integrate OTP Store and Email Service
    - Return appropriate error responses
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.2, 5.1, 5.2_

  - [x] 3.2 Write property test for email validation
    - **Property 10: Invalid Email Rejection**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 3.3 Register auth routes in server.js
    - Add `app.use("/api/auth", authRoutes)`
    - _Requirements: 3.1_

- [x] 4. Checkpoint - Backend verification
  - Ensure all backend tests pass
  - Test endpoints manually with Postman/curl
  - Ask the user if questions arise

- [x] 5. Update frontend login flow
  - [x] 5.1 Update login.html
    - Change phone input to email input
    - Update labels and placeholders
    - Update form validation message
    - _Requirements: 6.1_

  - [x] 5.2 Update login.js
    - Change phone validation to email validation
    - Call `POST /api/auth/send-otp` on form submit
    - Handle loading state during API call
    - Handle success (redirect to OTP page with email param)
    - Handle errors (display user-friendly message)
    - _Requirements: 6.1, 6.2, 6.6_

- [x] 6. Update frontend OTP verification flow
  - [x] 6.1 Update otp.html
    - Update subtitle to show email instead of phone
    - _Requirements: 6.2_

  - [x] 6.2 Update otp.js
    - Read email from URL params instead of phone
    - Call `POST /api/auth/verify-otp` on OTP submit
    - Handle success for existing user (redirect to home)
    - Handle success for new user (redirect to signup with email)
    - Handle errors (invalid OTP, expired, rate limited)
    - Update resend OTP to call backend API
    - _Requirements: 6.3, 6.4, 6.5, 6.6_

- [x] 7. Update frontend signup flow
  - [x] 7.1 Update signup.html
    - Remove phone number field (email is now primary)
    - Add optional phone field for order notifications
    - _Requirements: 6.5_

  - [x] 7.2 Update signup.js
    - Read verified email from URL params
    - Remove TCET email validation (email already verified)
    - Display verified email as read-only
    - Update user creation to use email as identifier
    - Update localStorage keys to use email instead of phone
    - _Requirements: 6.5_

- [x] 8. Update .env.example
  - Ensure SMTP credentials are documented
  - Add any new environment variables if needed
  - _Requirements: 2.1_

- [x] 9. Final checkpoint - Full integration
  - Test complete flow: Login → OTP → Verify → Signup/Home
  - Test error scenarios: invalid email, wrong OTP, expired OTP
  - Test rate limiting behavior
  - Ensure all tests pass
  - Ask the user if questions arise

## Notes

- All tasks including property-based tests are required
- The implementation uses in-memory storage suitable for single-server MVP
- Existing Nodemailer configuration from order notifications is reused
- Frontend changes maintain backward compatibility with existing UI styles
