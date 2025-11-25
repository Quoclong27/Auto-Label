# ============================================
# Script: Push code lên GitHub
# ============================================
# 
# Bước 1: Tạo repo trên GitHub web
# - Vào: https://github.com/new
# - Repository name: autolabel
# - Visibility: Private (khuyến nghị)
# - Click "Create repository"
# 
# Bước 2: Copy URL (ví dụ: https://github.com/yourusername/autolabel.git)
#
# Bước 3: Thay YOUR_GITHUB_URL bên dưới và chạy script này
# ============================================

# ⚠️ THAY ĐỔI URL NÀY:
$GITHUB_URL = "https://github.com/yourusername/autolabel.git"

Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Green

# Add remote
git remote add origin $GITHUB_URL

# Rename branch to main (GitHub standard)
git branch -M main

# Push code
git push -u origin main

Write-Host "✅ Done! Check your GitHub repo: $GITHUB_URL" -ForegroundColor Green
