---
description: Weekly maintenance and health checks
---

# Weekly Maintenance

## 1. Security Audit
Run Supabase security advisor:
```
mcp_supabase-mcp-server_get_advisors with type: "security"
```

Check for:
- Missing RLS policies
- Exposed sensitive data
- Weak constraints

## 2. Performance Check
Run Supabase performance advisor:
```
mcp_supabase-mcp-server_get_advisors with type: "performance"
```

Check for:
- Missing indexes
- Slow queries
- Table bloat

## 3. Database Cleanup

### Delete Old Test Orders (> 30 days)
```sql
DELETE FROM orders 
WHERE status = 'PICKED_UP' 
AND created_at < NOW() - INTERVAL '30 days';
```

### Check Table Sizes
```sql
SELECT 
    relname as table,
    pg_size_pretty(pg_total_relation_size(relid)) as size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

## 4. Dependency Updates
// turbo
```bash
npm outdated
```

To update (be careful):
```bash
npm update
```

## 5. Git Cleanup
// turbo
```bash
git fetch --prune
git branch -vv
```

## 6. Logs Review
Check Cloud Run logs (if deployed):
```bash
gcloud logging read "resource.type=cloud_run_revision" --limit 100
```

## 7. Backup Check
Ensure Supabase automatic backups are enabled in dashboard
