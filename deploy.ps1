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

# 5. Load Environment Variables from backend/.env
Write-Host "`n[SETUP] Loading Environment Variables from backend/.env..." -ForegroundColor Cyan
$envParams = @()
$envParams += "NODE_ENV=production"

$envFile = "backend\.env"

if (Test-Path $envFile) {
    $lines = Get-Content $envFile
    foreach ($line in $lines) {
        # Skip comments and empty lines
        if ($line.Trim().StartsWith("#") -or [string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        # Parse KEY=VALUE
        if ($line -match "^([^=]+)=(.*)$") {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            
            # Map specific keys if needed, otherwise pass through
            if ($key -in @("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RAZORPAY_KEY_ID", "RAZORPAY_SECRET", "SMTP_EMAIL", "SMTP_PASSWORD", "REDIS_URL")) {
                $envParams += "$key=$value"
                Write-Host "   + Loaded $key" -ForegroundColor Gray
            }
            
            # Also handle the special webhook secret mapping
            if ($key -eq "RAZORPAY_SECRET") {
                $envParams += "RAZORPAY_WEBHOOK_SECRET=$value"
                Write-Host "   + Loaded RAZORPAY_WEBHOOK_SECRET (from RAZORPAY_SECRET)" -ForegroundColor Gray
            }
        }
    }
    Write-Host "[OK] Environment variables loaded." -ForegroundColor Green
}
else {
    Write-Error "[ERROR] backend/.env file not found! Deployment cannot proceed safely."
    exit 1
}

# Join into comma-separated string for gcloud
$envVars = $envParams -join ","

# 6. Deploy
Write-Host "`n[ACTION] Deploying to Cloud Run (Region: asia-south1)..." -ForegroundColor Cyan
Write-Host "[INFO] This will take 2-5 minutes." -ForegroundColor Yellow

# Note: Added --update-env-vars to ensures keys are refreshed on every deploy
$deployCommand = "gcloud run deploy spoon-backend --source . --platform managed --region asia-south1 --allow-unauthenticated --min-instances 0 --max-instances 3 --memory 512Mi --cpu 1 --concurrency 80 --timeout 30s --port 7070 --update-env-vars ""$envVars"""

# Execute
Invoke-Expression $deployCommand

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCESS] Deployment Complete!" -ForegroundColor Green
    Write-Host "Check the URL above to access your API."
} else {
    Write-Error "`n[FAIL] Deployment Failed. Please check the logs above."
    exit 1
}
