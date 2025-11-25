# 🌐 AutoLabel - LAN Setup Guide

## Cấu hình hiện tại

**IP máy chủ:** `10.10.36.36`
**Backend:** `http://10.10.36.36:8000`
**Frontend:** `http://10.10.36.36:5173`

---

## 🚀 Hướng dẫn khởi động

### Bước 1: Cấu hình Firewall (một lần duy nhất)

**Chạy PowerShell as Administrator:**

```powershell
cd E:\VietDynamic\AutoLabel
.\setup_firewall.ps1
```

Script này sẽ tự động:
- Mở port 8000 (Backend)
- Mở port 5173 (Frontend)
- Cho phép truy cập từ mạng LAN

### Bước 2: Cập nhật Google OAuth (một lần duy nhất)

1. Truy cập: https://console.cloud.google.com/apis/credentials
2. Chọn OAuth 2.0 Client ID của bạn
3. Thêm các URI sau:

**Authorized JavaScript origins:**
```
http://10.10.36.36:5173
```

**Authorized redirect URIs:**
```
http://10.10.36.36:8000/auth/callback
```

4. Lưu thay đổi

### Bước 3: Khởi động servers

**Chạy PowerShell bình thường:**

```powershell
cd E:\VietDynamic\AutoLabel
.\dev_start_lan.ps1
```

Script này sẽ:
- Khởi động Backend server (port 8000)
- Khởi động Frontend server (port 5173)
- Hiển thị URL để chia sẻ

---

## 👥 Hướng dẫn cho người dùng khác

### Yêu cầu:
- Cùng mạng WiFi với máy chủ (10.10.36.36)
- Trình duyệt web hiện đại (Chrome, Edge, Firefox)

### Truy cập:
1. Mở trình duyệt
2. Truy cập: **http://10.10.36.36:5173**
3. Đăng nhập bằng Google Account (email @fpt.edu.vn)

---

## 🛠️ Các lệnh hữu ích

### Khởi động thủ công (nếu cần)

**Backend:**
```powershell
cd E:\VietDynamic\AutoLabel
.\run_backend.ps1
```

**Frontend:**
```powershell
cd E:\VietDynamic\AutoLabel
.\run_frontend.ps1
```

### Dừng servers

Trong cửa sổ PowerShell đang chạy server, nhấn:
```
Ctrl + C
```

### Kiểm tra ports đang sử dụng

```powershell
# Kiểm tra port 8000
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

# Kiểm tra port 5173
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
```

### Dừng process đang chiếm port

```powershell
# Tìm process ID
$port = Get-NetTCPConnection -LocalPort 8000
$port.OwningProcess

# Dừng process
Stop-Process -Id <PID> -Force
```

---

## ⚠️ Lưu ý quan trọng

### 1. IP động
- Nếu IP máy bạn thay đổi (DHCP), cần:
  - Cập nhật lại `server/.env` và `client/.env`
  - Cập nhật Google OAuth redirect URIs
  - Chạy lại `.\dev_start_lan.ps1`

### 2. Bảo mật
- Chỉ dùng trong mạng nội bộ tin cậy
- Không expose ra Internet
- Database nằm trên máy chủ, cần backup định kỳ

### 3. Performance
- Tất cả người dùng sẽ dùng chung database và resources máy chủ
- Tốc độ phụ thuộc vào:
  - Cấu hình máy chủ
  - Băng thông mạng LAN
  - Số người dùng đồng thời

### 4. Quản lý người dùng
- Admin email: `longtqse172269@fpt.edu.vn`
- Chỉ email này có quyền admin
- Users khác đăng nhập bằng @fpt.edu.vn sẽ là user thường

---

## 🔧 Troubleshooting

### Vấn đề: "Cannot connect to backend"
**Giải pháp:**
1. Kiểm tra Backend đang chạy: `Get-Process | Where-Object {$_.Name -like "*uvicorn*"}`
2. Kiểm tra Firewall đã cấu hình: `Get-NetFirewallRule -DisplayName "AutoLabel*"`
3. Ping IP: `ping 10.10.36.36`

### Vấn đề: "OAuth redirect error"
**Giải pháp:**
1. Kiểm tra Google OAuth settings
2. Đảm bảo redirect URI đúng: `http://10.10.36.36:8000/auth/callback`
3. Clear browser cache và thử lại

### Vấn đề: "Port already in use"
**Giải pháp:**
```powershell
# Tìm và dừng process
Get-NetTCPConnection -LocalPort 8000 | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force
}
```

### Vấn đề: "Cannot access from other computers"
**Giải pháp:**
1. Chạy lại `setup_firewall.ps1` as Administrator
2. Kiểm tra Windows Firewall service đang chạy
3. Kiểm tra cùng mạng WiFi
4. Thử tắt antivirus tạm thời để test

---

## 📊 Monitoring

### Xem logs

**Backend logs:** Trong cửa sổ PowerShell chạy Backend
**Frontend logs:** Trong cửa sổ PowerShell chạy Frontend

### Kiểm tra health

```powershell
# Backend health
curl http://10.10.36.36:8000/health

# Frontend
curl http://10.10.36.36:5173
```

---

## 🔄 Cập nhật code

Sau khi cập nhật code:

```powershell
# Dừng servers (Ctrl+C ở cả 2 cửa sổ)

# Pull code mới
git pull

# Cài đặt dependencies (nếu có thay đổi)
cd client
npm install
cd ..

# Khởi động lại
.\dev_start_lan.ps1
```

---

## 📱 Liên hệ

**Admin:** longtqse172269@fpt.edu.vn

**Báo lỗi:** Tạo issue trên GitHub hoặc liên hệ admin

---

*Cập nhật lần cuối: 2025-11-24*
