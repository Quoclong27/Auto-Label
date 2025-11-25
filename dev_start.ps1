<#
Dev convenience script: starts backend and frontend in separate PowerShell windows.

Usage: run this from project root with PowerShell
    .\dev_start.ps1

This script starts `run_backend.ps1` and `run_frontend.ps1` (which load env files).
#>

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root

Write-Host "Starting development servers..."

# Start backend in new PowerShell window
$backendScript = Join-Path $root 'run_backend.ps1'
if (Test-Path $backendScript) {
    Start-Process -FilePath powershell -ArgumentList "-NoExit","-ExecutionPolicy","Bypass","-File","$backendScript" -WindowStyle Normal
    Write-Host "Launched backend in new window."
} else {
    Write-Host "run_backend.ps1 not found; please start backend manually." -ForegroundColor Yellow
}

# Start frontend in new PowerShell window
$frontendScript = Join-Path $root 'run_frontend.ps1'
if (Test-Path $frontendScript) {
    Start-Process -FilePath powershell -ArgumentList "-NoExit","-ExecutionPolicy","Bypass","-File","$frontendScript" -WindowStyle Normal
    Write-Host "Launched frontend in new window."
} else {
    Write-Host "run_frontend.ps1 not found; please start frontend manually." -ForegroundColor Yellow
}

Pop-Location

Write-Host "Dev start script executed. Check new windows for server output."
