# AutoLabel - Windows Firewall Setup
# Run as Administrator

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         🔒 AutoLabel - Firewall Configuration             ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ Error: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please:" -ForegroundColor Yellow
    Write-Host "  1. Right-click on PowerShell" -ForegroundColor White
    Write-Host "  2. Select 'Run as Administrator'" -ForegroundColor White
    Write-Host "  3. Run this script again" -ForegroundColor White
    Write-Host ""
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "🔍 Checking existing firewall rules..." -ForegroundColor Cyan

# Remove existing rules if any
$existingBackend = Get-NetFirewallRule -DisplayName "AutoLabel Backend" -ErrorAction SilentlyContinue
if ($existingBackend) {
    Write-Host "   Removing old 'AutoLabel Backend' rule..." -ForegroundColor Gray
    Remove-NetFirewallRule -DisplayName "AutoLabel Backend" -ErrorAction SilentlyContinue
}

$existingFrontend = Get-NetFirewallRule -DisplayName "AutoLabel Frontend" -ErrorAction SilentlyContinue
if ($existingFrontend) {
    Write-Host "   Removing old 'AutoLabel Frontend' rule..." -ForegroundColor Gray
    Remove-NetFirewallRule -DisplayName "AutoLabel Frontend" -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "➕ Adding new firewall rules..." -ForegroundColor Cyan

try {
    # Add backend rule
    New-NetFirewallRule `
        -DisplayName "AutoLabel Backend" `
        -Direction Inbound `
        -LocalPort 8000 `
        -Protocol TCP `
        -Action Allow `
        -Profile Any `
        -Description "Allow AutoLabel Backend API (port 8000) for LAN access" | Out-Null
    
    Write-Host "   ✓ Backend (Port 8000): Allowed" -ForegroundColor Green
    
    # Add frontend rule
    New-NetFirewallRule `
        -DisplayName "AutoLabel Frontend" `
        -Direction Inbound `
        -LocalPort 5173 `
        -Protocol TCP `
        -Action Allow `
        -Profile Any `
        -Description "Allow AutoLabel Frontend (port 5173) for LAN access" | Out-Null
    
    Write-Host "   ✓ Frontend (Port 5173): Allowed" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║          ✅ Firewall Configured Successfully!             ║" -ForegroundColor Green
    Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Firewall Rules Added:" -ForegroundColor White
    Write-Host "   • AutoLabel Backend (Port 8000)" -ForegroundColor Gray
    Write-Host "   • AutoLabel Frontend (Port 5173)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🎉 You can now share your application with team members on the same network!" -ForegroundColor Yellow
    Write-Host "   Access URL: http://10.10.36.36:5173" -ForegroundColor Cyan
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Error configuring firewall:" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check if Windows Firewall service is running." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
