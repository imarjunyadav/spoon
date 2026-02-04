---
description: Run Supabase database migrations and queries
---

# Database Operations

## View Current Tables
Use Supabase MCP tool:
```
mcp_supabase-mcp-server_list_tables with project_id and schemas: ["public"]
```

## Run a Migration (DDL)
Use Supabase MCP tool:
```
mcp_supabase-mcp-server_apply_migration with:
- project_id: YOUR_PROJECT_ID
- name: descriptive_migration_name
- query: YOUR_SQL
```

## Execute Query (SELECT/INSERT/UPDATE)
Use Supabase MCP tool:
```
mcp_supabase-mcp-server_execute_sql with:
- project_id: YOUR_PROJECT_ID
- query: YOUR_SQL
```

## Common Queries

### Check Recent Orders
```sql
SELECT id, status, total, customer_email, created_at 
FROM orders 
ORDER BY created_at DESC 
LIMIT 10;
```

### Check Payment Transactions
```sql
SELECT razorpay_payment_id, status, amount, user_email, created_at 
FROM payment_transactions 
ORDER BY created_at DESC 
LIMIT 10;
```

### Check Active Users
```sql
SELECT email, name, created_at 
FROM users 
ORDER BY created_at DESC 
LIMIT 20;
```

### Find Duplicate Payments
```sql
SELECT razorpay_payment_id, COUNT(*) 
FROM payment_transactions 
GROUP BY razorpay_payment_id 
HAVING COUNT(*) > 1;
```

## Security Check
Run security advisors:
```
mcp_supabase-mcp-server_get_advisors with type: "security"
```
