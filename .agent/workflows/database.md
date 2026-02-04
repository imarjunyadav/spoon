---
description: Database inspection and specific Spoon application queries
---

# 🗄️ Database Operations

## Spoon-Specific Diagnostics

### 1. Identify Orphaned Transactions
Find payments that were successful in Razorpay but have no corresponding order (Critical bug check).
```sql
SELECT pt.razorpay_payment_id, pt.amount, pt.user_email, pt.created_at
FROM payment_transactions pt
LEFT JOIN orders o ON pt.razorpay_payment_id = o.razorpay_payment_id
WHERE pt.status = 'captured' 
  AND o.id IS NULL
ORDER BY pt.created_at DESC;
```

### 2. Check Order Status Distribution
See how many orders are in each state today.
```sql
SELECT status, COUNT(*) 
FROM orders 
WHERE created_at > CURRENT_DATE 
GROUP BY status;
```

### 3. Debug Missing Verification Codes
Find orders where code generation failed.
```sql
SELECT id, customer_email, status 
FROM orders 
WHERE verification_code IS NULL 
  AND status IN ('PLACED', 'PAID');
```

## Common Fixes

### Reset Stuck Order
If an order is stuck in 'PENDING' but payment was confirmed.
```sql
UPDATE orders 
SET status = 'PLACED' 
WHERE razorpay_payment_id = 'pay_INSERT_ID_HERE';
```

## General Operations

### View Tables
```
mcp_supabase-mcp-server_list_tables with project_id and schemas: ["public"]
```

### Run Migration
```
mcp_supabase-mcp-server_apply_migration with:
- project_id: YOUR_PROJECT_ID
- name: descriptive_migration_name
- query: YOUR_SQL
```
