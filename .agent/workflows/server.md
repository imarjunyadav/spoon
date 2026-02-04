---
description: Start, stop, or restart the local development server
---

# Server Management

## Start Server
// turbo
```bash
cd c:\Users\arjun\Desktop\spoon\v1
node backend/server.js
```

## Stop Server (Kill Port 7070)
```powershell
Get-NetTCPConnection -LocalPort 7070 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

## Restart Server
1. Stop any running server (command above)
2. Start fresh:
// turbo
```bash
node backend/server.js
```

## Check Server Health
// turbo
```bash
curl -s http://localhost:7070/api/health
```

## URLs
- **User App**: http://localhost:7070/public/index.html
- **Admin**: http://localhost:7070/admin/admin-mobile.html
- **API Health**: http://localhost:7070/api/health
