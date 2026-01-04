# Requirements Document

## Introduction

This feature upgrades the existing email OTP verification system from MVP (single-server, in-memory storage) to production-ready infrastructure capable of handling 500 concurrent users. The upgrade focuses on persistent storage with Redis, user management with Supabase, and scalable email delivery.

## Glossary

- **Redis_Store**: Redis-based storage service for OTP sessions and rate limiting with automatic TTL expiration
- **User_Service**: Backend service that manages user records in Supabase database
- **OTP_Session**: A temporary record containing email, OTP code, expiration time, and attempt count stored in Redis
- **Rate_Limit_Entry**: A Redis key tracking OTP request count per email with sliding window expiration
- **Supabase_Users_Table**: Persistent database table storing verified user accounts

## Requirements

### Requirement 1: Redis-Based OTP Storage

**User Story:** As a system operator, I want OTP sessions stored in Redis, so that the system can handle concurrent users and survive server restarts.

#### Acceptance Criteria

1. WHEN an OTP is generated, THE Redis_Store SHALL store it with a 5-minute TTL (time-to-live)
2. WHEN an OTP expires, THE Redis_Store SHALL automatically delete the entry via TTL
3. WHEN the server restarts, THE Redis_Store SHALL retain all unexpired OTP sessions
4. THE Redis_Store SHALL support at least 500 concurrent OTP sessions without performance degradation
5. WHEN Redis connection fails, THE OTP_Service SHALL return a service unavailable error

### Requirement 2: Redis-Based Rate Limiting

**User Story:** As a system administrator, I want rate limiting stored in Redis, so that limits are enforced consistently across server restarts and potential horizontal scaling.

#### Acceptance Criteria

1. THE Redis_Store SHALL track OTP request counts per email using sliding window rate limiting
2. WHEN an email exceeds 5 requests in 15 minutes, THE Redis_Store SHALL reject further requests
3. THE Redis_Store SHALL automatically expire rate limit entries after the window period
4. WHEN checking rate limits, THE Redis_Store SHALL return the retry-after time in seconds

### Requirement 3: Supabase User Persistence

**User Story:** As a user, I want my account stored permanently, so that I can log in from any device after signing up.

#### Acceptance Criteria

1. WHEN a new user completes signup, THE User_Service SHALL create a record in the Supabase users table
2. WHEN verifying OTP for an existing email, THE User_Service SHALL return the user record from Supabase
3. THE User_Service SHALL use email as the unique identifier for user records
4. WHEN a database operation fails, THE User_Service SHALL return an appropriate error response
5. THE Supabase_Users_Table SHALL store: email (primary key), name, created_at, updated_at

### Requirement 4: Graceful Degradation

**User Story:** As a system operator, I want the system to handle failures gracefully, so that users receive clear feedback when services are unavailable.

#### Acceptance Criteria

1. IF Redis is unavailable, THEN THE OTP_Service SHALL return a 503 Service Unavailable error with a retry message
2. IF Supabase is unavailable, THEN THE User_Service SHALL return a 503 Service Unavailable error
3. IF email sending fails, THEN THE OTP_Service SHALL NOT store the OTP and SHALL return an error
4. WHEN any service error occurs, THE System SHALL log the error with sufficient detail for debugging

### Requirement 5: Connection Management

**User Story:** As a system operator, I want proper connection pooling and health checks, so that the system maintains stable connections under load.

#### Acceptance Criteria

1. THE Redis_Store SHALL maintain a connection pool with automatic reconnection on failure
2. THE System SHALL expose a health check endpoint that verifies Redis and Supabase connectivity
3. WHEN starting up, THE Server SHALL verify Redis connection before accepting requests
4. THE Redis_Store SHALL use connection timeouts to prevent hanging requests

### Requirement 6: Frontend User Persistence

**User Story:** As a user, I want to stay logged in and have my account recognized across sessions, so that I don't need to re-verify my email every time.

#### Acceptance Criteria

1. WHEN signup completes, THE Frontend SHALL call the backend to create the user in Supabase
2. WHEN OTP verification succeeds, THE Frontend SHALL check with backend if user exists in Supabase
3. WHEN an existing user logs in, THE Frontend SHALL retrieve and store user data from the backend response
4. THE Frontend SHALL store a session token or user identifier for subsequent requests

