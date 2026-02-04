---
description: Manage the local Node.js development environment
---

# 💻 Dev Server Control

**Port:** `7070`
**Entry Point:** `backend/server.js`

## 🟢 Start Server
// turbo
```bash
node backend/server.js
```
*Accessible at: http://localhost:7070/public/index.html*

## 🔴 Force Stop (Kill Port 7070)
Used when you see `EADDRINUSE` errors.
```powershell
Get-NetTCPConnection -LocalPort 7070 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

## 🟡 Restart Server
Combines stop and start.
```powershell
Get-NetTCPConnection -LocalPort 7070 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }; Start-Sleep -Seconds 1; node backend/server.js
```

## 🩺 Health Check
Quickly verify the API is responding.
// turbo
```bash
curl -s http://localhost:7070/api/health
```

## 📂 Project Structure Map
- **Frontend**: http://localhost:7070/public/index.html
- **Admin**: http://localhost:7070/admin/admin-mobile.html
- **API**: http://localhost:7070/api/
- **Webhooks**: http://localhost:7070/api/payment/verify-payment
