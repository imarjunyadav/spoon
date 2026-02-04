---
description: Deploy to Google Cloud Run (production or staging)
---

# Deploy to Google Cloud Run

## Prerequisites
- Google Cloud SDK installed (`gcloud` command available)
- Logged in: `gcloud auth login`
- Project set: `gcloud config set project YOUR_PROJECT_ID`

## Steps

### 1. Ensure Clean Working Directory
// turbo
```bash
git status
```

### 2. Run Local Tests (Optional)
// turbo
```bash
npm test
```

### 3. Build and Deploy
```bash
gcloud run deploy spoon-backend \
  --source . \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 10 \
  --port 7070
```

### 4. Set Environment Variables (First Time Only)
```bash
gcloud run services update spoon-backend --region asia-south1 \
  --set-env-vars "NODE_ENV=production,SUPABASE_URL=xxx,SUPABASE_SERVICE_ROLE_KEY=xxx,RAZORPAY_KEY_ID=xxx,RAZORPAY_SECRET=xxx,REDIS_URL=xxx"
```

### 5. Verify Deployment
// turbo
```bash
curl -s https://YOUR_CLOUD_RUN_URL/api/health
```

## Rollback
```bash
gcloud run services update-traffic spoon-backend --to-revisions=PREVIOUS_REVISION=100 --region asia-south1
```
