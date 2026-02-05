---
description: Workflows for verifying and maintaining application security
---

# 🛡️ Spoon Security Operations

This workflow guide focuses on **verifying** and **maintaining** the security controls implemented in the Spoon workspace.

## 🔍 Routine Security Audit (Weekly)

### 1. Database Security Check (RLS & Policies)
Use the Supabase MCP tool to check for vulnerabilities.
```
mcp_supabase-mcp-server_get_advisors with type: "security"
```
**Look for:**
- `orders` table having public DELETE/UPDATE policies (Should be strictly prohibited).
- `payment_transactions` having public WRITE access (Must be Service Role only).
- `users` table allowing unauthenticated reads.

### 2. Verify RLS Policies Manually
Run this SQL to ensure only "safe" policies exist.
```sql
SELECT tablename, policyname, cmd, roles 
FROM pg_policies 
WHERE tablename IN ('orders', 'users', 'payment_transactions');
```
*Expected:*
- `orders`: "Allow public read orders" (SELECT), "Allow authorized insert" (INSERT)
- `users`: "Users can read own data" (SELECT)
- `payment_transactions`: No public policies (Implicit deny)

### 3. Check for Orphaned Payments (Financial Integrity)
Detect if any payments were captured without a corresponding order (potential exploit or bug).
```sql
SELECT pt.razorpay_payment_id, pt.amount, pt.user_email
FROM payment_transactions pt
LEFT JOIN orders o ON pt.razorpay_payment_id = o.razorpay_payment_id
WHERE pt.status = 'captured' 
  AND o.id IS NULL
  AND pt.created_at > NOW() - INTERVAL '7 days';
```

---

## 🧪 Verification Workflows

### 1. Test API Rate Limiting
Verify that `express-rate-limit` is active on production endpoints.
**Command:**
```powershell
# Send 15 requests quickly
1..15 | % { curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7070/api/payment/initiate }
```
*Expected:* First 10 requests return `200`, subsequent requests return `429 Too Many Requests`.

### 2. Test Price Manipulation (Server-Side Validation)
Verify backend rejects orders with tampered prices.
**Action:**
1. Login to Spoon.
2. Open DevTools console.
3. Fetch the `cart` from localStorage.
4. Modify an item's price to `1`.
5. Try to place order.
*Expected:* Error toast "Price mismatch detected". Backend logs `❌ Price mismatch detected!`.

### 3. Test Unauthorized Admin Access
Verify that order status updates require a valid Admin Token.
**Command:**
```bash
curl -X PATCH http://localhost:7070/api/orders/TEST_ID/status \
  -H "Content-Type: application/json" \
  -d '{"status": "COMPLETE"}'
```
*Expected:* `401 Unauthorized` (Authentication required).

---

## 🚨 Incident Response

### Scenario A: Suspicious "Paid" Orders with No Payment
If you see an order marked `PAID` but no record in `payment_transactions`:
1. **Quarantine Order:**
   ```sql
   UPDATE orders SET status = 'CANCELLED', notes = 'Security Review' WHERE id = 'ORDER_ID';
   ```
2. **Check Razorpay Dashboard:** Verify if `razorpay_payment_id` exists in Razorpay.
3. **Audit User:** Check user's IP and recent activity.

### Scenario B: Mass OTP Request Attack
If Redis logs show high activity or email provider complains:
1. **Block IP/Email in Redis:**
   ```javascript
   // In backend console provided by run_command
   redisClient.setex('rate:block:attacker@email.com', 86400, '1');
   ```
2. **Increase Rate Limit:**
   Modify `backend/services/redisOtpStore.js`:
   `const RATE_LIMIT_WINDOW_SECONDS = 30 * 60; // Increase to 30 mins`

---

## 🔑 Configuration Reference

| Security Layer | File | Key Settings |
|----------------|------|--------------|
| **CORS** | `backend/server.js` | `process.env.FRONTEND_URL` whitelist |
| **Rate Limit** | `backend/server.js` | 10 per 15min (Payment), 100 per 1min (API) |
| **Auth** | `backend/services/adminService.js` | JWT verification for Admin routes |
| **Price Check** | `backend/services/paymentFlowValidator.js` | `menu_items` DB lookup |
| **OTP** | `backend/services/redisOtpStore.js` | 5 attempts/15min, 5-min expiry |

---

## 🛑 Critical "Do Not Touch"
*Never modify these without full security review:*
1. **`paymentFlowValidator.js`**: The `validatePaymentInitiation` logic.
2. **Supabase RLS on `payment_transactions`**: Must remain private.
3. **`server.js` CORS logic**: Do not change to `origin: '*'`.
