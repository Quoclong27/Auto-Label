# AutoLabel - LAN Mode Startup Script
# IP Address: 10.10.36.36

$YOUR_IP = "10.10.36.36"
$BACKEND_PORT = 8000
$FRONTEND_PORT = 5173

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          🚀 AutoLabel - LAN Mode Startup                  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "📡 Backend:  http://${YOUR_IP}:${BACKEND_PORT}" -ForegroundColor Green
Write-Host "🌐 Frontend: http://${YOUR_IP}:${FRONTEND_PORT}" -ForegroundColor Green
Write-Host ""
Write-Host "✨ Share this URL with your team:" -ForegroundColor Yellow
Write-Host "   http://${YOUR_IP}:${FRONTEND_PORT}" -ForegroundColor Cyan
Write-Host ""

# Check if ports are available
$backendPort = Get-NetTCPConnection -LocalPort $BACKEND_PORT -ErrorAction SilentlyContinue
$frontendPort = Get-NetTCPConnection -LocalPort $FRONTEND_PORT -ErrorAction SilentlyContinue

if ($backendPort) {
    Write-Host "⚠️  Port $BACKEND_PORT is already in use. Please close the other instance first." -ForegroundColor Yellow
    Write-Host "   Run: Get-Process -Id $($backendPort.OwningProcess) | Stop-Process -Force" -ForegroundColor Gray
    Write-Host ""
}

if ($frontendPort) {
    Write-Host "⚠️  Port $FRONTEND_PORT is already in use. Please close the other instance first." -ForegroundColor Yellow
    Write-Host "   Run: Get-Process -Id $($frontendPort.OwningProcess) | Stop-Process -Force" -ForegroundColor Gray
    Write-Host ""
}

# Start backend
Write-Host "🔧 Starting Backend Server..." -ForegroundColor Cyan
$backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; .\run_backend.ps1" -PassThru
Write-Host "   Backend started (PID: $($backendProcess.Id))" -ForegroundColor Gray

# Wait for backend to initialize
Write-Host "   Waiting for backend to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Start frontend
Write-Host "🔧 Starting Frontend Server..." -ForegroundColor Cyan
$frontendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; .\run_frontend.ps1" -PassThru
Write-Host "   Frontend started (PID: $($frontendProcess.Id))" -ForegroundColor Gray

# Wait a bit for frontend to start
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              ✅ Servers Started Successfully!              ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   1. Configure Windows Firewall (Run as Administrator):" -ForegroundColor White
Write-Host "      .\setup_firewall.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "   2. Update Google OAuth Settings:" -ForegroundColor White
Write-Host "      https://console.cloud.google.com/apis/credentials" -ForegroundColor Cyan
Write-Host ""
Write-Host "      Add these URIs:" -ForegroundColor White
Write-Host "      • Authorized JavaScript origins:" -ForegroundColor Gray
Write-Host "        http://${YOUR_IP}:${FRONTEND_PORT}" -ForegroundColor Gray
Write-Host "      • Authorized redirect URIs:" -ForegroundColor Gray
Write-Host "        http://${YOUR_IP}:${BACKEND_PORT}/auth/callback" -ForegroundColor Gray
Write-Host ""
Write-Host "   3. Share the URL with your team:" -ForegroundColor White
Write-Host "      http://${YOUR_IP}:${FRONTEND_PORT}" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Tips:" -ForegroundColor Yellow
Write-Host "   • Keep this window open" -ForegroundColor Gray
Write-Host "   • Backend and Frontend are running in separate windows" -ForegroundColor Gray
Write-Host "   • Press Ctrl+C in those windows to stop servers" -ForegroundColor Gray
Write-Host ""
Write-Host "Press any key to close this window..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
