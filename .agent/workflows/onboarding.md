---
description: Setup guide for new developers on this workspace
---

# 🚀 Workspace Onboarding

Welcome to the **Spoon** project! Follow these steps to set up your local development environment.

## 1. Prerequisites
- [Node.js v20+](https://nodejs.org/)
- [Git](https://git-scm.com/)
- [VS Code](https://code.visualstudio.com/)

## 2. Install Dependencies
// turbo
```bash
npm install
```

## 3. Environment Configuration
Create a `.env` file in the root directory (do not commit this!).
Ask the project lead for these values:

```ini
# Database (Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-secret-key

# Payment (Razorpay)
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

# Cache (Upstash Redis)
REDIS_URL=redis://default:password@host:port
```

## 4. Run the Project
Start the dev server:
// turbo
```bash
node backend/server.js
```

## 5. Verify Setup
1. Open http://localhost:7070/public/index.html
2. Try to log in (use any email in dev mode if Redis fallback is active)
3. Check "Admin Dashboard" at http://localhost:7070/admin/admin-mobile.html

## 6. Project Structure
- `public/`: User-facing HTML (Menu, Cart, Orders)
- `admin/`: Kitchen display HTML
- `backend/`: Node.js Express API
- `js/`: Client-side logic (Vanilla JS)
- `css/`: Stylesheets

## 📚 Essential Workflows
- **Deploy**: `./deploy.ps1`
- **Restart Server**: See `.agent/workflows/server.md`
- **Debug**: See `.agent/workflows/debug.md`
