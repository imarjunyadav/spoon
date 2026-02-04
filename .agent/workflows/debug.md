---
description: Debug common issues in the Spoon application
---

# Debugging Guide

## Server Issues

### Port Already in Use (EADDRINUSE)
```powershell
Get-NetTCPConnection -LocalPort 7070 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

### Check Server Logs
Server logs appear in the terminal running `node backend/server.js`

## Payment Issues

### Check Payment Flow
1. Check browser console for errors (F12 → Console)
2. Check `backend/routes/payment.js` logs
3. Verify Razorpay webhook status in Razorpay Dashboard

### Common Payment Errors
| Error | Cause | Fix |
|-------|-------|-----|
| FK Violation | Email mismatch | Check `payment.notes.email` priority |
| Price mismatch | Cart manipulation | Server validates prices |
| Order not created | Webhook failed | Check webhook logs |

## Database Issues

### Orders Not Showing
```sql
SELECT * FROM orders WHERE customer_email = 'user@example.com' ORDER BY created_at DESC LIMIT 5;
```

### Check RLS Policies
```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'orders';
```

## Frontend Issues

### CSS Not Loading
- Check paths in HTML (should be `../css/filename.css`)
- Clear browser cache (Ctrl+Shift+R)

### JavaScript Errors
1. Open browser DevTools (F12)
2. Check Console tab for errors
3. Check Network tab for failed requests

## Redis/OTP Issues

### OTP Not Sending
1. Check email service (Nodemailer config)
2. Check rate limiting (5 OTPs per 15 min)
3. Redis fallback uses in-memory store

### Check Redis Connection
Look for `[Redis] Using in-memory fallback` in server logs
