---
description: End-to-end payment testing checklist using Razorpay Test Mode
---

# 💳 Test Payment Flow

**Environment**: `localhost:7070` (Dev)
**Mode**: Razorpay Test Mode

## 1. Setup
1. Ensure `.env` has `RAZORPAY_KEY_ID` starting with `rzp_test_`.
2. Start server: `node backend/server.js`.

## 2. User Flow (Frontend)
1. Go to **[Menu](http://localhost:7070/public/index.html)**.
2. Login (Email: `test@spoon.com`).
3. Add item to cart.
4. Click **Checkout**.
5. **Razorpay Popup**:
   - **Card**: `4111 1111 1111 1111`
   - **Expiry**: `12/30`
   - **CVV**: `123`
   - **OTP**: `1234`
6. Verify "Order Placed" toast appears.
7. Verify redirection to **Orders** page.

## 3. Data Verification (Database)
Run this query to confirm integrity:
```sql
SELECT 
    o.id, 
    o.status, 
    o.total, 
    pt.status as payment_status
FROM orders o
JOIN payment_transactions pt ON o.razorpay_payment_id = pt.razorpay_payment_id
ORDER BY o.created_at DESC 
LIMIT 1;
```
*Expected*: `o.status` = 'PLACED', `pt.status` = 'captured'

## 4. Admin Flow (Kitchen)
1. Go to **[Admin Dashboard](http://localhost:7070/admin/admin-mobile.html)**.
2. Verify order appears in **Active** tab.
3. Click **Ready** -> Verify moves to **Ready** tab.
4. Click **Picked Up** -> Verify removed from list.

## 🔴 Common Failure Points
- **Foreign Key Error**: `payment.email` vs `user.email` mismatch (Fixed in v1.1).
- **Webhook Failure**: If order created but status stuck at `PENDING` (Check `ngrok` if testing webhooks locally).
