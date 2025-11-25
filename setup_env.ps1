# ============================================
# CONFIGURATION - Backend & Frontend Settings
# ============================================

# Backend Configuration
$env:BACKEND_HOST="10.10.36.36"
$env:BACKEND_PORT="8000"
$env:BACKEND_URL="http://10.10.36.36:8000"

# Frontend Configuration
$env:FRONTEND_HOST="10.10.36.36"
$env:FRONTEND_PORT="5173"
$env:FRONTEND_URL="http://10.10.36.36:5173"

# OAuth Configuration
$env:GOOGLE_CLIENT_ID="367556225135-3oks7p52e2t3ruf1afgmu5kij3glieqo.apps.googleusercontent.com"
$env:DEV_OAUTH_PERMISSIVE="1"
$env:ADMIN_EMAIL="longtqse172269@fpt.edu.vn"
$env:GOOGLE_CLIENT_SECRET="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"

Write-Host "Environment variables loaded successfully!"
Write-Host "BACKEND_URL: $env:BACKEND_URL"
Write-Host "FRONTEND_URL: $env:FRONTEND_URL"
