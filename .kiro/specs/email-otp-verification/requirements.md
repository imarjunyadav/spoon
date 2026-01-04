# Requirements Document

## Introduction

This feature implements real OTP (One-Time Password) verification for user authentication in the Spoon canteen ordering application. Currently, the OTP verification is simulated on the client-side. This feature will add server-side OTP generation, email delivery via Nodemailer, and secure verification to ensure only valid TCET students can access the platform.

## Glossary

- **OTP_Service**: The backend service responsible for generating, storing, and verifying one-time passwords
- **Email_Sender**: The Nodemailer-based component that delivers OTP emails to users
- **OTP**: A 4-digit numeric code valid for a limited time period
- **User_Email**: A valid email address in standard format (e.g., `user@example.com`)
- **Verification_Session**: A temporary record linking an email address to an OTP with expiration metadata

## Requirements

### Requirement 1: OTP Generation

**User Story:** As a user, I want to receive a unique OTP when I request verification, so that I can securely authenticate my identity.

#### Acceptance Criteria

1. WHEN a user requests OTP verification with a valid email address, THE OTP_Service SHALL generate a random 4-digit numeric code
2. THE OTP_Service SHALL ensure each generated OTP is cryptographically random
3. WHEN an OTP is generated, THE OTP_Service SHALL store it with the associated email and a 5-minute expiration timestamp
4. IF a user requests a new OTP while a previous one exists, THEN THE OTP_Service SHALL invalidate the previous OTP and generate a new one

### Requirement 2: OTP Email Delivery

**User Story:** As a user, I want to receive the OTP in my email, so that I can complete the verification process.

#### Acceptance Criteria

1. WHEN an OTP is generated, THE Email_Sender SHALL send an email to the user's email address within 10 seconds
2. THE Email_Sender SHALL include the 4-digit OTP prominently in the email body
3. THE Email_Sender SHALL include the expiration time (5 minutes) in the email
4. THE Email_Sender SHALL use a clear subject line indicating it is a SPOON verification code
5. IF email delivery fails, THEN THE OTP_Service SHALL return an error response to the client

### Requirement 3: OTP Verification

**User Story:** As a user, I want to verify my identity by entering the OTP I received, so that I can access the application.

#### Acceptance Criteria

1. WHEN a user submits an OTP, THE OTP_Service SHALL validate it against the stored OTP for that email
2. IF the submitted OTP matches the stored OTP and has not expired, THEN THE OTP_Service SHALL return a success response
3. IF the submitted OTP does not match, THEN THE OTP_Service SHALL return an invalid OTP error
4. IF the OTP has expired, THEN THE OTP_Service SHALL return an expiration error
5. WHEN an OTP is successfully verified, THE OTP_Service SHALL invalidate it to prevent reuse

### Requirement 4: Rate Limiting

**User Story:** As a system administrator, I want to prevent abuse of the OTP system, so that the service remains available and secure.

#### Acceptance Criteria

1. THE OTP_Service SHALL limit OTP requests to a maximum of 5 per email address within a 15-minute window
2. IF a user exceeds the rate limit, THEN THE OTP_Service SHALL return a rate limit error with retry time
3. THE OTP_Service SHALL limit OTP verification attempts to 5 per session before requiring a new OTP

### Requirement 5: Email Validation

**User Story:** As a system administrator, I want to ensure only valid email addresses can request OTPs, so that the system maintains data integrity.

#### Acceptance Criteria

1. WHEN an OTP request is received, THE OTP_Service SHALL validate the email format is a valid email address (contains @ and valid domain)
2. IF the email format is invalid, THEN THE OTP_Service SHALL return a validation error without generating an OTP

### Requirement 6: Frontend Integration

**User Story:** As a user, I want a seamless experience when verifying my email, so that I can quickly access the application.

#### Acceptance Criteria

1. WHEN the user enters their email on the login page, THE Frontend SHALL send an OTP request to the backend
2. WHEN the OTP is sent successfully, THE Frontend SHALL redirect to the OTP entry page
3. WHEN the user enters the OTP, THE Frontend SHALL send it to the backend for verification
4. IF verification succeeds for an existing user, THE Frontend SHALL redirect to the main application
5. IF verification succeeds for a new user, THE Frontend SHALL redirect to the signup page with the verified email
6. WHEN an error occurs, THE Frontend SHALL display a user-friendly error message
