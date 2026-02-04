---
description: Deploy to Google Cloud Run using the automated script
---

# 🚀 Production Deployment

## The Easy Way (Recommended)
We have an automated PowerShell script that handles authentication, configuration, and deployment in one step.

### Run Deployment Script
// turbo
```powershell
./deploy.ps1
```

**What this script does:**
1. Checks for `gcloud` installation
2. Authenticates your session
3. Sets the project ID
4. Configures environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_WEBHOOK_SECRET`
   - `REDIS_URL`
5. Deploys container to Cloud Run (Region: `asia-south1`)

---

## The Manual Way (Fallback)
If the script fails, run these commands manually from the project root.

### 1. Build and Deploy
```bash
gcloud run deploy spoon-backend ^
  --source . ^
  --platform managed ^
  --region asia-south1 ^
  --allow-unauthenticated ^
  --min-instances 0 ^
  --max-instances 10 ^
  --port 7070
```

### 2. Update Environment Variables
Replace values with your actual secrets.
```bash
gcloud run services update spoon-backend --region asia-south1 ^
  --set-env-vars "NODE_ENV=production" ^
  --set-env-vars "SUPABASE_URL=YOUR_URL" ^
  --set-env-vars "SUPABASE_SERVICE_ROLE_KEY=YOUR_KEY" ^
  --set-env-vars "RAZORPAY_KEY_ID=YOUR_KEY" ^
  --set-env-vars "RAZORPAY_WEBHOOK_SECRET=YOUR_SECRET" ^
  --set-env-vars "REDIS_URL=YOUR_REDIS_URL"
```

## 🔍 Verify Deployment
// turbo
```bash
curl -s https://spoon-backend-YOUR-URL.a.run.app/api/health
```
