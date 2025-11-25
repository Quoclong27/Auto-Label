# Run backend with proper environment (PowerShell)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Load environment variables from server/.env
$envFile = "server\.env"
if (Test-Path $envFile) {
    Write-Host "Loading environment from $envFile"
    foreach ($line in Get-Content $envFile) {
        if ($line -and -not $line.StartsWith("#")) {
            $parts = $line -split "=", 2
            if ($parts.Length -eq 2) {
                $name, $value = $parts
                Set-Item -Path "env:$($name.Trim())" -Value $value.Trim()
            }
        }
    }
}

# Use default values if env vars are not set
if (-not $env:BACKEND_HOST) {
    $backendHost = "0.0.0.0"
} else {
    $backendHost = $env:BACKEND_HOST
}

if (-not $env:BACKEND_PORT) {
    $backendPort = "8000"
} else {
    $backendPort = $env:BACKEND_PORT
}

Write-Host "Starting Backend Server..." -ForegroundColor Cyan
Write-Host "BACKEND_URL: $env:BACKEND_URL" -ForegroundColor Green
Write-Host "BACKEND_HOST: $backendHost (listening on all interfaces)" -ForegroundColor Green
Write-Host "BACKEND_PORT: $backendPort" -ForegroundColor Green
Write-Host "Access from LAN: http://10.10.36.36:8000" -ForegroundColor Yellow
Write-Host ""

conda run -n auto_label python -m uvicorn server.main:app --host $backendHost --port $backendPort --reload
