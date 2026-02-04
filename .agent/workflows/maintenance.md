---
description: Weekly health checks and maintenance for Spoon
---

# 🛠️ Weekly Maintenance

## 1. Data Integrity Check (Critical)
Run this check to ensure no payments are "lost" (paid but no order).
```sql
-- Should return 0 rows
SELECT count(*) 
FROM payment_transactions pt 
LEFT JOIN orders o ON pt.razorpay_payment_id = o.razorpay_payment_id 
WHERE pt.status = 'captured' AND o.id IS NULL;
```

## 2. Table Cleanup
Remove old "picked up" orders to keep the admin dashboard fast.
**⚠️ Backup database before running!**

```sql
DELETE FROM orders 
WHERE status = 'PICKED_UP' 
AND created_at < NOW() - INTERVAL '30 days';
```

## 3. Security Audit
Use Supabase advisor to check for new vulnerabilities.
```
mcp_supabase-mcp-server_get_advisors with type: "security"
```
**Verify:**
- RLS policies on `users` and `orders` are active.
- No public write access to `payment_transactions`.

## 4. Resource Usage
Check if we are nearing free tier limits.
- **Supabase**: Check Database Size (500MB limit)
- **Upstash**: Check Daily Command Limit (10k)
- **Cloud Run**: Check Monthly Invocation Count

## 5. Local Repo Cleanup
// turbo
```bash
git fetch --prune
git gc
npm prune --production
```
