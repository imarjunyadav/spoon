---
description: Test payment flow end-to-end
---

# Test Payment Flow

## Prerequisites
- Server running on localhost:7070
- Razorpay test mode enabled
- Test user logged in

## Test Credentials (Razorpay Test Mode)
- **Card**: 4111 1111 1111 1111
- **Expiry**: Any future date
- **CVV**: Any 3 digits
- **OTP**: 1234 (for 3D Secure)

## Steps

### 1. Start Server
Use `/server` workflow

### 2. Open User App
Navigate to: http://localhost:7070/public/index.html

### 3. Login
- Use valid email
- Get OTP from email or server logs (in-memory fallback)

### 4. Add Items to Cart
- Add at least one item
- Verify cart total

### 5. Checkout
- Click "Place Order"
- Complete Razorpay payment

### 6. Verify Order Created
Check database:
```sql
SELECT id, status, total, verification_code 
FROM orders 
ORDER BY created_at DESC 
LIMIT 1;
```

### 7. Test Admin Flow
- Open: http://localhost:7070/admin/admin-mobile.html
- Login with admin email
- Find the order in Active tab
- Mark as Complete
- Verify in Ready tab
- Mark as Picked Up

## Expected Results
| Step | Expected |
|------|----------|
| Payment | Success toast, redirect to orders |
| Order Status | PLACED or PENDING |
| Verification Code | 4-digit code generated |
| Admin View | Order visible in Active tab |
| After Complete | Moves to Ready tab |
| After Pickup | Disappears from Ready tab |
