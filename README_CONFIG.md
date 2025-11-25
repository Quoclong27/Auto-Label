# Hướng dẫn Cấu hình IP và Port

## 📋 File Cấu hình

### Frontend (`client/.env`)
```env
VITE_BACKEND_HOST=10.10.36.36
VITE_BACKEND_PORT=8000
VITE_API_URL=http://10.10.36.36:8000
```

### Backend (task.bat)
```powershell
$env:BACKEND_HOST="10.10.36.36"
$env:BACKEND_PORT="8000"
$env:BACKEND_URL="http://10.10.36.36:8000"
```

## 🔄 Cách Thay đổi IP

Khi IP server thay đổi (ví dụ từ `10.10.36.36` sang `192.168.1.100`):

### Bước 1: Cập nhật Frontend
Mở file `client/.env` và thay đổi:
```env
VITE_BACKEND_HOST=192.168.1.100        # Thay đổi IP ở đây
VITE_BACKEND_PORT=8000                  # (giữ nguyên nếu không đổi port)
VITE_API_URL=http://192.168.1.100:8000  # Cập nhật lại URL
```

### Bước 2: Cập nhật Backend
Mở file `task.bat` và thay đổi:
```powershell
$env:BACKEND_HOST="192.168.1.100"       # Thay đổi IP ở đây
$env:BACKEND_URL="http://192.168.1.100:8000"  # Cập nhật lại URL
```

## 🚀 Cách Chạy

### Frontend
```bash
cd client
npm run dev  # Sẽ chạy ở http://VITE_FRONTEND_HOST:VITE_FRONTEND_PORT
```

### Backend
```bash
# Windows
task.bat  # Sẽ load các biến môi trường từ file

# Hoặc chạy thủ công
$env:BACKEND_HOST="10.10.36.36"
$env:BACKEND_PORT="8000"
uvicorn server.main:app --host $env:BACKEND_HOST --port $env:BACKEND_PORT
```

## ✅ Kiểm tra Kết nối

1. **Frontend nhìn thấy Backend không?**
   - Mở DevTools (F12) → Console
   - Kiểm tra network requests (Network tab)
   - API URL phải là: `http://10.10.36.36:8000` (hoặc IP bạn set)

2. **Backend nhận request từ Frontend không?**
   - Mở terminal backend
   - Kiểm tra log khi gửi request

## 📝 Ghi chú

- **Port 5173**: Frontend (Vite dev server)
- **Port 8000**: Backend (FastAPI)
- **IP 10.10.36.36**: Server IP (thay đổi theo nhu cầu)
- Cổng nên giữ nguyên trừ khi có xung đột

## 🔐 Các biến khác

Các biến khác trong `task.bat` không cần thay đổi nếu không có yêu cầu đặc biệt:
- `GOOGLE_CLIENT_ID`: OAuth credential (do hệ thống cấp)
- `ADMIN_EMAIL`: Email admin (tuỳ chọn)
- `GOOGLE_CLIENT_SECRET`: Bí mật OAuth (do hệ thống cấp)
