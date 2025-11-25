# Run frontend dev server (PowerShell)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$ScriptDir\client"

Write-Host "Frontend environment:" -ForegroundColor Cyan
Write-Host "VITE_API_URL: $env:VITE_API_URL" -ForegroundColor Green
Write-Host "VITE_FRONTEND_PORT: $env:VITE_FRONTEND_PORT" -ForegroundColor Green
Write-Host "Access from LAN: http://10.10.36.36:5173" -ForegroundColor Yellow
Write-Host ""

Write-Host "Starting Frontend Dev Server..." -ForegroundColor Cyan
npm run dev -- --host 0.0.0.0
