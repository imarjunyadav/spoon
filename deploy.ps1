Write-Host ">>> Starting Spoon Deployment to Google Cloud Run..." -ForegroundColor Cyan

# 1. Check for gcloud
if (!(Get-Command "gcloud" -ErrorAction SilentlyContinue)) {
    Write-Error "[ERROR] Google Cloud SDK (gcloud) is not installed."
    Write-Host "Please install it from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}

# 2. Login Check
Write-Host "`n[INFO] Checking authentication..." -ForegroundColor Yellow
$authStatus = gcloud auth list --format="value(account)"
if (!$authStatus) {
    Write-Host "[WARN] Not logged in. Opening browser for login..." -ForegroundColor Yellow
    gcloud auth login
}
else {
    Write-Host "[OK] Logged in as: $authStatus" -ForegroundColor Green
}

# 3. Project Setup
$projectId = gcloud config get-value project
if (!$projectId) {
    $projectId = Read-Host "`n[INPUT] Enter your Google Cloud Project ID"
    gcloud config set project $projectId
}
Write-Host "[OK] Using Project: $projectId" -ForegroundColor Green

# 4. Enable APIs
Write-Host "`n[INFO] Enabling Cloud Run & Cloud Build APIs (this may take a minute)..." -ForegroundColor Yellow
gcloud services enable cloudbuild.googleapis.com run.googleapis.com

# 5. Environment Variables Prompt
Write-Host "`n[SETUP] Configure Environment Variables (Press Enter to skip if already set)" -ForegroundColor Cyan
$supabaseUrl = Read-Host "Supabase URL"
$supabaseKey = Read-Host "Supabase Service Role Key"
$razorpayKey = Read-Host "Razorpay Key ID"
$razorpaySecret = Read-Host "Razorpay Secret"
$redisUrl = Read-Host "Redis URL (rediss://user:pass@host:port)"
if ([string]::IsNullOrWhiteSpace($redisUrl)) {
    $redisUrl = "rediss://default:AUyqAAIncDIzZmI1ODRmMTFmNWI0M2QyYjliYWMwMDk5YWYzNmIxMnAyMTk2MjY@massive-panda-19626.upstash.io:6379"
}

$envVars = "NODE_ENV=production"
if ($supabaseUrl) { $envVars += ",SUPABASE_URL=$supabaseUrl" }
if ($supabaseKey) { $envVars += ",SUPABASE_SERVICE_ROLE_KEY=$supabaseKey" }
if ($razorpayKey) { $envVars += ",RAZORPAY_KEY_ID=$razorpayKey" }
if ($razorpaySecret) { $envVars += ",RAZORPAY_WEBHOOK_SECRET=$razorpaySecret" }
if ($redisUrl) { $envVars += ",REDIS_URL=$redisUrl" }

# 5a. Fix IAM Permissions (Critical for Cloud Build)
Write-Host "`n[SETUP] Fixing Service Account Permissions..." -ForegroundColor Cyan
$projectNumber = gcloud projects list --filter="projectId:$projectId" --format="value(projectNumber)"
$computeServiceAccount = "$projectNumber-compute@developer.gserviceaccount.com"
$cloudBuildServiceAccount = "$projectNumber@cloudbuild.gserviceaccount.com"

# Grant roles to Compute SA
Write-Host "[INFO] Granting permissions to Compute SA ($computeServiceAccount)..." -ForegroundColor Yellow
gcloud projects add-iam-policy-binding $projectId --member="serviceAccount:$computeServiceAccount" --role="roles/storage.admin" --condition=None --quiet | Out-Null
gcloud projects add-iam-policy-binding $projectId --member="serviceAccount:$computeServiceAccount" --role="roles/logging.logWriter" --condition=None --quiet | Out-Null
gcloud projects add-iam-policy-binding $projectId --member="serviceAccount:$computeServiceAccount" --role="roles/artifactregistry.writer" --condition=None --quiet | Out-Null

# Grant roles to Cloud Build SA (if different)
Write-Host "[INFO] Granting permissions to Cloud Build SA ($cloudBuildServiceAccount)..." -ForegroundColor Yellow
gcloud projects add-iam-policy-binding $projectId --member="serviceAccount:$cloudBuildServiceAccount" --role="roles/logging.logWriter" --condition=None --quiet | Out-Null
gcloud projects add-iam-policy-binding $projectId --member="serviceAccount:$cloudBuildServiceAccount" --role="roles/artifactregistry.writer" --condition=None --quiet | Out-Null

# 6. Deploy
Write-Host "`n[ACTION] Deploying to Cloud Run (Region: asia-south1)..." -ForegroundColor Cyan
Write-Host "[INFO] This will take 2-5 minutes." -ForegroundColor Yellow

$deployCommand = "gcloud run deploy spoon-backend --source . --platform managed --region asia-south1 --allow-unauthenticated --min-instances 0 --max-instances 3 --memory 512Mi --cpu 1 --concurrency 80 --timeout 30s --port 7070 --update-env-vars ""$envVars"""

# Execute and check for error
Invoke-Expression $deployCommand

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCESS] Deployment Complete!" -ForegroundColor Green
    Write-Host "Check the URL above to access your API."
} else {
    Write-Error "`n[FAIL] Deployment Failed. Please check the logs above."
    exit 1
}
