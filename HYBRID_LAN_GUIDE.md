# 🌐 Hybrid LAN Access Guide

## ⚠️ IMPORTANT: Google OAuth Limitation!

**Google OAuth does NOT accept private IP addresses** (like `10.10.36.36`) as redirect URIs.  
Only accepts: `localhost`, `127.0.0.1`, or public domains (`.com`, `.org`, etc.)

**Solutions:**
- **Easiest**: Cookie Sharing - see `QUICK_LAN_GUIDE.md`
- **Best for dev**: Dev Login Endpoint - see `QUICK_LAN_GUIDE.md`
- **Advanced**: SSH Tunneling - see `LAN_LOCALHOST_TUNNEL.md`

## Cách hoạt động

**Dynamic OAuth with LAN support:**
- Backend/Frontend listen trên `0.0.0.0` (nhận từ mọi IP)
- OAuth redirect URI tự động thay đổi theo hostname:
  - Truy cập từ `localhost` → redirect về `localhost:8000/auth/callback`
  - Truy cập từ `10.10.36.36` → redirect về `10.10.36.36:8000/auth/callback`
- Session: Cookie hoạt động cho cả localhost và LAN IP

## 🚀 Hướng dẫn sử dụng

### Cho chủ máy (bạn):

#### 1. Khởi động servers:
```powershell
cd E:\VietDynamic\AutoLabel

# Terminal 1: Backend
.\run_backend.ps1

# Terminal 2: Frontend
.\run_frontend.ps1
```

#### 2. Đăng nhập lần đầu:
- Mở browser: `http://localhost:5173`
- Đăng nhập bằng Google (@fpt.edu.vn)
- ✅ OAuth hoạt động bình thường

#### 3. Sau khi đăng nhập:
Bạn có thể truy cập bằng cả 2 cách:
- `http://localhost:5173` (localhost)
- `http://10.10.36.36:5173` (LAN IP)

### Cho đồng nghiệp (cùng WiFi):

#### ✅ Cách 1: Đăng nhập trực tiếp (RECOMMENDED)
**Sau khi đã setup Google OAuth redirect URI:**

1. Đồng nghiệp mở browser: `http://10.10.36.36:5173`
2. Click "Sign in with Google"
3. Đăng nhập bằng @fpt.edu.vn
4. ✅ OAuth redirect về `http://10.10.36.36:8000/auth/callback` → Đăng nhập thành công!

**Lưu ý:** 
- Phải đã thêm `http://10.10.36.36:8000/auth/callback` vào Google OAuth (xem `GOOGLE_OAUTH_LAN_SETUP.md`)
- Nếu chưa setup, OAuth sẽ lỗi "redirect_uri_mismatch"

#### Cách 2: Remote login (nếu chưa setup OAuth)
1. Remote Desktop vào máy bạn (AnyDesk/TeamViewer)
2. Mở browser trên máy bạn: `http://localhost:5173`
3. Đăng nhập Google
4. ✅ Sau đó có thể thoát remote và dùng `http://10.10.36.36:5173` trên máy của họ

#### Cách 3: Share session (Fallback)
Chỉ dùng nếu OAuth không hoạt động:

1. Bạn đăng nhập trên `http://localhost:5173`
2. Mở DevTools (F12) → Application → Cookies
3. Copy cookie `user_email`
4. Đồng nghiệp:
   - Mở `http://10.10.36.36:5173`
   - F12 → Console
   - Chạy: `document.cookie = "user_email=longtqse172269@fpt.edu.vn; path=/"`
   - Refresh trang
   - ✅ Đã đăng nhập!

## 🔧 Setup (một lần duy nhất)

### 1. Firewall:
```powershell
# Run as Administrator
.\setup_firewall.ps1
```

### 2. Google OAuth (REQUIRED):
**Must add both redirect URIs:**
- ✅ `http://localhost:8000/auth/callback` (for localhost access)
- ✅ `http://10.10.36.36:8000/auth/callback` (for LAN access)

See detailed setup: `GOOGLE_OAUTH_LAN_SETUP.md`

### 3. File hosts (Optional - cho đồng nghiệp):
Mỗi đồng nghiệp có thể thêm vào `C:\Windows\System32\drivers\etc\hosts`:
```
10.10.36.36  autolabel.local
```

Sau đó truy cập: `http://autolabel.local:5173`

## 🎯 Quy trình làm việc khuyến nghị

### Setup ban đầu (1 lần):
1. Bạn: Chạy `.\setup_firewall.ps1`
2. Bạn: Chạy `.\run_backend.ps1` và `.\run_frontend.ps1`
3. Bạn: Login trên `http://localhost:5173`

### Hàng ngày:
1. Bạn: Start servers
2. Bạn: Login trên localhost
3. Team: Truy cập `http://10.10.36.36:5173`
4. Team: Copy cookie từ bạn (hoặc remote login 1 lần)

## 🔐 Quản lý Session

### Kiểm tra session:
```javascript
// Trong Console (F12)
document.cookie
```

### Set session thủ công:
```javascript
// Sau khi bạn login, share user_email với team
document.cookie = "user_email=EMAIL@fpt.edu.vn; path=/"
location.reload()
```

### Clear session:
```javascript
document.cookie = "user_email=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/"
location.reload()
```

## ⚠️ Lưu ý

### Session Security:
- Cookie được set cho domain, không phân biệt localhost vs LAN IP
- Team member có thể impersonate nếu biết email
- **Chỉ dùng trong mạng nội bộ tin cậy**

### OAuth Limitation:
- Không thể login trực tiếp qua LAN IP
- Phải login qua localhost trước
- Session sau đó hoạt động trên cả localhost và LAN IP

### IP Changes:
- Nếu IP máy bạn đổi (DHCP), cập nhật:
  - `server/.env` → `LAN_IP`
  - Thông báo team về IP mới

## 🛠️ Troubleshooting

### Team không vào được LAN IP:
```powershell
# Kiểm tra firewall
Get-NetFirewallRule -DisplayName "AutoLabel*"

# Kiểm tra servers đang chạy
Get-Process | Where-Object {$_.Name -like "*uvicorn*"}
Get-Process | Where-Object {$_.Name -like "*node*"}

# Test kết nối
Test-NetConnection -ComputerName 10.10.36.36 -Port 8000
Test-NetConnection -ComputerName 10.10.36.36 -Port 5173
```

### OAuth không hoạt động:
- ✅ Chỉ hoạt động trên localhost
- ❌ Không hoạt động trên LAN IP (Google limitation)
- **Giải pháp:** Login trên localhost, sau đó dùng LAN IP

### Cookie không work:
```powershell
# Xóa tất cả cookies và thử lại
# Chrome: Settings → Privacy → Clear browsing data → Cookies
```

## 📊 URLs Tham khảo

| URL | Dùng cho | OAuth |
|-----|----------|-------|
| `http://localhost:5173` | Chủ máy login | ✅ |
| `http://localhost:8000` | Backend local | ✅ |
| `http://10.10.36.36:5173` | Team access | ❌ |
| `http://10.10.36.36:8000` | Backend LAN | ❌ |

---

**Tip:** Tạo 1 tài khoản "shared" (@fpt.edu.vn) cho team cùng dùng, bạn login 1 lần và share session.
